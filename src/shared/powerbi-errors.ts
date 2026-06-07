/**
 * Extract a human-readable error message from an unknown Power BI SDK error detail.
 * Handles strings, Error objects, and nested { message, detailedMessage, error } shapes.
 */
export function getErrorMessage(detail: unknown): string {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (detail instanceof Error) return detail.message;
  if (typeof detail === 'object') {
    const anyDetail = detail as Record<string, unknown>;
    const nestedError = anyDetail.error as Record<string, unknown> | undefined;
    return String(
      anyDetail.message ??
        anyDetail.detailedMessage ??
        nestedError?.message ??
        nestedError?.code ??
        anyDetail.errorCode ??
        '',
    );
  }
  return '';
}

/**
 * Check whether a Power BI SDK error detail indicates an expired or invalid token.
 */
export function isTokenExpiredError(detail: unknown): boolean {
  const message = getErrorMessage(detail).toLowerCase();
  return (
    message.includes('tokenexpired') ||
    message.includes('token expired') ||
    message.includes('accesstokenexpired') ||
    message.includes('invalidauthenticationtoken')
  );
}
