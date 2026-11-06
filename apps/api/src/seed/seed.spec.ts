import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PasswordService } from '../auth/password.service.js';
import type { TokenPair } from '../auth/token-pair.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { truncateAll } from '../test/db.js';
import type { Profile } from '../users/users.service.js';
import { DEMO_ORGANIZATIONS, README_ACCOUNTS } from './demo-data.js';
import { seedDemoData } from './seed.js';

const PASSWORD = 'porter-demo-password';

describe('the demo seed', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let server: Parameters<typeof request>[0];

  function seed(password = PASSWORD): ReturnType<typeof seedDemoData> {
    return seedDemoData(prisma, passwords, password);
  }

  function login(email: string, password: string): request.Test {
    return request(server).post('/auth/login').send({ email, password });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is reachable through the env schema the api already validates', () => {
    const password = app
      .get(ConfigService<Env, true>)
      .get('SEED_PASSWORD', { infer: true });

    expect(password).toBe(PASSWORD);
  });

  it('fills an empty database with two organizations and five users', async () => {
    const summary = await seed();

    expect(summary).toEqual({ organizations: 3, users: 5 });
    expect(await prisma.organization.count()).toBe(2);
    expect(await prisma.user.count()).toBe(5);
  });

  it('runs a second time without duplicating anything', async () => {
    await seed();
    await seed();

    expect(await prisma.organization.count()).toBe(2);
    expect(await prisma.user.count()).toBe(5);
  });

  it('lets all three README accounts log in', async () => {
    await seed();

    for (const account of README_ACCOUNTS) {
      const response = await login(account.email, PASSWORD).expect(200);

      expect((response.body as TokenPair).accessToken).toMatch(
        /^[\w-]+\.[\w-]+\.[\w-]+$/,
      );
    }
  });

  it('puts the README accounts in one organization and the rest in another', async () => {
    await seed();

    const [alpha, beta] = DEMO_ORGANIZATIONS;

    if (alpha === undefined || beta === undefined) {
      throw new Error('the demo data lost an organization');
    }

    expect(await prisma.user.count({ where: { orgId: alpha.id } })).toBe(3);
    expect(await prisma.user.count({ where: { orgId: beta.id } })).toBe(2);
  });

  it('never stores the password itself', async () => {
    await seed();

    const rows = await prisma.user.findMany({ select: { passwordHash: true } });

    for (const row of rows) {
      expect(row.passwordHash).not.toContain(PASSWORD);
      expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    }
  });

  it('writes a changed password back on the next run', async () => {
    await seed();
    await seed('another-demo-password');

    const account = README_ACCOUNTS[0];

    if (account === undefined) {
      throw new Error('the demo data lost its first account');
    }

    // The seed is the source of truth for demo data, not the database: a
    // password changed in the environment has to take effect on a re-run, or
    // the README stops matching the deployed demo.
    await login(account.email, 'another-demo-password').expect(200);
    await login(account.email, PASSWORD).expect(401);
  });

  it('produces accounts the tenant scope already confines', async () => {
    await seed();

    const alpha = DEMO_ORGANIZATIONS[0];
    const manager = README_ACCOUNTS[0];

    if (alpha === undefined || manager === undefined) {
      throw new Error('the demo data lost its first organization');
    }

    const tokens = await login(manager.email, PASSWORD).expect(200);
    const { accessToken } = tokens.body as TokenPair;

    const me = await request(server)
      .get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // End to end on real seeded rows: the seed wrote the organization, login
    // put it in the token, the guard copied it into the request and the
    // scoped query matched on it.
    expect((me.body as Profile).orgId).toBe(alpha.id);
  });
});
