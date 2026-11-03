import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { truncateAll } from '../test/db.js';
import type { AccessTokenPayload } from './access-token-payload.js';
import { PasswordService } from './password.service.js';
import { hashRefreshToken } from './refresh-token.js';
import type { TokenPair } from './token-pair.js';

const EMAIL = 'resident@demo.test';
const PASSWORD = 'correct horse battery staple';

describe('POST /auth/login', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  /** One organization, one resident, with a hash produced the real way. */
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

  function login(body: Record<string, unknown>): request.Test {
    return request(server).post('/auth/login').send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('hands back both tokens for the right password', async () => {
    await seedResident();

    const response = await login({ email: EMAIL, password: PASSWORD }).expect(
      200,
    );
    const body = response.body as TokenPair;

    expect(body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.refreshToken).toHaveLength(43);
    expect(body.expiresIn).toBe(900);
  });

  it('stores the refresh token as a hash and never in the clear', async () => {
    await seedResident();

    const response = await login({ email: EMAIL, password: PASSWORD });
    const { refreshToken } = response.body as TokenPair;

    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });

    // The token itself must appear nowhere in the row: a dump of this table
    // has to be useless to whoever reads it.
    expect(JSON.stringify(session)).not.toContain(refreshToken);
    expect(session.revokedAt).toBeNull();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts the email in any case', async () => {
    await seedResident();

    await login({ email: ' Resident@Demo.TEST ', password: PASSWORD }).expect(
      200,
    );
  });

  it('answers a wrong password and an unknown email identically', async () => {
    await seedResident();

    const wrongPassword = await login({
      email: EMAIL,
      password: 'not the password',
    }).expect(401);
    const unknownEmail = await login({
      email: 'nobody@demo.test',
      password: PASSWORD,
    }).expect(401);

    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(unknownEmail.headers['content-type']).toBe(
      wrongPassword.headers['content-type'],
    );
    expect((wrongPassword.body as { detail: string }).detail).toBe(
      'Invalid email or password',
    );
  });

  it('hashes once even when the email is unknown', async () => {
    // Equal bodies are the easy half. The expensive half is that both paths
    // do the same work, or the response time answers the question the body
    // refuses to. Counted rather than timed: a clock-based assertion on a
    // 50 ms hash is a flaky test, not a stronger one.
    const verify = vi.spyOn(passwords, 'verify');

    await login({ email: 'nobody@demo.test', password: PASSWORD }).expect(401);

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('creates no session when login fails', async () => {
    await seedResident();

    await login({ email: EMAIL, password: 'not the password' }).expect(401);

    expect(await prisma.session.count()).toBe(0);
  });

  it('puts the user, the tenant and the role in the access token, and nothing else', async () => {
    const userId = await seedResident();

    const response = await login({ email: EMAIL, password: PASSWORD });
    const { accessToken } = response.body as TokenPair;

    const payload = await jwt.verifyAsync<AccessTokenPayload>(accessToken);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    expect(payload.sub).toBe(userId);
    expect(payload.org).toBe(user.orgId);
    expect(payload.role).toBe('resident');
    // iat and exp are the library's; anything beyond them is ours and would
    // be readable by everyone the header passes through.
    expect(Object.keys(payload).sort()).toEqual([
      'exp',
      'iat',
      'org',
      'role',
      'sub',
    ]);
  });

  it('rejects a field it does not know', async () => {
    const response = await login({
      email: EMAIL,
      password: PASSWORD,
      rememberMe: true,
    }).expect(422);

    expect(JSON.stringify(response.body)).toContain('rememberMe');
  });

  it('rejects a password longer than the maximum before hashing it', async () => {
    const hash = vi.spyOn(passwords, 'verify');

    await login({ email: EMAIL, password: 'x'.repeat(129) }).expect(422);

    expect(hash).not.toHaveBeenCalled();
  });
});
