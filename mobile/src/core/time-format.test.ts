import { describe, expect, it } from 'vitest';
import { formatAbsolute, timestampPair } from './time-format';

const local = (y: number, m: number, d: number, hh: number, mm: number) =>
  new Date(y, m, d, hh, mm);

describe('formatAbsolute', () => {
  const now = local(2026, 5, 11, 16, 0).getTime();

  it('formats a same-year afternoon timestamp without the year', () => {
    expect(formatAbsolute(local(2026, 5, 11, 14, 34).toISOString(), now)).toBe('Jun 11, 2:34 PM');
  });

  it('formats morning hours with AM', () => {
    expect(formatAbsolute(local(2026, 0, 3, 6, 5).toISOString(), now)).toBe('Jan 3, 6:05 AM');
  });

  it('midnight and noon read as 12, not 0', () => {
    expect(formatAbsolute(local(2026, 5, 11, 0, 0).toISOString(), now)).toBe('Jun 11, 12:00 AM');
    expect(formatAbsolute(local(2026, 5, 11, 12, 0).toISOString(), now)).toBe('Jun 11, 12:00 PM');
  });

  it('includes the year when it differs from now', () => {
    expect(formatAbsolute(local(2025, 11, 31, 23, 59).toISOString(), now)).toBe(
      'Dec 31 2025, 11:59 PM',
    );
  });

  it('returns empty string for unparseable input', () => {
    expect(formatAbsolute('not-a-date', now)).toBe('');
  });
});

describe('timestampPair', () => {
  const now = local(2026, 5, 11, 16, 0).getTime();

  it('pairs a relative age with the absolute form', () => {
    const iso = new Date(now - 3 * 3_600_000).toISOString();
    expect(timestampPair(iso, now)).toEqual({ relative: '3h ago', absolute: 'Jun 11, 1:00 PM' });
  });

  it('returns null when there is no timestamp', () => {
    expect(timestampPair(undefined, now)).toBeNull();
  });

  it('returns null when the timestamp cannot be parsed', () => {
    expect(timestampPair('garbage', now)).toBeNull();
  });

  it('a future timestamp keeps the absolute form even though the relative form is empty', () => {
    const iso = new Date(now + 3_600_000).toISOString();
    const pair = timestampPair(iso, now);
    expect(pair?.relative).toBe('');
    expect(pair?.absolute).toBe('Jun 11, 5:00 PM');
  });
});
