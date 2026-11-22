import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll,
  beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import type { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type SeededOrg, seedOrg as seedOrgWith } from '../test/actors.js';
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

  function seedOrg(label: string): Promise<SeededOrg> {
    return seedOrgWith(prisma, jwt, label);
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

  // Before each test, not after: a test is then sure of the state it starts
  // from, whatever the file that ran before it left behind. Cleaning after
  // instead trusts every other file to have done the same, and one that
  // cleaned only before its own tests once left its last test's users here.
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('who may do what', () => {
    it('shows staff every building, and a resident only the ones they live in', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const home = await seedProperty(orgId, 'Riverside 12');
      await seedProperty(orgId, 'Harbour 3');

      for (const role of ['manager', 'technician'] as const) {
        const response = await request(server)
          .get('/properties')
          .set('Authorization', `Bearer ${token[role]}`)
          .expect(200);

        expect((response.body as PropertyPage).items).toHaveLength(2);
      }

      const names = async (): Promise<string[]> => {
        const response = await request(server)
          .get('/properties')
          .set('Authorization', `Bearer ${token.resident}`)
          .expect(200);

        return (response.body as PropertyPage).items.map((item) => item.name);
      };

      // Not moved in anywhere yet: nothing to see.
      expect(await names()).toEqual([]);

      const unit = await prisma.unit.create({
        data: { orgId, propertyId: home.id, label: '12B' },
      });
      const residency = await prisma.residency.create({
        data: { orgId, unitId: unit.id, userId: userId.resident },
      });

      expect(await names()).toEqual(['Riverside 12']);

      // The other building, asked for by id, is answered as if it did not
      // exist -- the same 404 another organization's building gets.
      const other = await prisma.property.findFirstOrThrow({
        where: { name: 'Harbour 3' },
      });
      await request(server)
        .get(`/properties/${other.id}`)
        .set('Authorization', `Bearer ${token.resident}`)
        .expect(404);

      // Moved out: the history stays, the view of the building goes.
      await prisma.residency.update({
        where: { id: residency.id },
        data: { movedOutAt: new Date() },
      });
      expect(await names()).toEqual([]);
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

  describe('changing a building', () => {
    /** A building, and the ETag a manager would have read it with. */
    async function readable(): Promise<{
      id: string;
      etag: string;
      token: Record<UserRole, string>;
    }> {
      const { orgId, token } = await seedOrg('alpha');
      const { id } = await seedProperty(orgId, 'Riverside 12');

      const response = await request(server)
        .get(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .expect(200);

      const etag = response.headers['etag'];

      // Ours, not just any: Express puts a weak ETag (a hash of the body) on
      // every response by itself, so a missing line in the controller would
      // still leave a header here -- one that `If-Match` refuses.
      if (typeof etag !== 'string' || !/^"\d+"$/.test(etag)) {
        throw new Error(`GET /properties/:id sent no version ETag: ${String(etag)}`);
      }

      return { id, etag, token };
    }

    it('takes the edit once and refuses the same version a second time', async () => {
      const { id, etag, token } = await readable();

      const first = await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .set('If-Match', etag)
        .send({ name: 'Riverside 12A' })
        .expect(200);

      expect((first.body as Property).name).toBe('Riverside 12A');
      // A new version, so the caller can chain its next edit without a GET.
      expect(first.headers['etag']).toBeDefined();
      expect(first.headers['etag']).not.toBe(etag);

      // The second manager read the building before the first one saved.
      await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .set('If-Match', etag)
        .send({ name: 'Riverside Twelve' })
        .expect(412);

      const stored = await prisma.property.findUniqueOrThrow({ where: { id } });
      expect(stored.name).toBe('Riverside 12A');
    });

    it('lets exactly one of two simultaneous edits through', async () => {
      const { id, etag, token } = await readable();

      // Sent together, not one after the other: this is the race, and the
      // test above only shows the order the race would have to end in.
      const statuses = await Promise.all(
        ['Edit A', 'Edit B'].map(async (name) => {
          const response = await request(server)
            .patch(`/properties/${id}`)
            .set('Authorization', `Bearer ${token.manager}`)
            .set('If-Match', etag)
            .send({ name });

          return response.status;
        }),
      );

      expect(statuses.sort()).toEqual([200, 412]);
    });

    it('answers 428 when the edit is not conditional', async () => {
      const { id, token } = await readable();

      await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .send({ name: 'Riverside 12A' })
        .expect(428);
    });

    it('answers 400 when If-Match is not an entity tag', async () => {
      const { id, token } = await readable();

      await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .set('If-Match', 'yesterday')
        .send({ name: 'Riverside 12A' })
        .expect(400);
    });

    it('lets only the manager edit', async () => {
      const { id, etag, token } = await readable();

      for (const role of ['technician', 'resident'] as const) {
        await request(server)
          .patch(`/properties/${id}`)
          .set('Authorization', `Bearer ${token[role]}`)
          .set('If-Match', etag)
          .send({ name: 'Riverside 12A' })
          .expect(403);
      }

      await request(server)
        .patch(`/properties/${id}`)
        .set('If-Match', etag)
        .send({ name: 'Riverside 12A' })
        .expect(401);
    });

    it('answers 404, not 412, for another organization’s building', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const stranger = await prisma.property.create({
        data: { ...BODY, orgId: beta.orgId },
      });

      // Even with the right version in hand: 412 would say the building is
      // real and has moved on, which is a fact about somebody else's data.
      await request(server)
        .patch(`/properties/${stranger.id}`)
        .set('Authorization', `Bearer ${alpha.token.manager}`)
        .set('If-Match', `"${String(stranger.updatedAt.getTime())}"`)
        .send({ name: 'Taken over' })
        .expect(404);

      const stored = await prisma.property.findUniqueOrThrow({
        where: { id: stranger.id },
      });
      expect(stored.name).toBe(BODY.name);
    });

    it('refuses an edit that changes nothing, or sets what it may not', async () => {
      const { id, etag, token } = await readable();

      await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .set('If-Match', etag)
        .send({})
        .expect(422);

      await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .set('If-Match', etag)
        .send({ timezone: '+02:00' })
        .expect(422);

      // The version is the database's to move, never the client's to set.
      await request(server)
        .patch(`/properties/${id}`)
        .set('Authorization', `Bearer ${token.manager}`)
        .set('If-Match', etag)
        .send({ updatedAt: '2030-01-01T00:00:00.000Z' })
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
