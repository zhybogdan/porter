import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import type { AccessTokenPayload } from '../auth/access-token-payload.js';
import type { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { truncateAll } from '../test/db.js';
import type { Property, PropertyPage } from './dto/property.response.js';

const BODY = {
  name: 'Riverside 12',
  address: '12 Riverside Street',
  timezone: 'Europe/Kyiv',
};

describe('properties endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  /** One organization with one account per role, which is the matrix. */
  async function seedOrg(label: string): Promise<{
    orgId: string;
    token: Record<UserRole, string>;
  }> {
    const org = await prisma.organization.create({
      data: { name: `${label} Property Group` },
    });

    const roles: UserRole[] = ['manager', 'technician', 'resident'];
    const token = {} as Record<UserRole, string>;

    for (const role of roles) {
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

  /** Written with the unscoped handle: the fixture is not what is under test. */
  function seedProperty(orgId: string, name: string): Promise<{ id: string }> {
    return prisma.property.create({
      data: { ...BODY, orgId, name },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('who may do what', () => {
    it('lets every signed-in role read the list', async () => {
      const { orgId, token } = await seedOrg('alpha');
      await seedProperty(orgId, 'Riverside 12');

      for (const role of ['manager', 'technician', 'resident'] as const) {
        const response = await request(server)
          .get('/properties')
          .set('Authorization', `Bearer ${token[role]}`)
          .expect(200);

        expect((response.body as PropertyPage).items).toHaveLength(1);
      }
    });

    it('lets only the manager add one', async () => {
      const { token } = await seedOrg('alpha');

      await request(server)
        .post('/properties')
        .set('Authorization', `Bearer ${token.manager}`)
        .send(BODY)
        .expect(201);

      // 403 and not 404: the route exists and we know who is asking. What is
      // missing is permission, and saying so is not a leak -- the caller
      // already knows this endpoint is there.
      for (const role of ['technician', 'resident'] as const) {
        await request(server)
          .post('/properties')
          .set('Authorization', `Bearer ${token[role]}`)
          .send(BODY)
          .expect(403);
      }

      expect(await prisma.property.count()).toBe(1);
    });

    it('answers 401 without a token, on reads and on writes alike', async () => {
      await request(server).get('/properties').expect(401);
      await request(server).post('/properties').send(BODY).expect(401);
    });
  });

  describe('the tenant boundary', () => {
    it('shows a manager only its own organization’s buildings', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      await seedProperty(alpha.orgId, 'Alpha House');
      await seedProperty(beta.orgId, 'Beta House');

      const response = await request(server)
        .get('/properties')
        .set('Authorization', `Bearer ${alpha.token.manager}`)
        .expect(200);

      const { items } = response.body as PropertyPage;
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe('Alpha House');
    });

    it('answers 404 for another organization’s building by id', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const stranger = await seedProperty(beta.orgId, 'Beta House');

      // The id is real and the row exists. 403 here would confirm that much,
      // and a run through ids would then count a competitor's buildings.
      await request(server)
        .get(`/properties/${stranger.id}`)
        .set('Authorization', `Bearer ${alpha.token.manager}`)
        .expect(404);
    });

    it('writes the new building into the caller’s organization', async () => {
      const alpha = await seedOrg('alpha');
      await seedOrg('beta');

      const response = await request(server)
        .post('/properties')
        .set('Authorization', `Bearer ${alpha.token.manager}`)
        .send(BODY)
        .expect(201);

      // The body never mentions an organization and the client cannot choose
      // one. This is the assertion that the extension put the right one in.
      const created = await prisma.property.findUniqueOrThrow({
        where: { id: (response.body as Property).id },
        select: { orgId: true },
      });

      expect(created.orgId).toBe(alpha.orgId);
    });
  });

  describe('paging', () => {
    it('walks every row once, with no gaps and no repeats', async () => {
      const { orgId, token } = await seedOrg('alpha');

      for (let index = 0; index < 5; index += 1) {
        await seedProperty(orgId, `House ${String(index)}`);
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const query: Record<string, string> = { limit: '2' };

        if (cursor !== null) {
          query['cursor'] = cursor;
        }

        const response: { body: PropertyPage } = await request(server)
          .get('/properties')
          .query(query)
          .set('Authorization', `Bearer ${token.manager}`)
          .expect(200);

        seen.push(...response.body.items.map((item) => item.id));
        cursor = response.body.nextCursor;
        pages += 1;
      } while (cursor !== null && pages < 10);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      // Three pages of 2, 2 and 1: the last one is short, and `nextCursor`
      // is null there rather than the client having to guess from the count.
      expect(pages).toBe(3);
    });

    it('refuses a cursor it did not issue', async () => {
      const { token } = await seedOrg('alpha');

      // 400: the request is unreadable, not unauthorised and not invalid in
      // the sense the body validator means.
      await request(server)
        .get('/properties')
        .query({ cursor: 'not-a-cursor' })
        .set('Authorization', `Bearer ${token.manager}`)
        .expect(400);
    });

    it('refuses a page size above the ceiling', async () => {
      const { token } = await seedOrg('alpha');

      await request(server)
        .get('/properties')
        .query({ limit: '1000' })
        .set('Authorization', `Bearer ${token.manager}`)
        .expect(422);
    });
  });

  describe('what the body must be', () => {
    it('refuses an offset where a zone name belongs', async () => {
      const { token } = await seedOrg('alpha');

      // `+02:00` is a fact about one moment. A building stored that way shows
      // the wrong hour to everyone in it after the clocks change.
      await request(server)
        .post('/properties')
        .set('Authorization', `Bearer ${token.manager}`)
        .send({ ...BODY, timezone: '+02:00' })
        .expect(422);
    });

    it('refuses a field nobody declared', async () => {
      const { token } = await seedOrg('alpha');

      // Including `orgId`: a client that could name an organization would
      // eventually name somebody else's.
      await request(server)
        .post('/properties')
        .set('Authorization', `Bearer ${token.manager}`)
        .send({ ...BODY, orgId: '00000000-0000-7000-8000-000000000000' })
        .expect(422);
    });

    it('refuses an id that is not a uuid', async () => {
      const { token } = await seedOrg('alpha');

      await request(server)
        .get('/properties/not-a-uuid')
        .set('Authorization', `Bearer ${token.manager}`)
        .expect(400);
    });
  });
});
