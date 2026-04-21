module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'portfolioos'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  ignorePatterns: [
    'dist/',
    'build/',
    'node_modules/',
    'coverage/',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
    '.eslintrc.cjs',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'prefer-const': 'error',
    'eqeqeq': ['error', 'smart'],
    // §3.10 — no silent try/catch. Must rethrow, call logger.*,
    // writeIngestionFailure, or next(err).
    'portfolioos/no-silent-catch': 'error',
    // §3.2 — money must flow through Decimal. `Number(x)` and `parseFloat`
    // are almost always wrong on monetary data; keep them visible so every
    // site gets audited. Escape hatch with an eslint-disable + reason.
    'portfolioos/no-money-coercion': 'warn',
  },
};
