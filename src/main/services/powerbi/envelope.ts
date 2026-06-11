
import { friendlyApiErrorFromMessage } from '../../../shared/error-mapping';
import type { IPCResponse } from '../../../shared/types';

export function buildErrorEnvelope(code: string, error: unknown): { code: string; message: string } {
  const message = String(error);
  return {
    code,
    message,
    userMessage: friendlyApiErrorFromMessage(message),
  } as { code: string; message: string; userMessage: string };
}

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
