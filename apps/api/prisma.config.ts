import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

// One .env for the whole repository, the same file compose reads. Anchored to
// this file rather than the working directory: the Prisma CLI runs from
// apps/api, from the repository root and from CI, and a relative path would
// mean something different in each.
const envFile = resolve(import.meta.dirname, '..', '..', '.env');

// Absent in production, where the platform injects real variables.
if (existsSync(envFile)) {
  loadEnvFile(envFile);
}

const url = process.env['DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Declared only when there is one, and read with plain process.env rather
  // than prisma's `env()` helper, which throws while the config is being
  // loaded if the variable is missing.
  //
  // `prisma generate` needs no database, and it is apps/api's postinstall --
  // so it runs on every clean clone, where .env does not exist yet because it
  // is git-ignored. Demanding the variable here therefore broke `pnpm install`
  // on a fresh checkout, which is step 1's own acceptance check, and CI is
  // where that finally showed. Commands that do connect still refuse to run
  // without it -- "the datasource.url property is required in your Prisma
  // config file when using prisma migrate status" -- which names this file
  // rather than the variable, and is the price of the generate case working.
  ...(url === undefined ? {} : { datasource: { url } }),
});
