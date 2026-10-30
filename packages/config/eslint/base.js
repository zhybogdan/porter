import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared flat config. Each workspace re-exports it and adds what is its own:
 * Nest needs decorator metadata, Next needs the React rules.
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
);
