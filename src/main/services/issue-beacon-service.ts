import { app } from 'electron';
import log from 'electron-log/main';
import { randomUUID } from 'crypto';
import Store from 'electron-store';
import { beaconConfig } from './beacon-config';

/**
 * Issue beacon — centralized "it's broken" reporting.
 *
 * When the operator's clients hit errors, the app batches a SANITIZED summary
 * (error code, HTTP status, the affected item's NAME, app version, an anonymous
 * install id, timestamp) and posts it to a GitHub issue thread the operator
 * owns — so "it's broken" can be triaged remotely instead of asking a
 * non-technical user to find and email a log file.
 *
 * PRIVACY / SCOPE (operator-chosen "codes + names"):
 *  - Sends: error code, HTTP status, item NAME (report/dataset/workspace),
 *    app version, anonymous per-install id, timestamps, OS platform.
 *  - NEVER sends: access tokens, JWTs, emails, GUIDs (stripped by the same
 *    redaction the API layer uses), or any DATA VALUE from a report.
 *  - Item names are the most sensitive field transmitted. If any client's data
 *    is regulated (e.g. PHI), set BEACON_INCLUDE_NAMES=false at build time to
 *    drop names and send codes/counts only.
 *
 * DISABLED BY DEFAULT: with no build-time token the beacon is a silent no-op,
 * so a normal build transmits nothing. See docs/ISSUE-BEACON.md.
 */

// Reuse the API layer's redaction posture so a name field can never smuggle a
// token/JWT/email/GUID off the machine.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9._-]{20,}/g, '[JWT]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[GUID]'],
];

function sanitize(text: string, max = 200): string {
  let cleaned = text;
  for (const [pattern, replacement] of REDACT_PATTERNS) cleaned = cleaned.replace(pattern, replacement);
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

export interface BeaconEvent {
  code: string;
  httpStatus?: number;
  itemName?: string;
  context?: string;
}

interface BeaconStoreSchema {
  installId?: string;
}

/** Minimal slice of the dependencies the service needs, so it is unit-testable. */
export interface IssueBeaconDeps {
  enabled: boolean;
  includeNames: boolean;
  /** owner/repo the issue thread lives in. */
  repo: string;
  /** Token with issues:write on `repo` only. Injected at build time. */
  token: string;
  appVersion: string;
  platform: string;
  installId: string;
  /** Injected so tests don't hit the network. Resolves to the HTTP status. */
  postJson: (url: string, token: string, body: unknown) => Promise<number>;
  /** Wall clock, injectable for tests. */
  now: () => number;
  logger: Pick<typeof console, 'warn' | 'info'>;
}

const FLUSH_INTERVAL_MS = 60_000;
const MAX_BUFFER = 50; // drop-oldest beyond this so a crash loop can't grow memory
const MIN_POST_GAP_MS = 30_000; // never post more than ~2x/min, even under a storm

export class IssueBeaconService {
  private readonly deps: IssueBeaconDeps;
  private buffer: Array<BeaconEvent & { at: number }> = [];
  private lastPostAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private issueNumber: number | null = null;

  constructor(deps: IssueBeaconDeps) {
    this.deps = deps;
  }

  /** Begin periodic flushing. No-op when disabled. Idempotent. */
  start(): void {
    if (!this.deps.enabled || this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    // Don't keep the process alive just for the beacon.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Record one error. Cheap + synchronous; the network happens on flush. */
  record(event: BeaconEvent): void {
    if (!this.deps.enabled) return;
    this.buffer.push({
      code: sanitize(event.code, 80),
      httpStatus: event.httpStatus,
      itemName: this.deps.includeNames && event.itemName ? sanitize(event.itemName, 120) : undefined,
      context: event.context ? sanitize(event.context, 120) : undefined,
      at: this.deps.now(),
    });
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
  }

  /** Post buffered events as a comment on the install's issue thread. */
  async flush(): Promise<void> {
    if (!this.deps.enabled || this.buffer.length === 0) return;
    if (this.deps.now() - this.lastPostAt < MIN_POST_GAP_MS) return;
    const batch = this.buffer;
    this.buffer = [];
    this.lastPostAt = this.deps.now();
    try {
      const lines = batch.map((e) => {
        const parts = [
          new Date(e.at).toISOString(),
          e.code,
          e.httpStatus !== undefined ? `HTTP ${e.httpStatus}` : '',
          e.itemName ? `item="${e.itemName}"` : '',
          e.context ? `(${e.context})` : '',
        ].filter(Boolean);
        return `- ${parts.join(' · ')}`;
      });
      const body =
        `**${this.deps.appVersion}** · ${this.deps.platform} · install \`${this.deps.installId}\`\n\n` +
        lines.join('\n');

      if (this.issueNumber === null) {
        // First post this session: open one issue for this install.
        const title = `beacon: install ${this.deps.installId} (${this.deps.appVersion})`;
        const status = await this.deps.postJson(
          `https://api.github.com/repos/${this.deps.repo}/issues`,
          this.deps.token,
          { title, body },
        );
        if (status < 200 || status >= 300) {
          this.deps.logger.warn('[beacon] issue create failed:', status);
          // Re-queue so we retry next flush rather than silently lose the batch.
          this.buffer.unshift(...batch);
        }
        return;
      }
      const status = await this.deps.postJson(
        `https://api.github.com/repos/${this.deps.repo}/issues/${this.issueNumber}/comments`,
        this.deps.token,
        { body },
      );
      if (status < 200 || status >= 300) {
        this.deps.logger.warn('[beacon] comment failed:', status);
        this.buffer.unshift(...batch);
      }
    } catch (err) {
      this.deps.logger.warn('[beacon] flush error (non-fatal):', err);
      this.buffer.unshift(...batch);
    }
  }
}

/** Stable anonymous per-install id, persisted in userData (no PII). */
function getOrCreateInstallId(): string {
  try {
    const store = new Store<BeaconStoreSchema>({ name: 'beacon' });
    let id = store.get('installId');
    if (!id) {
      id = randomUUID().slice(0, 8);
      store.set('installId', id);
    }
    return id;
  } catch {
    // Ephemeral fallback — still anonymous, just not stable across restarts.
    return randomUUID().slice(0, 8);
  }
}

async function postJsonReal(url: string, token: string, body: unknown): Promise<number> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'PBIVIEWER-beacon',
    },
    body: JSON.stringify(body),
  });
  return res.status;
}

let singleton: IssueBeaconService | null = null;

/** Lazily build the production beacon. Disabled unless a token+repo were baked in. */
export function getIssueBeacon(): IssueBeaconService {
  if (singleton) return singleton;
  const enabled = Boolean(beaconConfig.token && beaconConfig.repo);
  if (enabled) {
    log.info('[beacon] enabled →', beaconConfig.repo);
  }
  singleton = new IssueBeaconService({
    enabled,
    includeNames: beaconConfig.includeNames,
    repo: beaconConfig.repo,
    token: beaconConfig.token,
    appVersion: app.getVersion(),
    platform: process.platform,
    installId: getOrCreateInstallId(),
    postJson: postJsonReal,
    now: () => Date.now(),
    logger: console,
  });
  return singleton;
}
