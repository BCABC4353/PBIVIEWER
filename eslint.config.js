// ESLint flat config (eslint.config.js) — see https://eslint.org/docs/latest/use/configure/configuration-files-new
//
// Notes for future maintainers:
//   - `@typescript-eslint/no-unused-vars` is OFF because we delegate that to
//     TypeScript via `noUnusedLocals` / `noUnusedParameters` in tsconfig.*.json
//     (see Sprint 3, task DX-02).
//   - `react-hooks/exhaustive-deps` is set to "warn" rather than "error" on
//     purpose: the existing codebase has accumulated violations and turning the
//     rule on as an error would flood CI red. Promote to "error" once the
//     existing warnings have been cleaned up (planned Sprint-4 follow-up).
//   - `no-console` allows `console.warn` and `console.error` because esbuild's
//     `pure` config (DX-01) keeps those calls in production; `console.log` /
//     `debug` / `info` should still be flagged so they don't ship.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build-output/**',
      'release/**',
      'src/main/auth/azure-config.generated.ts',
      'vitest.config.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      // Start as warn so the existing codebase doesn't all light up red; promote
      // to error once existing violations are cleaned up.
      'react-hooks/exhaustive-deps': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // tsc owns this via noUnusedLocals/noUnusedParameters (DX-02).
      '@typescript-eslint/no-unused-vars': 'off',
    },
  }
);
