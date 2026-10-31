import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: './',
    include: ['src/**/*.spec.ts'],
    // Explicit imports from 'vitest' instead of globals: a test file should
    // say where describe and expect come from, and the tsconfig then needs no
    // ambient types for them.
    globals: false,
  },
});
