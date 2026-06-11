import React from 'react';
import { ladder } from './insights-luce';

export const SheetLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="mb-1"
    style={{
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: ladder.faint,
    }}
  >
    {children}
  </div>
);
