import React from 'react';


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
