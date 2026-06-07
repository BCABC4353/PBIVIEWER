/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Using CSS custom properties that Fluent UI sets
        // These will automatically respond to theme changes
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
        // Brand Colors (Safety Orange) — rgb() form enables /opacity utilities
        'brand-primary': 'rgb(var(--brand-rgb) / <alpha-value>)',
        'brand-secondary': '#E54D0A',
        'brand-background': '#FFF5F0',
        // Accent (Fluent Brand — resolves to orange after brandRamp.ts is applied)
        'accent-primary': 'var(--colorBrandBackground)',
        'accent-hover': 'var(--colorBrandBackgroundHover)',
        'accent-pressed': 'var(--colorBrandBackgroundPressed)',
        // Status Colors — rgb() form is required so bg-status-*/10 opacity utilities work.
        // Matching --status-*-rgb variables are declared in globals.css :root.
        'status-success': 'rgb(var(--status-success-rgb) / <alpha-value>)',
        'status-warning': 'rgb(var(--status-warning-rgb) / <alpha-value>)',
        'status-error': 'rgb(var(--status-error-rgb) / <alpha-value>)',
        'status-info': 'rgb(var(--status-info-rgb) / <alpha-value>)',
      },
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
