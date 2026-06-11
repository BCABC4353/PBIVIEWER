import React from 'react';
import { luce } from './insights-luce';

/** Engraved eyebrow + title — one heading treatment for every section (Matt #8). */
export const SectionHeading: React.FC<{ id: string; eyebrow: string; title: string }> = ({ id, eyebrow, title }) => (
  <div className="mb-1">
    <div className="luce-legend">{eyebrow}</div>
    <h2 id={id} className="text-lg font-semibold" style={{ color: luce.textPrimary }}>
      {title}
    </h2>
  </div>
);
