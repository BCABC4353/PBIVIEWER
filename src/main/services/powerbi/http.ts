// ---------------------------------------------------------------------------
// HTTP transport for the Power BI REST client: timeout-bounded fetch, retry
// with backoff + Retry-After, status classification, error-body sanitization,
// and the bounded-concurrency mapper the fan-out callers share. Keep this
// module free of electron imports — it is plain fetch plumbing.
// ---------------------------------------------------------------------------

export { POWERBI_API_BASE } from '../../../shared/constants';

export interface PowerBIApiResponse<T> {
  value: T[];
  '@odata.context'?: string;
  '@odata.nextLink'?: string;
}

const FETCH_TIMEOUT_MS = 20000;
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface WithRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}
export async function withRetry<T>(fn: () => Promise<T>, opts: WithRetryOptions = {}): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await fn();
    } catch (err: unknown) {
      // AbortError happens BOTH when our own fetchWithTimeout fires (a true
      // timeout — worth retrying) AND when an external AbortSignal is passed
      // in (an intentional cancel — must NOT be retried). When `init.signal`
      // is supported in the future, this check needs to distinguish them.
      // For now no caller passes an external signal, so AbortError === timeout.
      const errObj = err as { name?: string; retryAfterMs?: number } | null;
      const isRetriable = errObj && (errObj.name === 'RetriableHttpError' || errObj.name === 'AbortError');
      if (!isRetriable || attempt >= max) throw err;
      const retryAfter = (errObj?.retryAfterMs as number | undefined);
      const delay = retryAfter !== undefined ? retryAfter : Math.min(base * Math.pow(2, attempt - 1), 8000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export class RetriableHttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
    this.name = 'RetriableHttpError';
  }
}

/**
 * Non-retriable HTTP failure (plain 4xx). Carries the status code so callers
 * can branch on it — e.g. getDatasetRefreshInfo falls back to the groupless
 * refreshes endpoint when the grouped call comes back 401/403/404.
 */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Run an async mapper over items with at most `limit` in flight at once.
 * Preserves input order in the result. Used to speed up the Insights fan-out
 * (per-dataset refresh-health lookups) without bursting past API throttling.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Parse a Retry-After header value. Returns milliseconds, or undefined if unparseable.
 * Supports both numeric seconds and HTTP-date forms per RFC 7231.
 */
// Cap on any Retry-After we'll honor. A misbehaving (or hostile) upstream
// could send `Retry-After: 99999999` (~27 hours) and freeze the request for
// effectively forever. 60s is well above normal Power BI throttling but small
// enough to bound user-visible delay.
const MAX_RETRY_AFTER_MS = 60_000;

export function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (!trimmed) return undefined;
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.min(Math.round(asInt * 1000), MAX_RETRY_AFTER_MS);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), MAX_RETRY_AFTER_MS);
  }
  return undefined;
}

// Patterns we strip out of upstream HTTP error bodies before composing the
// thrown message — these end up in logs and (sometimes) user-visible toasts,
// and we never want a Bearer fragment, a JWT, an email, or a tenant GUID to
// land in either place. Order-insensitive; redaction is applied before the
// 256-char truncation cap.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]'],
  [/eyJ[A-Za-z0-9._-]{20,}/g, '[JWT REDACTED]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL REDACTED]'],
  [/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '[GUID REDACTED]'],
];

export function sanitizeErrorBody(body: string): string {
  let cleaned = body;
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  // Truncate so a giant upstream body can't bloat the log line.
  return cleaned.length > 256 ? cleaned.slice(0, 256) + '…' : cleaned;
}

/**
 * Classify a non-OK response and throw an appropriate error. 429 and 5xx
 * variants are thrown as RetriableHttpError so withRetry can back off; other
 * 4xx responses throw a plain Error and short-circuit the retry loop.
 */
export async function throwForStatus(response: Response, contextLabel: string): Promise<never> {
  const errorText = await response.text();
  const message = `${contextLabel}: ${response.status} - ${sanitizeErrorBody(errorText)}`;
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'));
    throw new RetriableHttpError(429, message, retryAfterMs);
  }
  if (response.status === 500 || response.status === 503 || response.status === 504) {
    throw new RetriableHttpError(response.status, message);
  }
  throw new HttpError(response.status, message);
}
