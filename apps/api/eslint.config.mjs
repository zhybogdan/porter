import base from '@porter/config/eslint';

export default [...base, { ignores: ['dist/**', 'src/generated/**'] }];
