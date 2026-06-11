export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function formatAgeNoun(ageMs: number): string {
  const mins = Math.max(0, Math.floor(ageMs / 60000));
  if (mins < 60) return mins <= 1 ? '1 min' : `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return hours === 1 ? '1 hour' : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

export function formatRelativeAge(ageMs: number): string {
  const mins = Math.max(0, Math.floor(ageMs / 60000));
  if (mins < 1) return 'just now';
  return `${formatAgeNoun(ageMs)} ago`;
}
