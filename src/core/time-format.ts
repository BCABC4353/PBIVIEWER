import { relativeAge } from './refresh-health';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function formatAbsolute(iso: string, now: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const year = sameYear ? '' : ` ${d.getFullYear()}`;
  const hours24 = d.getHours();
  const hours = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const meridiem = hours24 < 12 ? 'AM' : 'PM';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}, ${hours}:${minutes} ${meridiem}`;
}

export interface TimestampPair {
  relative: string;
  absolute: string;
}

export function timestampPair(iso: string | undefined, now: number): TimestampPair | null {
  if (!iso) return null;
  const absolute = formatAbsolute(iso, now);
  if (absolute === '') return null;
  return { relative: relativeAge(iso, now), absolute };
}
