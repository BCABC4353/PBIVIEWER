import React from 'react';
import { useSpringNumber } from './luce-motion';
import { LuceDial } from './LuceDial';

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
      {}
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
