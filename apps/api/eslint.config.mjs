import base from '@porter/config/eslint';

export default [
  ...base,
  { ignores: ['dist/**'] },
  {
    // This file is not in tsconfig's include, so type-aware rules would fail
    // to find a project for it. allowDefaultProject lets the parser handle it
    // without widening the project itself.
    files: ['eslint.config.mjs'],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
      },
    },
  },
];
