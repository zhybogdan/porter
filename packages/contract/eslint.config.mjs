import base from '@porter/config/eslint';

// `src/schema.ts` is written by openapi-typescript on every run of the
// contract check. Linting it would mean either a rule set that happens to
// agree with a generator nobody here controls, or `--fix` quietly editing a
// file whose next regeneration throws the edit away.
export default [...base, { ignores: ['dist/**', 'src/schema.ts'] }];
