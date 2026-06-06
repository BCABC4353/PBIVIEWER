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
    },
  },
});
