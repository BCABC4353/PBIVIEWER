/**
 * scrub-logic — pure nearest-index math for chart scrubbing (the Robinhood
 * move: drag across a chart, the nearest point answers under the finger).
 *
 * NO react-native imports: this file is unit-tested in plain node. The charts
 * own the gesture plumbing; this owns the geometry.
 */

function clampIndex(i: number, count: number): number {
  if (i < 0) return 0;
  if (i > count - 1) return count - 1;
  return i;
}

/**
 * Nearest bar for a touch at `x` in a plot of `width` holding `count`
 * equal-width slots (BarChart: each bar slot is flex:1). Out-of-bounds x
 * clamps to the edge bars; returns -1 only when there are no bars.
 */
export function barIndexForX(x: number, width: number, count: number): number {
  if (count <= 0) return -1;
  if (width <= 0) return 0;
  return clampIndex(Math.floor((x / width) * count), count);
}

/**
 * Nearest point for a touch at `x` on a line whose `count` points are spread
 * evenly across `width` (LineChart: point i sits at i/(count-1)·width).
 * Out-of-bounds x clamps to the end points; returns -1 only when empty.
 */
export function lineIndexForX(x: number, width: number, count: number): number {
  if (count <= 0) return -1;
  if (count === 1 || width <= 0) return 0;
  return clampIndex(Math.round((x / width) * (count - 1)), count);
}
