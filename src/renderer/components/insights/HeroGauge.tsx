import React from 'react';
import { useSpringNumber } from './luce-motion';
import { LuceDial } from './LuceDial';

/**
 * D1/D11 — the hero instrument: backlight deck → data → lens, holding the ONE
 * dominant figure (overall data health, % of refreshables that are neither
 * broken nor overdue). The numeral springs to new values with mass (D5) and
 * counts up from 0 during the ignition ceremony (D6). The live-dot, the meter
 * needle's tremor, and the backlight drift are the board's only three idle
 * movers (D7: 4.8s / 7s / 9s).
 */
export const HeroGauge: React.FC<{ pct: number | null; igniting: boolean }> = ({ pct, igniting }) => {
  const { value, ref } = useSpringNumber(pct ?? 0, { startFromZero: igniting });
  const needleAt = Math.max(0, Math.min(100, value));
  return (
    <div
      className="luce-panel luce-panel--raised luce-hero-panel luce-rise p-6 flex items-center gap-8"
      style={{ '--luce-i': 0 } as React.CSSProperties}
      data-testid="luce-hero"
    >
      <div className="luce-backlight luce-backlight--live" aria-hidden="true" />
      {igniting && <span className="luce-flow" aria-hidden="true" />}
      {/* The instrument: needle + lit arc ride the same sprung value as the
          numeral, so the whole cluster moves as one mass. */}
      <div className="relative z-[1] shrink-0" style={{ width: 224, height: 224 }}>
        <LuceDial pct={pct === null ? 0 : needleAt} />
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ bottom: 40 }}
        >
          <div
            ref={ref}
            className="luce-hero-num"
            style={{ fontSize: 40, lineHeight: 1 }}
            aria-label={pct === null ? 'Data health unknown' : `Data health ${pct} percent`}
          >
            {pct === null ? '—' : Math.round(value)}
            {pct !== null && <span className="luce-hero-unit">%</span>}
          </div>
        </div>
      </div>
      <div className="luce-lens" aria-hidden="true" />
    </div>
  );
};
