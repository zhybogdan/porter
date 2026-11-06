import type { PasswordService } from '../auth/password.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DEMO_ORGANIZATIONS } from './demo-data.js';

export interface SeedSummary {
  organizations: number;
  users: number;
}

/**
 * Puts the demo data in the database, and can be run again.
 *
 * Idempotent through `upsert` on a key that does not change between runs: the
 * fixed organization ids, and the email of each user, which the schema already
 * makes unique. A seed that only inserted would fail the second time or double
 * every row, and both make the one-command local setup promised in the README
 * a lie as soon as anyone runs it twice.
 *
 * It also repairs rather than only creating: a demo account whose role, name
 * or password drifted is written back to what this file says. That is what
 * makes the seed, and not the database, the source of truth for demo data.
 *
 * Takes the unscoped `PrismaService` on purpose. There is no request here and
 * therefore no tenant, so the scoped handle would refuse every one of these
 * writes -- correctly, since the seed's whole job is to create the tenants
 * that scoping later keeps apart.
 */
export async function seedDemoData(
  prisma: PrismaService,
  passwords: PasswordService,
  password: string,
): Promise<SeedSummary> {
  // Hashed once, not per account. Argon2id is deliberately slow -- about nine
  // milliseconds a call here -- and five identical passwords do not need five
  // of them. Each hash still carries its own salt, so this is not the salt
  // reuse that would make two accounts' hashes comparable: it is one hash,
  // copied, for accounts that genuinely share one password.
  const passwordHash = await passwords.hash(password);

  let users = 0;

  for (const organization of DEMO_ORGANIZATIONS) {
    await prisma.organization.upsert({
      where: { id: organization.id },
      create: { id: organization.id, name: organization.name },
      update: { name: organization.name },
    });

    for (const user of organization.users) {
      await prisma.user.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          orgId: organization.id,
          role: user.role,
          fullName: user.fullName,
          passwordHash,
        },
        update: {
          orgId: organization.id,
          role: user.role,
          fullName: user.fullName,
          passwordHash,
        },
      });

      users += 1;
    }
  }

  return { organizations: DEMO_ORGANIZATIONS.length, users };
}
