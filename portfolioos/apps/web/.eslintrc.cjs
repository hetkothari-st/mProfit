module.exports = {
  extends: [
    '../../.eslintrc.cjs',
    'plugin:react-hooks/recommended',
  ],
  env: { browser: true, es2022: true },
  plugins: ['react-refresh'],
  ignorePatterns: ['dist/', 'build/', '.eslintrc.cjs'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
};
