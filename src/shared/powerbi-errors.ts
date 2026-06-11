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

export function isTokenExpiredError(detail: unknown): boolean {
  const message = getErrorMessage(detail).toLowerCase();
  return (
    message.includes('tokenexpired') ||
    message.includes('token expired') ||
    message.includes('accesstokenexpired') ||
    message.includes('invalidauthenticationtoken')
  );
}

export function isNotFoundError(detail: unknown): boolean {
  const message = getErrorMessage(detail).toLowerCase();
  if (!message) return false;
  return (
    message.includes('404') ||
    message.includes('notfound') ||
    message.includes('not found') ||
    message.includes('powerbi_entity_not_found') ||
    message.includes('itemnotfound') ||
    message.includes('reportnotfound') ||
    message.includes('dashboardnotfound')
  );
}
