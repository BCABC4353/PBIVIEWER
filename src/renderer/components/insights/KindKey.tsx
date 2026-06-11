import React from 'react';
import { kindDot } from './insights-luce';

/** One-line key for the dots, in the engraved legend style (owner v3 #5) —
 *  styled in the engraved uppercase voice like every other label. */
export const KindKey: React.FC = () => (
  <div
    className="luce-legend flex items-center"
    style={{ gap: 16 }}
    data-testid="kind-key"
  >
    {(['dataflow', 'dataset'] as const).map((kind) => (
      <span key={kind} className="inline-flex items-center" style={{ gap: 6 }}>
        <span
          aria-hidden="true"
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: kindDot[kind] }}
        />
        {kind}
      </span>
    ))}
  </div>
);
