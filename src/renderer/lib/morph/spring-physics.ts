export const MOMENTUM_STIFFNESS = 400;
export const MOMENTUM_DAMPING = 36;
export const MOMENTUM_DT_CAP_MS = 64;
export const MOMENTUM_EPSILON_POS = 0.001;
export const MOMENTUM_EPSILON_VEL = 0.01;

export interface MomentumSpringOptions {
  initial: number;
  stiffness?: number;
  damping?: number;
  onUpdate: (position: number, velocity: number, done: boolean) => void;
  now?: () => number;
  schedule?: (cb: () => void) => number;
  cancel?: (id: number) => void;
  timeScale?: number;
}

export interface MomentumSpring {
  retarget(to: number): void;
  set(value: number): void;
  stop(): void;
  value(): number;
  velocity(): number;
}

export function createMomentumSpring(opts: MomentumSpringOptions): MomentumSpring {
  const k = opts.stiffness ?? MOMENTUM_STIFFNESS;
  const c = opts.damping ?? MOMENTUM_DAMPING;
  const timeScale = opts.timeScale ?? 1;
  const now = opts.now ?? (() => performance.now());
  const schedule = opts.schedule ?? ((cb: () => void) => window.requestAnimationFrame(cb));
  const cancel = opts.cancel ?? ((id: number) => window.cancelAnimationFrame(id));

  let pos = opts.initial;
  let vel = 0;
  let target = opts.initial;
  let lastTime = now();
  let frame: number | null = null;

  function stepAnalytical(dt: number): void {
    const dtSec = Math.min(dt, MOMENTUM_DT_CAP_MS) / 1000;
    const x0 = pos - target;
    const v0 = vel;

    const discriminant = c * c - 4 * k;

    if (Math.abs(discriminant) < 1e-8) {
      const omega = c / 2;
      const A = x0;
      const B = v0 + omega * x0;
      const decay = Math.exp(-omega * dtSec);
      pos = target + (A + B * dtSec) * decay;
      vel = (B - omega * (A + B * dtSec)) * decay;
    } else if (discriminant < 0) {
      const alpha = c / 2;
      const beta = Math.sqrt(-discriminant) / 2;
      const decay = Math.exp(-alpha * dtSec);
      const cosB = Math.cos(beta * dtSec);
      const sinB = Math.sin(beta * dtSec);
      const A = x0;
      const B = (v0 + alpha * x0) / beta;
      pos = target + decay * (A * cosB + B * sinB);
      vel = decay * (
        ((-alpha * A + beta * B) * cosB) +
        ((-alpha * B - beta * A) * sinB)
      );
    } else {
      const r1 = (-c + Math.sqrt(discriminant)) / 2;
      const r2 = (-c - Math.sqrt(discriminant)) / 2;
      const A = (v0 - r2 * x0) / (r1 - r2);
      const B = x0 - A;
      pos = target + A * Math.exp(r1 * dtSec) + B * Math.exp(r2 * dtSec);
      vel = A * r1 * Math.exp(r1 * dtSec) + B * r2 * Math.exp(r2 * dtSec);
    }
  }

  function isSettled(): boolean {
    return Math.abs(pos - target) < MOMENTUM_EPSILON_POS && Math.abs(vel) < MOMENTUM_EPSILON_VEL;
  }

  const tick = (): void => {
    frame = null;
    const t = now();
    const dt = (t - lastTime) * timeScale;
    lastTime = t;

    stepAnalytical(dt);

    if (isSettled()) {
      pos = target;
      vel = 0;
      opts.onUpdate(pos, vel, true);
      return;
    }

    opts.onUpdate(pos, vel, false);
    frame = schedule(tick);
  };

  return {
    retarget(to: number): void {
      target = to;
      lastTime = now();

      if (isSettled()) {
        if (frame !== null) {
          cancel(frame);
          frame = null;
        }
        pos = target;
        vel = 0;
        opts.onUpdate(pos, vel, true);
        return;
      }

      if (frame === null) frame = schedule(tick);
    },

    set(value: number): void {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
      pos = value;
      vel = 0;
      target = value;
      lastTime = now();
      opts.onUpdate(pos, vel, true);
    },

    stop(): void {
      if (frame !== null) {
        cancel(frame);
        frame = null;
      }
    },

    value: () => pos,
    velocity: () => vel,
  };
}
