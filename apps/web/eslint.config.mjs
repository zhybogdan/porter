import base from '@porter/config/eslint';

export default [...base, { ignores: ['.next/**', 'next-env.d.ts'] }];
