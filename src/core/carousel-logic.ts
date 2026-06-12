export interface CarouselState {
  index: number;
  count: number;
}

export interface SnapInput {
  currentIndex: number;
  count: number;
  dragOffset: number;
  velocity: number;
  itemWidth: number;
  velocityBiasFactor?: number;
}

export interface SpringTarget {
  index: number;
  offsetFromSnap: number;
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, index));
}

export function snapIndex(input: SnapInput): number {
  const { currentIndex, count, dragOffset, velocity, itemWidth, velocityBiasFactor = 0.25 } = input;
  if (count <= 0) return 0;
  if (itemWidth <= 0) return clampIndex(currentIndex, count);

  const projectionTime = 0.3;
  const projected = dragOffset + velocity * projectionTime * velocityBiasFactor;

  const rawIndex = currentIndex - projected / itemWidth;
  const snapped = Math.round(rawIndex);
  return clampIndex(snapped, count);
}

export function springTarget(input: SnapInput): SpringTarget {
  const index = snapIndex(input);
  const { currentIndex, dragOffset, itemWidth } = input;
  if (itemWidth <= 0) return { index, offsetFromSnap: 0 };
  const currentPosition = currentIndex * itemWidth - dragOffset;
  const snapPosition = index * itemWidth;
  return { index, offsetFromSnap: currentPosition - snapPosition };
}

export function canAdvance(state: CarouselState): boolean {
  return state.count > 0 && state.index < state.count - 1;
}

export function canRewind(state: CarouselState): boolean {
  return state.count > 0 && state.index > 0;
}

export function advance(state: CarouselState): CarouselState {
  return { ...state, index: clampIndex(state.index + 1, state.count) };
}

export function rewind(state: CarouselState): CarouselState {
  return { ...state, index: clampIndex(state.index - 1, state.count) };
}

export function goTo(state: CarouselState, index: number): CarouselState {
  return { ...state, index: clampIndex(index, state.count) };
}

export function projectedIndex(
  currentIndex: number,
  count: number,
  velocity: number,
  itemWidth: number,
  decelerationMs = 300,
): number {
  if (count <= 0 || itemWidth <= 0) return clampIndex(currentIndex, count);
  const projected = velocity * (decelerationMs / 1000);
  const raw = currentIndex - projected / itemWidth;
  return clampIndex(Math.round(raw), count);
}
