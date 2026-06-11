import React from 'react';

// ---------------------------------------------------------------------------
// Small Luce primitives (scoped to this page)
// ---------------------------------------------------------------------------

/**
 * Switchgear (D10): every button presses 80ms INTO the panel and releases on
 * the 250ms settle spring (see .luce-btn). `primary` is the gear selector —
 * the one capsule with the anodised bezel and a resting glow (D9/D10).
 */
export const LuceButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'accent' | 'quiet' }
> = ({ tone = 'quiet', className, style, children, ...rest }) => (
  <button
    {...rest}
    className={`luce-btn px-3 py-1.5 text-sm ${
      tone === 'primary' ? 'luce-btn--primary px-4' : tone === 'accent' ? 'luce-btn--accent' : ''
    } ${className ?? ''}`}
    style={style}
  >
    {children}
  </button>
);
