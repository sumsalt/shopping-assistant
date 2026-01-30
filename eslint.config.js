import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        RequestInit: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: eslintConfigPrettier,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...eslintConfigPrettier.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'web/', '*.js', '*.test.ts', '*.example.ts'],
  },
];
