// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/** Type-aware linting applies only to package/app source in a tsconfig. */
const SOURCE = ['packages/**/*.ts', 'apps/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/coverage/**', '**/*.tsbuildinfo'] },

  // Base JS rules everywhere, including root config files.
  eslint.configs.recommended,

  // Type-checked rules, scoped to source (config files aren't in a package tsconfig).
  ...tseslint.configs.recommendedTypeChecked.map((c) => ({ ...c, files: SOURCE })),
  {
    files: SOURCE,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      // Adapters and test doubles implement Promise-returning ports without an
      // internal await; that's legitimate, not a smell.
      '@typescript-eslint/require-await': 'off',
    },
  },

  // Clean-architecture dependency rule: the domain/application core must not
  // depend on any framework, I/O, or vendor SDK. Enforced here so a wrong import
  // fails CI, not review.
  {
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*'],
              message: 'core is framework-free: keep Electron in apps/desktop.',
            },
            {
              group: ['playwright', 'playwright-core', 'playwright/*'],
              message: 'core is I/O-free: keep Playwright in packages/engine.',
            },
            {
              group: ['@anthropic-ai/*'],
              message: 'core is vendor-free: keep the Claude SDK in packages/planner.',
            },
            {
              group: ['node:*', 'fs', 'path', 'child_process'],
              message: 'core is pure: no Node built-ins. Inject side effects through a port.',
            },
          ],
        },
      ],
    },
  },

  // Tests may be looser.
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-imports': 'off',
    },
  },

  prettier,
);
