import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Each workspace re-exports it and adds what is its own:
 * Nest needs decorator metadata, Next needs the React rules.
 *
 * Block order matters: in flat config the last matching block wins, so the
 * narrow exceptions sit at the end.
 */
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/*.generated.*'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      // An unawaited promise is the single most common source of silent
      // failures in both Nest services and sync workers, so it is an error.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Config files (eslint, vitest, nest) live outside tsconfig's include, so
    // the project service has no program for them and parsing fails outright.
    // Linting them without type information is enough.
    //
    // This block is last on purpose. Placed before the block above, its
    // settings were overridden and the failure looked like a glob problem.
    files: ['**/*.config.{ts,mts,cts,js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: { projectService: false, project: false, program: null },
    },
  },
);
