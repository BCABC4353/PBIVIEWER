import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Vitest reads its own config — kept intentionally separate from the renderer's
// vite.config.ts so the Electron/React Vite plugin chain does not affect the
// jsdom test environment.
export default defineConfig({
  plugins: [
    // azure-config.generated.ts is emitted by scripts/generate-config.js and
    // gitignored; without this stub the auth-service suite cannot even load
    // on a fresh clone (CI, new machines). A resolveId hook is used instead of
    // resolve.alias because alias does not rewrite relative specifiers.
    {
      name: 'stub-azure-config-generated',
      enforce: 'pre',
      resolveId(source) {
        if (source.endsWith('azure-config.generated')) {
          return path.resolve(__dirname, 'src/test/fixtures/azure-config.stub.ts');
        }
        return null;
      },
    },
  ],
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
      // Baseline measured 2026-06-10 (after the azure-config stub recovered the
      // auth-service suite, which alone is ~a third of measured statements):
      //   statements 27.56% → threshold 27
      //   branches   70.15% → threshold 69
      //   functions  48.44% → threshold 47
      //   lines      27.56% → threshold 27
      thresholds: {
        statements: 27,
        branches: 69,
        functions: 47,
        lines: 27,
      },
    },
  },
});
