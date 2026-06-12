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
  if (Number.isNaN(index)) return 0;
  if (index === Infinity) return count - 1;
  if (index === -Infinity) return 0;
  return Math.max(0, Math.min(count - 1, Math.round(index)));
}

function safeIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return clampIndex(index, count);
}

function dropNaN(value: number, fallback: number): number {
  return Number.isNaN(value) ? fallback : value;
}

export function snapIndex(input: SnapInput): number {
  const { currentIndex, count, dragOffset, velocity, itemWidth, velocityBiasFactor = 0.25 } = input;
  if (count <= 0) return 0;
  const base = safeIndex(currentIndex, count);
  if (!Number.isFinite(itemWidth) || itemWidth <= 0) return base;

  const offset = dropNaN(dragOffset, 0);
  const vel = dropNaN(velocity, 0);
  const bias = dropNaN(velocityBiasFactor, 0.25);

  const projectionTime = 0.3;
  const projected = offset + vel * projectionTime * bias;

  const rawIndex = base - projected / itemWidth;
  return clampIndex(rawIndex, count);
}

export function springTarget(input: SnapInput): SpringTarget {
  const index = snapIndex(input);
  const { currentIndex, count, dragOffset, itemWidth } = input;
  if (!Number.isFinite(itemWidth) || itemWidth <= 0) return { index, offsetFromSnap: 0 };
  const base = safeIndex(currentIndex, count);
  const offset = Number.isFinite(dragOffset) ? dragOffset : 0;
  const currentPosition = base * itemWidth - offset;
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
  const base = safeIndex(currentIndex, count);
  if (count <= 0 || !Number.isFinite(itemWidth) || itemWidth <= 0) return base;
  if (!Number.isFinite(velocity)) return base;
  const projected = velocity * (decelerationMs / 1000);
  const raw = base - projected / itemWidth;
  return clampIndex(raw, count);
}
