import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'vitest/config';

// The suite runs against the test database, never the development one.
// loadEnvFile does not overwrite variables that are already set, so CI can
// pass them in and this file stays the local default.
const envFile = resolve(import.meta.dirname, '..', '..', '.env.test');
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

export default defineConfig({
  test: {
    root: './',
    include: ['src/**/*.spec.ts'],
    globals: false,
    // One database, so files cannot run at the same time: two suites
    // truncating the same tables would delete each other's rows mid-test.
    fileParallelism: false,
    globalSetup: ['src/test/global-setup.ts'],
  },
});
