import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest reads its own config — kept intentionally separate from the renderer's
// vite.config.ts so the Electron/React Vite plugin chain does not affect the
// jsdom test environment.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  // Use the automatic JSX runtime (react/jsx-runtime) so .test.tsx files match
  // tsconfig.renderer.json's "jsx": "react-jsx". Without this, esbuild falls back
  // to the classic transform (React.createElement) and JSX-using tests throw
  // "React is not defined" unless they import React — which tsc then rejects as
  // an unused local (TS6133). Automatic runtime keeps tsc and vitest in agreement.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
      ],
      // NEW-CI-3: thresholds set just below current measured coverage so CI
      // fails on regression without requiring aspirational numbers.
      // Baseline measured 2026-06-07:
      //   statements 8.47 % → threshold 8
      //   branches   61.67% → threshold 60
      //   functions  30.06% → threshold 29
      //   lines       8.47% → threshold 8
      thresholds: {
        statements: 8,
        branches: 60,
        functions: 29,
        lines: 8,
      },
    },
  },
});
