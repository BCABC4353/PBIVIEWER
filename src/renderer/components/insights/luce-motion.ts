import { useEffect, useRef, useState } from 'react';

export {
  MOMENTUM_STIFFNESS,
  MOMENTUM_DAMPING,
  MOMENTUM_DT_CAP_MS,
  MOMENTUM_EPSILON_POS,
  MOMENTUM_EPSILON_VEL,
  createMomentumSpring,
} from '../../lib/morph/spring-physics';
export type { MomentumSpringOptions, MomentumSpring } from '../../lib/morph/spring-physics';
export { prefersReducedMotion } from '../../lib/morph/reduced-motion';
import { prefersReducedMotion } from '../../lib/morph/reduced-motion';


export const SPRING_NEEDLE =
  'linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, ' +
  '1.017, 1.077, 1.121, 1.149 24.3%, 1.159, 1.163, 1.161, 1.154 29.9%, 1.129 32.8%, ' +
  '1.051 39.6%, 1.017 43.1%, 0.991, 0.977 51%, 0.974 53.8%, 0.975 57.1%, 0.997 69.8%, ' +
  '1.003 76.9%, 1.001 100%)';

export const SPRING_SETTLE =
  'linear(0, 0.013, 0.318 6.6%, 0.751 13.6%, 0.918 18.1%, 1.016 23%, ' +
  '1.052 27.2%, 1.057 30.5%, 1.026 38.2%, 0.999 45.4%, 0.995 53%, 1 100%)';

export const DUR = {
 needle: 700,
 panel: 400,
 control: 250,
 press: 80,
} as const;


export interface LinearStop {
  t: number;
  v: number;
}

export function parseLinearStops(easing: string): LinearStop[] {
  const inner = easing.replace(/^\s*linear\(/, '').replace(/\)\s*$/, '');
  const raw = inner.split(',').map((entry) => {
    const parts = entry.trim().split(/\s+/);
    const v = Number.parseFloat(parts[0] ?? '0');
    const pct = parts[1];
    return { v, t: pct !== undefined ? Number.parseFloat(pct) / 100 : null };
  });
  if (raw.length === 0) return [{ t: 0, v: 0 }, { t: 1, v: 1 }];
  if (raw[0] && raw[0].t === null) raw[0].t = 0;
  const last = raw[raw.length - 1];
  if (last && last.t === null) last.t = 1;
  let i = 0;
  while (i < raw.length) {
    const stop = raw[i];
    if (stop && stop.t === null) {
      let j = i;
      while (j < raw.length && raw[j]?.t === null) j++;
      const prevT = raw[i - 1]?.t ?? 0;
      const nextT = raw[j]?.t ?? 1;
      const span = j - i + 1;
      for (let k = i; k < j; k++) {
        const fill = raw[k];
        if (fill) fill.t = prevT + ((nextT - prevT) * (k - i + 1)) / span;
      }
      i = j;
    } else {
      i++;
    }
  }
  return raw.map((s) => ({ t: s.t ?? 0, v: s.v }));
}

export function linearEasingAt(stops: LinearStop[], p: number): number {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (!first || !last) return p;
  if (p <= first.t) return first.v;
  if (p >= last.t) return last.v;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (!a || !b) continue;
    if (p <= b.t) {
      if (b.t === a.t) return b.v;
      const f = (p - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * f;
    }
  }
  return last.v;
}


export interface SpringTickerOptions {
  initial: number;
  duration?: number;
  easing?: string;
  onUpdate: (value: number, done: boolean) => void;
  now?: () => number;
  schedule?: (cb: () => void) => number;
  cancel?: (id: number) => void;
}

export interface SpringTicker {
  retarget(to: number): void;
  set(value: number): void;
  stop(): void;
  value(): number;
}

export function createSpringTicker(opts: SpringTickerOptions): SpringTicker {
  const duration = opts.duration ?? DUR.needle;
  const stops = parseLinearStops(opts.easing ?? SPRING_NEEDLE);
  const now = opts.now ?? (() => performance.now());
  const schedule = opts.schedule ?? ((cb: () => void) => window.requestAnimationFrame(cb));
  const cancel = opts.cancel ?? ((id: number) => window.cancelAnimationFrame(id));

  let current = opts.initial;
  let from = opts.initial;
  let to = opts.initial;
  let start = 0;
  let frame: number | null = null;

  const tick = (): void => {
    frame = null;
    const p = Math.min((now() - start) / duration, 1);
    const done = p >= 1;
    current = done ? to : from + (to - from) * linearEasingAt(stops, p);
    opts.onUpdate(current, done);
    if (!done) frame = schedule(tick);
  };

  return {
    retarget(next: number): void {
      from = current;
      to = next;
      start = now();
      if (from === to) {
        if (frame !== null) {
          cancel(frame);
          frame = null;
        }
        opts.onUpdate(current, true);
        return;
      }
      if (frame === null) frame = schedule(tick);
    },
    set(value: number): void {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
      current = from = to = value;
      opts.onUpdate(value, true);
    },
    stop(): void {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
    },
    value: () => current,
  };
}


export function pulse(el: Element | null, duration: number = DUR.needle): void {
  if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.02)', offset: 0.25 },
      { transform: 'scale(1)' },
    ],
    { duration, easing: SPRING_SETTLE },
  );
}


export interface SpringNumberOptions {
  duration?: number;
  startFromZero?: boolean;
}

export interface SpringNumberHandle {
  value: number;
  ref: React.RefObject<HTMLDivElement>;
}

export function useSpringNumber(target: number, opts: SpringNumberOptions = {}): SpringNumberHandle {
  const ref = useRef<HTMLDivElement>(null);
  const duration = opts.duration ?? DUR.needle;
  const initial = opts.startFromZero && !prefersReducedMotion() ? 0 : target;
  const [value, setValue] = useState(initial);
  const tickerRef = useRef<SpringTicker | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      tickerRef.current?.stop();
      setValue(target);
      return;
    }
    let ticker = tickerRef.current;
    if (!ticker) {
      ticker = createSpringTicker({
        initial,
        duration,
        onUpdate: (v) => setValue(v),
      });
      tickerRef.current = ticker;
    }
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (ticker.value() === target) return;
    } else {
      pulse(ref.current, duration);
    }
    ticker.retarget(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  useEffect(() => () => tickerRef.current?.stop(), []);

  return { value, ref };
}


export const IGNITION_FLAG = 'luce-ignition-v1';
export const IGNITION_MS = 1400;

function ignitionAlreadyRun(): boolean {
  try {
    return window.sessionStorage.getItem(IGNITION_FLAG) === '1';
  } catch {
    return true;
  }
}

function markIgnitionRun(): void {
  try {
    window.sessionStorage.setItem(IGNITION_FLAG, '1');
  } catch {
  }
}

export function useIgnition(ready: boolean): boolean {
  const eligibleRef = useRef<boolean | null>(null);
  if (eligibleRef.current === null) {
    eligibleRef.current = !prefersReducedMotion() && !ignitionAlreadyRun();
  }
  const [ended, setEnded] = useState(false);
  const igniting = eligibleRef.current && ready && !ended;

  useEffect(() => {
    if (!igniting) return;
    markIgnitionRun();
    const end = (): void => setEnded(true);
    const timer = window.setTimeout(end, IGNITION_MS);
    window.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end);
    window.addEventListener('wheel', end);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', end);
      window.removeEventListener('keydown', end);
      window.removeEventListener('wheel', end);
    };
  }, [igniting]);

  return igniting;
}


export function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const onVisibility = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return hidden;
}
