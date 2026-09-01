import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Generated/vendor artifacts and Google Apps Script run in runtimes that are
  // not represented by the browser/Node globals below.
  globalIgnores(['dist', '.firebase', 'public/pdf.worker.min.js', 'docs/googleAppsScript.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      // This legacy React app intentionally synchronizes some view state from
      // route/prop effects. Keep correctness rules enabled while treating the
      // new React Compiler opinionated rules as non-blocking.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
    },
  },
  {
    // Node-side files: vite config, Vercel api routes, Firebase functions, scripts
    files: ['vite.config.js', 'api/**/*.js', 'functions/**/*.js', 'scripts/**/*.js', 'scratch/**/*.js', '*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
