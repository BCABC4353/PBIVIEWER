import { describe, expect, it } from 'vitest';
import { codeCountdown } from './device-code-format';

describe('codeCountdown', () => {
  it('renders minutes and zero-padded seconds', () => {
    expect(codeCountdown(754_000, 0)).toBe('12:34');
    expect(codeCountdown(65_000, 0)).toBe('1:05');
  });

  it('rounds partial seconds up so the display never undershoots', () => {
    expect(codeCountdown(1_500, 0)).toBe('0:02');
    expect(codeCountdown(60_001, 0)).toBe('1:01');
  });

  it('handles long validity windows', () => {
    expect(codeCountdown(900_000, 0)).toBe('15:00');
  });

  it('returns null at and after expiry', () => {
    expect(codeCountdown(1_000, 1_000)).toBeNull();
    expect(codeCountdown(1_000, 2_000)).toBeNull();
  });

  it('returns null for a non-finite deadline', () => {
    expect(codeCountdown(Number.NaN, 0)).toBeNull();
  });
});
