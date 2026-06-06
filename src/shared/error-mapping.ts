/**
 * Map HTTP status / Power BI API error shapes to a friendly user message.
 *
 * IMPORTANT: this function does NOT pass raw response bodies through, ever.
 * Upstream API errors can contain user-identifying data (emails, GUIDs, etc.)
 * and authorization-related fragments — surfacing them in the UI would leak
 * identifiers to anyone watching the screen, and capturing them in error logs
 * would leak the same content into support bundles. The `raw` parameter is
 * accepted only for future structured-parsing use (e.g. picking a well-known
 * OData error code out of a parsed JSON body); the current implementation
 * ignores it.
 */
export function friendlyApiError(status: number | undefined, _raw?: string): string {
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this content.';
  if (status === 404) return 'This item was not found. It may have been moved or removed.';
  if (status === 429) return 'Power BI is throttling requests. Please wait a moment and try again.';
  if (status && status >= 500 && status < 600) return 'Power BI is currently unavailable. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

/**
 * Parse a thrown-error message of the form `"<context>: <status> - <body>"`
 * (the shape `throwForStatus` produces in powerbi-api.ts), extract the HTTP
 * status code, and map it to a friendly user-facing message via
 * `friendlyApiError`. If the message doesn't match the pattern, the input
 * is returned unchanged so callers don't accidentally overwrite a more
 * specific message (e.g. token-refresh failures) with a generic one.
 */
export function friendlyApiErrorFromMessage(message: string): string {
  const match = message.match(/:\s*(\d{3})\s*-\s*/);
  if (!match) return message;
  const status = Number(match[1]);
  if (!Number.isFinite(status)) return message;
  return friendlyApiError(status);
}
