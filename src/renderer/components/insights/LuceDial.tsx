import React from 'react';
import { luce } from './insights-luce';

const DIAL_SWEEP = 270;
const DIAL_START = 135;

function dialPoint(c: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
}

export const LuceDial: React.FC<{ pct: number; size?: number }> = ({ pct, size = 264 }) => {
  const c = size / 2;
  const faceR = c - 2;
  const tickOuter = c - 12;
  const tickMinorIn = tickOuter - 7;
  const tickMajorIn = tickOuter - 13;
  const arcR = tickOuter - 19;
  const needleTip = arcR + 5;
  const hubR = 13;
  const f = Math.max(0, Math.min(1, pct / 100));
  const circ = 2 * Math.PI * arcR;
  const arcLen = circ * (DIAL_SWEEP / 360);
  const dash = `${arcLen} ${circ - arcLen}`;
  const off = arcLen * (1 - f);
  const ticks: React.ReactNode[] = [];
  const count = 40;
  for (let i = 0; i <= count; i++) {
    const deg = DIAL_START + (i / count) * DIAL_SWEEP;
    const major = i % 5 === 0;
    const p1 = dialPoint(c, major ? tickMajorIn : tickMinorIn, deg);
    const p2 = dialPoint(c, tickOuter, deg);
    ticks.push(
      <line
        key={deg}
        x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
        stroke={major ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'}
        strokeWidth={major ? 2 : 1}
        strokeLinecap="round"
      />,
    );
  }
  const na = DIAL_START + f * DIAL_SWEEP;
  const dir = dialPoint(0, 1, na);
  const perp = { x: -dir.y, y: dir.x };
  const baseR = hubR - 2;
  const blade = [
    `${c + baseR * dir.x + 2.6 * perp.x},${c + baseR * dir.y + 2.6 * perp.y}`,
    `${c + (needleTip - 1) * dir.x + 0.7 * perp.x},${c + (needleTip - 1) * dir.y + 0.7 * perp.y}`,
    `${c + needleTip * dir.x},${c + needleTip * dir.y}`,
    `${c + (needleTip - 1) * dir.x - 0.7 * perp.x},${c + (needleTip - 1) * dir.y - 0.7 * perp.y}`,
    `${c + baseR * dir.x - 2.6 * perp.x},${c + baseR * dir.y - 2.6 * perp.y}`,
  ].join(' ');
  const arcProps = {
    cx: c, cy: c, r: arcR, fill: 'none',
    strokeDasharray: dash, strokeDashoffset: off,
    transform: `rotate(${DIAL_START}, ${c}, ${c})`, strokeLinecap: 'round' as const,
  };
  return (
    <svg width={size} height={size} aria-hidden="true">
      <defs>
        <radialGradient id="luce-dial-face" cx="50%" cy="36%" r="78%">
          <stop offset="0%" stopColor="#1C1C21" />
          <stop offset="58%" stopColor="#131316" />
          <stop offset="100%" stopColor="#0A0A0C" />
        </radialGradient>
        <radialGradient id="luce-dial-hub" cx="50%" cy="34%" r="80%">
          <stop offset="0%" stopColor="#2A2A30" />
          <stop offset="100%" stopColor="#131316" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={faceR} fill="url(#luce-dial-face)" />
      <circle cx={c} cy={c} r={faceR} fill="none" stroke="rgba(0,0,0,0.65)" strokeWidth={2} />
      <circle cx={c} cy={c - 0.5} r={faceR - 1.5} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1} />
      {ticks}
      <circle {...arcProps} stroke="rgba(255,255,255,0.06)" strokeWidth={3} strokeDashoffset={0} />
      <circle {...arcProps} stroke={luce.accent} strokeOpacity={0.08} strokeWidth={15} />
      <circle {...arcProps} stroke={luce.accent} strokeOpacity={0.24} strokeWidth={7} />
      <circle {...arcProps} stroke={luce.accent} strokeOpacity={1} strokeWidth={2.5} />
      <g className="luce-needle luce-dial-needle" style={{ transformOrigin: `${c}px ${c}px` }}>
        <line
          x1={c} y1={c}
          x2={c - 16 * dir.x} y2={c - 16 * dir.y}
          stroke="#B97D2A" strokeWidth={5} strokeLinecap="round"
        />
        <polygon points={blade} fill={luce.accent} />
      </g>
      <circle cx={c} cy={c} r={hubR} fill="url(#luce-dial-hub)" />
      <circle cx={c} cy={c} r={hubR} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
      <circle cx={c} cy={c} r={3.4} fill={luce.accent} />
    </svg>
  );
};
