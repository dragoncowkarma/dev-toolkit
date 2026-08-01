import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint flat configuration.
 *
 * Mechanically enforces the rules defined in `.agents/rules/coding_standards.md`
 * so that style compliance is verified by CI instead of by hand on every PR.
 */
export default [
  {
    // `.worktrees/` holds other Workers' materialized branches - never lint them.
    ignores: ['dist/**', 'node_modules/**', '.worktrees/**', 'coverage/**'],
  },

  // Application and test sources.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...js.configs.recommended.rules,

      // coding_standards.md - "Maximum line length: 100 characters."
      'max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: false }],
      // coding_standards.md - "Use 2-space indentation for JS/JSX/CSS".
      indent: ['error', 2, { SwitchCase: 1 }],
      // coding_standards.md - "Prefer `const` over `let`; never use `var`."
      'no-var': 'error',
      'prefer-const': 'error',
      // Unused variables and imports are style drift; enforced in tests too.
      'no-unused-vars': ['error', { args: 'after-used', ignoreRestSiblings: true }],

      // React 19 + automatic JSX runtime: importing React is not required.
      'react/react-in-jsx-scope': 'off',
      // Marks components referenced only from JSX as used, so `no-unused-vars`
      // does not report every imported component.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Vitest globals are only available inside test files and the setup file.
  {
    files: [
      'src/**/*.{test,spec}.{js,jsx}',
      'vitest.setup.js',
    ],
    languageOptions: {
      globals: {
        // Vitest runs the jsdom environment on top of Node, so both the browser
        // globals above and Node's `global` object are available in tests.
        global: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
      },
    },
  },

  // Node-side config files (vite/vitest/eslint configuration).
  {
    files: ['*.config.js', 'vitest.setup.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: false }],
      indent: ['error', 2, { SwitchCase: 1 }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': 'error',
    },
  },
];
