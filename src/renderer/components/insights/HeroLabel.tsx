import React from 'react';
import { ladder } from './insights-luce';

/** Column label on the hero tile — 10px caps, tracking 0.08em, faint (§A). */
export const HeroLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: ladder.faint,
    }}
  >
    {children}
  </div>
);
