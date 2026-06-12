export function friendlyApiError(status: number | undefined, _raw?: string): string {
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (status === 403) return 'You do not have access to this content.';
  if (status === 404) return 'This item was not found. It may have been moved or removed.';
  if (status === 429) return 'Power BI is throttling requests. Please wait a moment and try again.';
  if (status && status >= 500 && status < 600) return 'Power BI is currently unavailable. Please try again in a moment.';
  return 'Something went wrong. Please try again.';
}

const NETWORK_OR_CERT_RE =
  /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ENETUNREACH|self[- ]signed certificate|unable to verify|UNABLE_TO_VERIFY|SELF_SIGNED|CERT_|ERR_TLS|ERR_PROXY/i;

export function isNetworkOrCertError(message: string): boolean {
  return NETWORK_OR_CERT_RE.test(message);
}

export function friendlyApiErrorFromMessage(message: string): string {
  if (isNetworkOrCertError(message)) {
    return "Can't reach Power BI. Your network may require a proxy or a security certificate — please contact IT.";
  }
  const match = message.match(/:\s*(\d{3})\s*-\s*/);
  const status = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(status)) {
    console.error('Unmapped error detail:', message);
    return 'Something went wrong. Please try again.';
  }
  return friendlyApiError(status);
}
