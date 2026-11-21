import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll,
  beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type SeededOrg, seedOrg as seedOrgWith } from '../test/actors.js';
import { truncateAll } from '../test/db.js';
import type { UnitPage } from './dto/unit.response.js';

describe('units endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  function seedOrg(label: string): Promise<SeededOrg> {
    return seedOrgWith(prisma, jwt, label);
  }

  /** Written with the unscoped handle: the fixture is not what is under test. */
  async function seedProperty(orgId: string, name = 'Riverside 12'): Promise<string> {
    const property = await prisma.property.create({
      data: { orgId, name, address: '12 Riverside Street', timezone: 'Europe/Kyiv' },
      select: { id: true },
    });

    return property.id;
  }

  async function seedUnit(orgId: string, propertyId: string, label: string): Promise<void> {
    await prisma.unit.create({ data: { orgId, propertyId, label } });
  }

  function list(propertyId: string, token: string, query: Record<string, string> = {}) {
    return request(server)
      .get(`/properties/${propertyId}/units`)
      .query(query)
      .set('Authorization', `Bearer ${token}`);
  }

  function add(propertyId: string, token: string, body: object) {
    return request(server)
      .post(`/properties/${propertyId}/units`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
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
    it('lets every signed-in role read a building’s units', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const propertyId = await seedProperty(orgId);
      await seedUnit(orgId, propertyId, '12B');

      for (const role of ['manager', 'technician', 'resident'] as const) {
        const response = await list(propertyId, token[role]).expect(200);
        expect((response.body as UnitPage).items).toHaveLength(1);
      }
    });

    it('lets only the manager add one', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const propertyId = await seedProperty(orgId);

      const created = await add(propertyId, token.manager, { label: '12B' }).expect(201);
      expect(created.body).toMatchObject({ propertyId, label: '12B' });

      for (const role of ['technician', 'resident'] as const) {
        await add(propertyId, token[role], { label: '14A' }).expect(403);
      }

      await request(server)
        .post(`/properties/${propertyId}/units`)
        .send({ label: '14A' })
        .expect(401);

      expect(await prisma.unit.count()).toBe(1);
    });
  });

  describe('the tenant boundary', () => {
    it('answers 404 for another organization’s building, to read or to add', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const stranger = await seedProperty(beta.orgId, 'Beta House');
      await seedUnit(beta.orgId, stranger, '1');

      // Not an empty page: 200 with no items would say the building is real.
      await list(stranger, alpha.token.manager).expect(404);
      await add(stranger, alpha.token.manager, { label: '2' }).expect(404);

      expect(await prisma.unit.count({ where: { propertyId: stranger } })).toBe(1);
    });

    it('shows only the units of the building asked for', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const riverside = await seedProperty(orgId, 'Riverside 12');
      const harbour = await seedProperty(orgId, 'Harbour 3');
      await seedUnit(orgId, riverside, '12B');
      await seedUnit(orgId, harbour, '3A');

      // Same company, so the tenant filter lets both through. Only the
      // `propertyId` filter in the service keeps the other building out.
      const response = await list(riverside, token.manager).expect(200);
      const labels = (response.body as UnitPage).items.map((unit) => unit.label);

      expect(labels).toEqual(['12B']);
    });

    it('writes the new unit into the caller’s organization', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const propertyId = await seedProperty(orgId);

      await add(propertyId, token.manager, { label: '12B' }).expect(201);

      const unit = await prisma.unit.findFirstOrThrow({ select: { orgId: true } });
      expect(unit.orgId).toBe(orgId);
    });
  });

  describe('labels', () => {
    it('refuses a second door with the same label in one building', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const propertyId = await seedProperty(orgId);

      await add(propertyId, token.manager, { label: '12B' }).expect(201);
      // Trimmed first, so " 12B " is the same door and not a new one.
      await add(propertyId, token.manager, { label: ' 12B ' }).expect(409);
    });

    it('allows the same label in another building', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const riverside = await seedProperty(orgId, 'Riverside 12');
      const harbour = await seedProperty(orgId, 'Harbour 3');

      await add(riverside, token.manager, { label: '1' }).expect(201);
      await add(harbour, token.manager, { label: '1' }).expect(201);
    });

    it('refuses an empty label and fields nobody declared', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const propertyId = await seedProperty(orgId);

      await add(propertyId, token.manager, { label: '   ' }).expect(422);
      // Neither the building nor the company comes from the body: the first
      // is in the URL, the second in the token.
      await add(propertyId, token.manager, { label: '1', propertyId }).expect(422);
      await add(propertyId, token.manager, { label: '1', orgId }).expect(422);
    });

    it('refuses a building id that is not a uuid', async () => {
      const { token } = await seedOrg('alpha');

      await list('not-a-uuid', token.manager).expect(400);
    });
  });

  it('pages through a building’s units', async () => {
    const { orgId, token } = await seedOrg('alpha');
    const propertyId = await seedProperty(orgId);

    for (const label of ['1', '2', '3']) {
      await seedUnit(orgId, propertyId, label);
    }

    const first = await list(propertyId, token.manager, { limit: '2' }).expect(200);
    const firstPage = first.body as UnitPage;
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await list(propertyId, token.manager, {
      limit: '2',
      cursor: firstPage.nextCursor ?? '',
    }).expect(200);
    const secondPage = second.body as UnitPage;
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
  });
});
