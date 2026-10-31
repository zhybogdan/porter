import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const REFUSAL = [
  '',
  'Refusing to run the suite.',
  '',
  'It truncates every table, so DATABASE_URL must point at the test database',
  'on port 5433. Start it with:',
  '',
  '  docker compose --profile test up -d --wait postgres-test',
  '',
].join('\n');

/**
 * Applies the migrations once before the suite.
 *
 * Migrations rather than a schema push: the suite then also proves that the
 * migration history replays from nothing, which is the one thing a push can
 * never tell us.
 */
export default function setup(): void {
  const url = process.env['DATABASE_URL'];

  if (!url?.includes(':5433/')) {
    // Printed and exited rather than thrown: Vite's stack formatter turns an
    // Error raised in global setup into "code.charCodeAt is not a function",
    // and a refusal whose reason is unreadable is no better than no refusal.
    console.error(`${REFUSAL}DATABASE_URL is currently: ${url ?? '(unset)'}\n`);
    process.exit(1);
  }

  const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');

  execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '..', '..'),
    stdio: 'inherit',
  });
}
