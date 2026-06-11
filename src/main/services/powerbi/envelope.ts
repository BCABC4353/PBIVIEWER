// ---------------------------------------------------------------------------
// IPCResponse error-envelope helpers shared by every powerbi/* module.
// ---------------------------------------------------------------------------

import { friendlyApiErrorFromMessage } from '../../../shared/error-mapping';
import type { IPCResponse } from '../../../shared/types';

/**
 * Build an IPCResponse error envelope with a friendly `userMessage` derived
 * from the raw error string. The renderer-facing IPCResponse shape lives in
 * shared/types.ts; `userMessage` is attached via a type assertion and the
 * renderer reads it as an optional field.
 */
export function buildErrorEnvelope(code: string, error: unknown): { code: string; message: string } {
  const message = String(error);
  return {
    code,
    message,
    userMessage: friendlyApiErrorFromMessage(message),
  } as { code: string; message: string; userMessage: string };
}

/**
 * Run `fn` and convert anything it throws into the standard
 * `{ success: false, error: buildErrorEnvelope(code, error) }` envelope.
 * This replaces the fourteen byte-identical catch blocks that used to be
 * copy-pasted under every simple API method (the duplicate-anchor hazard
 * CLAUDE.md warns about). Methods whose catch does MORE than envelope the
 * error (logging a degradation warning, mapping admin error codes, skipping
 * the cache, …) keep their own explicit try/catch instead.
 */
export async function withErrorEnvelope<T>(
  code: string,
  fn: () => Promise<IPCResponse<T>>,
): Promise<IPCResponse<T>> {
  try {
    return await fn();
  } catch (error) {
    return { success: false, error: buildErrorEnvelope(code, error) };
  }
}
