import React from 'react';
import type { InsightsRefreshable } from '../../../shared/types';
import { kindDot } from './insights-luce';

/**
 * Kind identity DOT (owner v3 #5): the chip is dead — a small violet
 * (dataflow) or slate (dataset) dot rides before every row name. Identity
 * tints only, never a status hue.
 */
export const KindDot: React.FC<{ kind: InsightsRefreshable['kind'] }> = ({ kind }) => (
  <span
    role="img"
    aria-label={kind}
    title={kind}
    data-testid="kind-dot"
    className="inline-block rounded-full justify-self-center shrink-0"
    style={{ width: 8, height: 8, background: kindDot[kind] }}
  />
);
