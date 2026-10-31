import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { truncateAll } from '../test/db.js';
import { PrismaService } from './prisma.service.js';

/**
 * What the sessions table guarantees on its own, without a service in front
 * of it. These are the rules refresh rotation will lean on in the next step,
 * and a rule only the service remembers is a rule one forgotten await can
 * break.
 */
describe('sessions table', () => {
  let prisma: PrismaService;

  const future = new Date(Date.now() + 60_000);

  async function createUser(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: 'resident@demo.test',
        passwordHash: 'not-a-real-hash',
        role: 'resident',
        fullName: 'Demo Resident',
        organization: { create: { name: 'Demo Property Group' } },
      },
    });

    return user.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses a second row with the same token hash', async () => {
    const userId = await createUser();
    const row = { userId, tokenHash: 'same-hash', expiresAt: future };

    await prisma.session.create({ data: row });

    await expect(prisma.session.create({ data: row })).rejects.toThrow(
      /token_hash/,
    );
  });

  it('loses its sessions when the user is deleted', async () => {
    const userId = await createUser();
    await prisma.session.create({
      data: { userId, tokenHash: 'cascade-hash', expiresAt: future },
    });

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.session.count()).toBe(0);
  });

  it('links a rotation only when the old session is revoked with it', async () => {
    const userId = await createUser();
    const old = await prisma.session.create({
      data: { userId, tokenHash: 'first', expiresAt: future },
    });
    const next = await prisma.session.create({
      data: { userId, tokenHash: 'second', expiresAt: future },
    });

    await prisma.session.update({
      where: { id: old.id },
      data: { revokedAt: new Date(), replacedById: next.id },
    });

    const chain = await prisma.session.findUniqueOrThrow({
      where: { id: next.id },
      include: { replaces: true },
    });
    expect(chain.replaces?.id).toBe(old.id);
  });

  it('refuses a successor on a session that is still live', async () => {
    const userId = await createUser();
    const old = await prisma.session.create({
      data: { userId, tokenHash: 'live', expiresAt: future },
    });
    const next = await prisma.session.create({
      data: { userId, tokenHash: 'successor', expiresAt: future },
    });

    await expect(
      prisma.session.update({
        where: { id: old.id },
        data: { replacedById: next.id },
      }),
    ).rejects.toThrow(/sessions_replaced_is_revoked/);
  });

  it('refuses a session that replaces itself', async () => {
    const userId = await createUser();
    const session = await prisma.session.create({
      data: { userId, tokenHash: 'loop', expiresAt: future },
    });

    await expect(
      prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), replacedById: session.id },
      }),
    ).rejects.toThrow(/sessions_replaced_by_not_self/);
  });
});
