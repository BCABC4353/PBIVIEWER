const tokens = require('./src/renderer/theme/tokens.json');

module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'neutral-foreground-1': 'var(--colorNeutralForeground1)',
        'neutral-foreground-2': 'var(--colorNeutralForeground2)',
        'neutral-foreground-3': 'var(--colorNeutralForeground3)',
        'neutral-foreground-disabled': 'var(--colorNeutralForegroundDisabled)',
        'neutral-background-1': 'var(--colorNeutralBackground1)',
        'neutral-background-2': 'var(--colorNeutralBackground2)',
        'neutral-background-3': 'var(--colorNeutralBackground3)',
        'neutral-background-4': 'var(--colorNeutralBackground4)',
        'neutral-background-5': 'var(--colorNeutralBackground5)',
        'neutral-stroke-1': 'var(--colorNeutralStroke1)',
        'neutral-stroke-2': 'var(--colorNeutralStroke2)',
        'brand-primary': tokens.color.brand['80'],
        ink: tokens.color.ink,
        'accent-primary': 'var(--colorBrandBackground)',
        'accent-hover': 'var(--colorBrandBackgroundHover)',
        'accent-pressed': 'var(--colorBrandBackgroundPressed)',
        'status-success': tokens.color.status.success,
        'status-warning': tokens.color.status.warning,
        'status-error': tokens.color.status.error,
        'status-info': tokens.color.status.info,
      },
      spacing: tokens.spacing,
      borderRadius: tokens.radius,
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'fluent-2': '0 1.6px 3.6px 0 rgba(0,0,0,0.132), 0 0.3px 0.9px 0 rgba(0,0,0,0.108)',
        'fluent-4': '0 3.2px 7.2px 0 rgba(0,0,0,0.132), 0 0.6px 1.8px 0 rgba(0,0,0,0.108)',
        'fluent-8': '0 6.4px 14.4px 0 rgba(0,0,0,0.132), 0 1.2px 3.6px 0 rgba(0,0,0,0.108)',
      },
    },
  },
  plugins: [],
};
