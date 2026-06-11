import React from 'react';
import type { InsightsRefreshable } from '../../../shared/types';
import { kindDot } from './insights-luce';

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
