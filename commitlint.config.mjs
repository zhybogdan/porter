export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The types this repository actually uses. Without the list, a typo like
    // `feats:` passes and the squash history stops being groupable.
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'perf', 'build', 'ci', 'revert'],
    ],
    // Commit bodies here quote logs, SQL and diff output. Re-wrapping those to
    // fit a column limit corrupts them, and the alternative would be reaching
    // for --no-verify, which the project forbids.
    'body-max-line-length': [0, 'always'],
    'footer-max-line-length': [0, 'always'],
  },
};
