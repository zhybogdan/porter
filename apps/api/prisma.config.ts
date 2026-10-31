import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig, env } from 'prisma/config';

// One .env for the whole repository, the same file compose reads. Anchored to
// this file rather than the working directory: the Prisma CLI runs from
// apps/api, from the repository root and from CI, and a relative path would
// mean something different in each.
const envFile = resolve(import.meta.dirname, '..', '..', '.env');

// Absent in production, where the platform injects real variables.
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
