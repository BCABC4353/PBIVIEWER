/**
 * Map HTTP status / Power BI API error shapes to a friendly user message.
 * Used by the renderer when an IPCResponse error needs to be shown verbatim.
 */
export function friendlyApiError(status: number | undefined, raw?: string): string {
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this content.';
  if (status === 404) return 'This item was not found. It may have been moved or removed.';
  if (status === 429) return 'Power BI is throttling requests. Please wait a moment and try again.';
  if (status && status >= 500 && status < 600) return 'Power BI is currently unavailable. Please try again in a moment.';
  if (raw && raw.length > 0 && raw.length < 200) return raw;
  return 'Something went wrong. Please try again.';
}
