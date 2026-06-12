import { describe, expect, it } from 'vitest';
import { barIndexForX, lineIndexForX } from './scrub-logic';


describe('barIndexForX', () => {
  it('maps each slot to its own index across the width', () => {
    expect(barIndexForX(0, 100, 4)).toBe(0);
    expect(barIndexForX(24.9, 100, 4)).toBe(0);
    expect(barIndexForX(25, 100, 4)).toBe(1);
    expect(barIndexForX(60, 100, 4)).toBe(2);
    expect(barIndexForX(99, 100, 4)).toBe(3);
  });

  it('clamps x past the right edge to the last bar', () => {
    expect(barIndexForX(100, 100, 4)).toBe(3);
    expect(barIndexForX(500, 100, 4)).toBe(3);
  });

  it('clamps negative x (finger dragged off the left) to the first bar', () => {
    expect(barIndexForX(-30, 100, 4)).toBe(0);
  });

  it('handles a single bar — everything is that bar', () => {
    expect(barIndexForX(0, 100, 1)).toBe(0);
    expect(barIndexForX(99, 100, 1)).toBe(0);
  });

  it('returns 0 before layout (width 0) so the scrub never crashes', () => {
    expect(barIndexForX(40, 0, 4)).toBe(0);
  });

  it('returns -1 only for an empty chart', () => {
    expect(barIndexForX(40, 100, 0)).toBe(-1);
  });
});


describe('lineIndexForX', () => {
  it('snaps to the nearest point (round, not floor)', () => {
    expect(lineIndexForX(0, 100, 5)).toBe(0);
    expect(lineIndexForX(12, 100, 5)).toBe(0);
    expect(lineIndexForX(13, 100, 5)).toBe(1);
    expect(lineIndexForX(50, 100, 5)).toBe(2);
    expect(lineIndexForX(88, 100, 5)).toBe(4);
    expect(lineIndexForX(100, 100, 5)).toBe(4);
  });

  it('clamps x outside the plot to the end points', () => {
    expect(lineIndexForX(-20, 100, 5)).toBe(0);
    expect(lineIndexForX(260, 100, 5)).toBe(4);
  });

  it('handles two points — midpoint splits them', () => {
    expect(lineIndexForX(49, 100, 2)).toBe(0);
    expect(lineIndexForX(51, 100, 2)).toBe(1);
  });

  it('handles a single point — always index 0', () => {
    expect(lineIndexForX(0, 100, 1)).toBe(0);
    expect(lineIndexForX(77, 100, 1)).toBe(0);
  });

  it('returns 0 before layout (width 0) so the scrub never crashes', () => {
    expect(lineIndexForX(40, 0, 5)).toBe(0);
  });

  it('returns -1 only for an empty chart', () => {
    expect(lineIndexForX(40, 100, 0)).toBe(-1);
  });
});
