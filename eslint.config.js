import pluginReact from 'eslint-plugin-react';
import tseslint from '@typescript-eslint/eslint-plugin';
import parserTs from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: parserTs,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {},
    settings: {
      react: {
        version: 'detect'
      }
    },
    ignores: ['dist/', 'node_modules/']
  }
]
