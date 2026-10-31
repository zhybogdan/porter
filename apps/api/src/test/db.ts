import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Empties every table between tests.
 *
 * Truncation, not a transaction rolled back per test: two requests inside one
 * transaction never compete, so a rollback-based suite cannot test a race —
 * and the races are what the suite exists for.
 *
 * The table list is read from the database rather than written here, so a new
 * migration does not silently leave a table dirty.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const list = tables.map(({ tablename }) => `"public"."${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
