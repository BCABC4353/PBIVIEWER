import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const colorLiteralRules = [
  {
    selector: "Literal[value=/#(?:[0-9a-fA-F]{3,4}){1,2}\\b/]",
    message:
      'Hex color literals are banned outside src/design/tokens.ts. Add the color to tokens and import it.',
  },
  {
    selector: "TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}){1,2}\\b/]",
    message:
      'Hex color literals are banned outside src/design/tokens.ts. Add the color to tokens and import it.',
  },
  {
    selector: "Literal[value=/rgba?\\(/]",
    message:
      'rgba()/rgb() literals are banned outside src/design/tokens.ts. Use a token or the whiteAlpha/blackAlpha helpers.',
  },
  {
    selector: "TemplateElement[value.raw=/rgba?\\(/]",
    message:
      'rgba()/rgb() literals are banned outside src/design/tokens.ts. Use a token or the whiteAlpha/blackAlpha helpers.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'design-lab/**',
      'night-out/**',
      'dist/**',
      '.expo/**',
      'assets/**',
      'scripts/**',
      '**/*.test.ts',
      '**/*.test.tsx',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tools/**/*.{ts,mts}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-restricted-syntax': ['error', ...colorLiteralRules],
    },
  },
  {
    files: ['src/design/tokens.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
