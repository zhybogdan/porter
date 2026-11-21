import type { JwtService } from '@nestjs/jwt';
import type { AccessTokenPayload } from '../auth/access-token-payload.js';
import type { UserRole } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export const ROLES: readonly UserRole[] = ['manager', 'technician', 'resident'];

export interface SeededOrg {
  orgId: string;
  /** A signed access token per role: one account each, which is the matrix. */
  token: Record<UserRole, string>;
}

/**
 * One organization with one account per role, written with the unscoped
 * handle: the fixture is not what is under test.
 *
 * Tokens are signed directly rather than obtained through `/auth/login`.
 * Login has its own tests; going through it here would make every endpoint
 * test also a password-hashing test, and slow for no extra proof.
 */
export async function seedOrg(
  prisma: PrismaService,
  jwt: JwtService,
  label: string,
): Promise<SeededOrg> {
  const org = await prisma.organization.create({
    data: { name: `${label} Property Group` },
  });

  const token = {} as Record<UserRole, string>;

  for (const role of ROLES) {
    const user = await prisma.user.create({
      data: {
        orgId: org.id,
        email: `${role}@${label}.test`,
        passwordHash: 'not-a-real-hash',
        role,
        fullName: `Demo ${role}`,
      },
    });

    token[role] = await jwt.signAsync({
      sub: user.id,
      org: org.id,
      role,
    } satisfies AccessTokenPayload);
  }

  return { orgId: org.id, token };
}
