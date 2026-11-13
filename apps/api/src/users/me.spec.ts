import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import type { AccessTokenPayload } from '../auth/access-token-payload.js';
import { PasswordService } from '../auth/password.service.js';
import type { ProblemDetail } from '../common/problem/problem-detail.response.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { truncateAll } from '../test/db.js';
import type { Profile } from './dto/profile.response.js';

const EMAIL = 'resident@demo.test';
const PASSWORD = 'correct horse battery staple';
const FULL_NAME = 'Demo Resident';

/**
 * A header, a payload and no signature at all. Written by hand because no
 * signing library will produce one: `alg: none` is the forgery a verifier
 * invites when it trusts the algorithm named in the token it was handed.
 */
function unsignedToken(claims: object): string {
  const part = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.`;
}

describe('GET /me behind the global guard', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  async function seedResident(): Promise<{ id: string; orgId: string }> {
    return prisma.user.create({
      data: {
        email: EMAIL,
        passwordHash: await passwords.hash(PASSWORD),
        role: 'resident',
        fullName: FULL_NAME,
        organization: { create: { name: 'Demo Property Group' } },
      },
      select: { id: true, orgId: true },
    });
  }

  function accessTokenFor(user: { id: string; orgId: string }): Promise<string> {
    return jwt.signAsync({
      sub: user.id,
      org: user.orgId,
      role: 'resident',
    } satisfies AccessTokenPayload);
  }

  function me(token?: string): request.Test {
    const pending = request(server).get('/me');

    return token === undefined ? pending : pending.set('Authorization', token);
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
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 401 in problem+json when no token is sent at all', async () => {
    const response = await me().expect(401);
    const body = response.body as ProblemDetail;

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(body).toMatchObject({
      status: 401,
      title: 'Unauthorized',
      detail: 'Missing or invalid access token',
      instance: '/me',
    });
  });

  /**
   * RFC 9110 requires a 401 to name a scheme, and a client that has to read
   * English prose to learn what credential to send is a client that will
   * hardcode the answer instead.
   */
  it('names the scheme in WWW-Authenticate on a 401', async () => {
    const response = await me().expect(401);

    // Bare `Bearer`, with no `error="invalid_token"` and no `realm`: the
    // parameter would say which check failed, and this API refuses to say
    // that on purpose.
    expect(response.headers['www-authenticate']).toBe('Bearer');
  });

  it('rejects a scheme other than Bearer', async () => {
    const user = await seedResident();
    const token = await accessTokenFor(user);

    await me(`Token ${token}`).expect(401);
  });

  it('rejects a Bearer header carrying more than one value', async () => {
    const user = await seedResident();
    const token = await accessTokenFor(user);

    await me(`Bearer ${token} extra`).expect(401);
  });

  it('rejects something that is not a token', async () => {
    await me('Bearer not-a-token').expect(401);
  });

  it('rejects a token signed with another secret', async () => {
    const user = await seedResident();
    const foreign = new JwtService({
      secret: 'a secret this api has never seen',
      signOptions: { algorithm: 'HS256', expiresIn: '15m' },
    });

    const token = await foreign.signAsync({
      sub: user.id,
      org: user.orgId,
      role: 'resident',
    } satisfies AccessTokenPayload);

    await me(`Bearer ${token}`).expect(401);
  });

  it('rejects an expired token', async () => {
    const user = await seedResident();
    const token = await jwt.signAsync(
      { sub: user.id, org: user.orgId, role: 'resident' } satisfies AccessTokenPayload,
      { expiresIn: '-10s' },
    );

    await me(`Bearer ${token}`).expect(401);
  });

  it('rejects an unsigned token that claims alg: none', async () => {
    const user = await seedResident();

    await me(
      `Bearer ${unsignedToken({ sub: user.id, org: user.orgId, role: 'resident' })}`,
    ).expect(401);
  });

  /**
   * The test that earns the pinned `algorithms` in the guard. Same secret,
   * another HMAC size: the library's default for a string key accepts all
   * three, so without that line this token is a valid one.
   */
  it('rejects a token signed with our secret under another algorithm', async () => {
    const user = await seedResident();
    const token = await jwt.signAsync(
      { sub: user.id, org: user.orgId, role: 'resident' } satisfies AccessTokenPayload,
      { algorithm: 'HS512' },
    );

    await me(`Bearer ${token}`).expect(401);
  });

  it('rejects a correctly signed token that is not an access token', async () => {
    await seedResident();
    const token = await jwt.signAsync({ hello: 'world' });

    await me(`Bearer ${token}`).expect(401);
  });

  it('rejects a correctly signed token carrying a role this API does not have', async () => {
    const user = await seedResident();
    const token = await jwt.signAsync({
      sub: user.id,
      org: user.orgId,
      role: 'admin',
    });

    await me(`Bearer ${token}`).expect(401);
  });

  it('answers the profile, and nothing besides it, for a valid token', async () => {
    const user = await seedResident();
    const token = await accessTokenFor(user);

    const response = await me(`Bearer ${token}`).expect(200);

    // Exact equality, not a subset: a field that leaks into this response --
    // a password hash, a timestamp -- fails the test instead of shipping.
    expect(response.body as Profile).toEqual({
      id: user.id,
      email: EMAIL,
      fullName: FULL_NAME,
      role: 'resident',
      orgId: user.orgId,
    });
  });

  it('rejects a valid token whose user has since been deleted', async () => {
    const user = await seedResident();
    const token = await accessTokenFor(user);

    await prisma.user.delete({ where: { id: user.id } });

    await me(`Bearer ${token}`).expect(401);
  });

  it('leaves GET /health reachable without a token', async () => {
    await request(server).get('/health').expect(200);
  });

  it('leaves POST /auth/login reachable without a token', async () => {
    await seedResident();

    await request(server)
      .post('/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
  });
});
