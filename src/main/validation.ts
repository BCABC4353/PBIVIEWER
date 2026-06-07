export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUUID(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return UUID_REGEX.test(value) ? value : null;
}
