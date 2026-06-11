

export interface SpringPhysics {
  stiffness: number;
  damping: number;
  mass: number;
}

export function springFromResponse(responseSec: number, dampingFraction: number): SpringPhysics {
  if (responseSec <= 0) throw new Error('spring response must be > 0');
  if (dampingFraction <= 0) throw new Error('spring dampingFraction must be > 0');
  const mass = 1;
  const omega0 = (2 * Math.PI) / responseSec;
  const stiffness = omega0 * omega0 * mass;
  const damping = dampingFraction * 2 * Math.sqrt(stiffness * mass);
  return { stiffness, damping, mass };
}


export function staggerDelay(index: number, stepMs: number, maxItems = 8): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return Math.min(Math.floor(index), maxItems) * stepMs;
}


export function createRateLimiter(maxPerSecond: number, now: () => number = Date.now): () => boolean {
  if (maxPerSecond <= 0) throw new Error('maxPerSecond must be > 0');
  const minIntervalMs = 1000 / maxPerSecond;
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < minIntervalMs) return false;
    last = t;
    return true;
  };
}


export interface ReduceMotionSource {
  getInitial: () => Promise<boolean>;
  subscribe: (onChange: (reduceMotion: boolean) => void) => () => void;
}

export interface ReduceMotionCache {
  motionEnabled: () => boolean;
  ready: Promise<void>;
  dispose: () => void;
}

export function createReduceMotionCache(source: ReduceMotionSource): ReduceMotionCache {
  let reduceMotion = false;
  let disposed = false;

  const ready = source
    .getInitial()
    .then((value) => {
      if (!disposed) reduceMotion = value;
    })
    .catch(() => {
    });

  const unsubscribe = source.subscribe((value) => {
    if (!disposed) reduceMotion = value;
  });

  return {
    motionEnabled: () => !reduceMotion,
    ready,
    dispose: () => {
      disposed = true;
      try {
        unsubscribe();
      } catch {
      }
    },
  };
}


export type NumberFormat = (n: number) => string;

export function defaultNumberFormat(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + grouped;
}

export function formatAnimatedValue(
  current: number,
  from: number,
  to: number,
  format: NumberFormat = defaultNumberFormat,
): string {
  if (!Number.isFinite(current)) return format(to);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return format(Math.min(hi, Math.max(lo, current)));
}
