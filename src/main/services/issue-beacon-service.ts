import { app } from 'electron';
import log from 'electron-log/main';
import { randomUUID } from 'crypto';
import Store from 'electron-store';
import { beaconConfig } from './beacon-config';


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
  issueNumber?: number;
}

export interface IssueBeaconDeps {
  enabled: boolean;
  includeNames: boolean;
  repo: string;
  token: string;
  appVersion: string;
  platform: string;
  installId: string;
  postJson: (url: string, token: string, body: unknown) => Promise<{ status: number; body?: unknown }>;
  loadIssueNumber: () => number | null;
  saveIssueNumber: (issueNumber: number) => void;
  now: () => number;
  logger: Pick<typeof console, 'warn' | 'info'>;
}

const FLUSH_INTERVAL_MS = 60_000;
const MAX_BUFFER = 50;
const MIN_POST_GAP_MS = 30_000;

export class IssueBeaconService {
  private readonly deps: IssueBeaconDeps;
  private buffer: Array<BeaconEvent & { at: number }> = [];
  private lastPostAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private issueNumber: number | null;

  constructor(deps: IssueBeaconDeps) {
    this.deps = deps;
    this.issueNumber = deps.loadIssueNumber();
  }

  start(): void {
    if (!this.deps.enabled || this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

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
        const title = `beacon: install ${this.deps.installId} (${this.deps.appVersion})`;
        const { status, body: responseBody } = await this.deps.postJson(
          `https://api.github.com/repos/${this.deps.repo}/issues`,
          this.deps.token,
          { title, body },
        );
        if (status < 200 || status >= 300) {
          this.deps.logger.warn('[beacon] issue create failed:', status);
          this.buffer.unshift(...batch);
          return;
        }
        const issueNumber = (responseBody as { number?: unknown } | undefined)?.number;
        if (typeof issueNumber === 'number') {
          this.issueNumber = issueNumber;
          this.deps.saveIssueNumber(issueNumber);
        } else {
          this.deps.logger.warn('[beacon] issue created but response carried no issue number');
        }
        return;
      }
      const { status } = await this.deps.postJson(
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

function openBeaconStore(): Store<BeaconStoreSchema> | null {
  try {
    return new Store<BeaconStoreSchema>({ name: 'beacon' });
  } catch {
    return null;
  }
}

function getOrCreateInstallId(store: Store<BeaconStoreSchema> | null): string {
  try {
    if (store) {
      let id = store.get('installId');
      if (!id) {
        id = randomUUID().slice(0, 8);
        store.set('installId', id);
      }
      return id;
    }
  } catch {
  }
  return randomUUID().slice(0, 8);
}

async function postJsonReal(
  url: string,
  token: string,
  body: unknown,
): Promise<{ status: number; body?: unknown }> {
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
  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = undefined;
  }
  return { status: res.status, body: responseBody };
}

let singleton: IssueBeaconService | null = null;

export function getIssueBeacon(): IssueBeaconService {
  if (singleton) return singleton;
  const enabled = Boolean(beaconConfig.token && beaconConfig.repo);
  if (enabled) {
    log.info('[beacon] enabled →', beaconConfig.repo);
  }
  const store = openBeaconStore();
  singleton = new IssueBeaconService({
    enabled,
    includeNames: beaconConfig.includeNames,
    repo: beaconConfig.repo,
    token: beaconConfig.token,
    appVersion: app.getVersion(),
    platform: process.platform,
    installId: getOrCreateInstallId(store),
    postJson: postJsonReal,
    loadIssueNumber: () => {
      try {
        const n = store?.get('issueNumber');
        return typeof n === 'number' ? n : null;
      } catch {
        return null;
      }
    },
    saveIssueNumber: (issueNumber) => {
      try {
        store?.set('issueNumber', issueNumber);
      } catch {
      }
    },
    now: () => Date.now(),
    logger: console,
  });
  return singleton;
}
