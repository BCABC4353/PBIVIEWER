import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // Production stripping: drop debugger statements + chatty console.log/debug,
  // BUT keep console.error and console.warn — those carry our renderer crash
  // capture (TELEM-01 unhandledrejection + ErrorBoundary diagnostics). Dropping
  // them entirely would neuter production telemetry for the renderer process.
  esbuild:
    mode === 'production'
      ? { drop: ['debugger'], pure: ['console.log', 'console.debug', 'console.info'] }
      : undefined,
}));
