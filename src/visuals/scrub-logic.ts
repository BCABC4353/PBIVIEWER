
function clampIndex(i: number, count: number): number {
  if (i < 0) return 0;
  if (i > count - 1) return count - 1;
  return i;
}

export function barIndexForX(x: number, width: number, count: number): number {
  if (count <= 0) return -1;
  if (width <= 0) return 0;
  return clampIndex(Math.floor((x / width) * count), count);
}

export function lineIndexForX(x: number, width: number, count: number): number {
  if (count <= 0) return -1;
  if (count === 1 || width <= 0) return 0;
  return clampIndex(Math.round((x / width) * (count - 1)), count);
}
