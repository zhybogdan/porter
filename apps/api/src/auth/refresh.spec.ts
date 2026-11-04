import { type INestApplication, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { truncateAll } from '../test/db.js';
import type { AccessTokenPayload } from './access-token-payload.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { hashRefreshToken } from './refresh-token.js';
import type { TokenPair } from './token-pair.js';

const EMAIL = 'resident@demo.test';
const PASSWORD = 'correct horse battery staple';

describe('refresh token rotation', () => {
  let app: INestApplication;
  let auth: AuthService;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  async function seedResident(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash: await passwords.hash(PASSWORD),
        role: 'resident',
        fullName: 'Demo Resident',
        organization: { create: { name: 'Demo Property Group' } },
      },
    });

    return user.id;
  }

  /** A real login, because that is the only way a session row is born. */
  async function login(): Promise<TokenPair> {
    const response = await request(server)
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);

    return response.body as TokenPair;
  }

  function refresh(refreshToken: unknown): request.Test {
    return request(server).post('/auth/refresh').send({ refreshToken });
  }

  function logout(refreshToken: unknown): request.Test {
    return request(server).post('/auth/logout').send({ refreshToken });
  }

  function sessionOf(token: string) {
    return prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(token) },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/refresh', () => {
    it('hands out a new pair and kills the token it was given', async () => {
      await seedResident();
      const first = await login();

      const response = await refresh(first.refreshToken).expect(200);
      const second = response.body as TokenPair;

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);

      const old = await sessionOf(first.refreshToken);
      const next = await sessionOf(second.refreshToken);

      expect(old.revokedAt).not.toBeNull();
      expect(old.replacedById).toBe(next.id);
      expect(next.revokedAt).toBeNull();
    });

    it('rotates again from the token it just issued', async () => {
      await seedResident();
      const first = await login();

      const second = (await refresh(first.refreshToken).expect(200))
        .body as TokenPair;
      const third = (await refresh(second.refreshToken).expect(200))
        .body as TokenPair;

      // Three rows, one chain, one live token at the end of it.
      expect(await prisma.session.count()).toBe(3);
      expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
      expect((await sessionOf(third.refreshToken)).revokedAt).toBeNull();
    });

    it('kills the whole chain when a used token comes back', async () => {
      await seedResident();
      const first = await login();
      const second = (await refresh(first.refreshToken).expect(200))
        .body as TokenPair;
      const third = (await refresh(second.refreshToken).expect(200))
        .body as TokenPair;

      // The thief holds the token from the middle of the chain. The real
      // client is still happily using the one at its end.
      await refresh(second.refreshToken).expect(401);

      expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
      // And the client that did nothing wrong is now logged out too. That is
      // the point: the API cannot tell which of the two is the thief, so it
      // ends the session and makes both of them prove the password again.
      await refresh(third.refreshToken).expect(401);
    });

    it('leaves the other sessions of the same user alone', async () => {
      await seedResident();
      const phone = await login();
      const laptop = await login();

      const rotated = (await refresh(phone.refreshToken).expect(200))
        .body as TokenPair;
      await refresh(phone.refreshToken).expect(401);

      // The chain that leaked is dead, both of its live ends included.
      expect((await sessionOf(rotated.refreshToken)).revokedAt).not.toBeNull();
      // The other login is a chain of its own and keeps working.
      await refresh(laptop.refreshToken).expect(200);
    });

    it('refuses an expired token without touching the chain', async () => {
      await seedResident();
      const { refreshToken } = await login();

      await prisma.session.update({
        where: { tokenHash: hashRefreshToken(refreshToken) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await refresh(refreshToken).expect(401);

      // Not revoked: an expired token is nobody's fault, and marking it dead
      // would make a later honest retry look like a replay.
      expect((await sessionOf(refreshToken)).revokedAt).toBeNull();
      expect(await prisma.session.count()).toBe(1);
    });

    it('answers an unknown token exactly as a replayed one', async () => {
      await seedResident();
      const first = await login();
      await refresh(first.refreshToken).expect(200);

      const replayed = await refresh(first.refreshToken).expect(401);
      const unknown = await refresh('not-a-token-anybody-ever-issued').expect(
        401,
      );

      expect(unknown.body).toEqual(replayed.body);
      expect((unknown.body as { detail: string }).detail).toBe(
        'Invalid refresh token',
      );
    });

    it('lets exactly one of two simultaneous refreshes through', async () => {
      await seedResident();
      const { refreshToken } = await login();

      // Through the service, not through HTTP. Two supertest requests do not
      // overlap here: the second one reads the row only after the first has
      // committed, so it takes the replay path and this assertion passes even
      // with the conditional claim deleted. Measured, not assumed -- and a
      // test that passes with the mechanism removed tests nothing. Called
      // directly, both reads see the row live and the claim decides.
      const outcomes = await Promise.allSettled([
        auth.refresh({ refreshToken }),
        auth.refresh({ refreshToken }),
      ]);

      expect(outcomes.map(({ status }) => status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ]);
      const loser = outcomes.find((o) => o.status === 'rejected');
      expect(loser?.reason).toBeInstanceOf(UnauthorizedException);

      // Two live tokens out of one is the failure this guards against; here
      // the loser read its loss as a replay, so the chain is gone entirely.
      expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
      // Login plus the winner's rotation, and no third row: the session the
      // loser had already created for itself went back with its transaction.
      expect(await prisma.session.count()).toBe(2);
    });

    it('rebuilds the access token from the current role', async () => {
      const userId = await seedResident();
      const { refreshToken } = await login();

      await prisma.user.update({
        where: { id: userId },
        data: { role: 'manager' },
      });

      const response = await refresh(refreshToken).expect(200);
      const { accessToken } = response.body as TokenPair;

      // The refresh is where a role change catches up with the API. Nothing
      // revokes the access token already in the client's hands, so the window
      // in which a demoted user keeps their old role is its remaining life.
      const payload = await jwt.verifyAsync<AccessTokenPayload>(accessToken);
      expect(payload.role).toBe('manager');
    });

    it('rejects a request with no token and one with a field it does not know', async () => {
      await request(server).post('/auth/refresh').send({}).expect(422);
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'x', rotate: true })
        .expect(422);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and leaves nothing to refresh with', async () => {
      await seedResident();
      const { refreshToken } = await login();

      await logout(refreshToken).expect(204);

      expect((await sessionOf(refreshToken)).revokedAt).not.toBeNull();
      await refresh(refreshToken).expect(401);
    });

    it('answers 204 twice and keeps the first time of death', async () => {
      await seedResident();
      const { refreshToken } = await login();

      await logout(refreshToken).expect(204);
      const died = (await sessionOf(refreshToken)).revokedAt;

      await logout(refreshToken).expect(204);

      expect((await sessionOf(refreshToken)).revokedAt).toEqual(died);
    });

    it('answers 204 to a token it has never seen', async () => {
      await seedResident();
      const { refreshToken } = await login();

      await logout('not-a-token-anybody-ever-issued').expect(204);

      // Said nothing, did nothing: a 401 here would tell the caller which
      // tokens exist.
      expect((await sessionOf(refreshToken)).revokedAt).toBeNull();
    });

    it('logs one device out and leaves the other signed in', async () => {
      await seedResident();
      const phone = await login();
      const laptop = await login();

      await logout(phone.refreshToken).expect(204);

      await refresh(laptop.refreshToken).expect(200);
    });
  });
});
