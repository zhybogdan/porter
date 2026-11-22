import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type SeededOrg, seedOrg as seedOrgWith } from '../test/actors.js';
import { truncateAll } from '../test/db.js';
import type { Residency } from './dto/residency.response.js';

describe('residencies endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  function seedOrg(label: string): Promise<SeededOrg> {
    return seedOrgWith(prisma, jwt, label);
  }

  /** A building with one unit per label, written with the unscoped handle. */
  async function seedUnits(orgId: string, ...labels: string[]): Promise<string[]> {
    const property = await prisma.property.create({
      data: { orgId, name: 'Riverside 12', address: '12 Riverside Street', timezone: 'Europe/Kyiv' },
    });

    const ids: string[] = [];

    for (const label of labels) {
      const unit = await prisma.unit.create({
        data: { orgId, propertyId: property.id, label },
      });
      ids.push(unit.id);
    }

    return ids;
  }

  function moveIn(unitId: string, token: string, userId: string) {
    return request(server)
      .post(`/units/${unitId}/residencies`)
      .set('Authorization', `Bearer ${token}`)
      .send({ userId });
  }

  function moveOut(residencyId: string, token: string) {
    return request(server)
      .delete(`/residencies/${residencyId}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function current(unitId: string, token: string) {
    return request(server)
      .get(`/units/${unitId}/residencies`)
      .set('Authorization', `Bearer ${token}`);
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

  // Before each test, not after: why in properties.spec.ts.
  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('who may do what', () => {
    it('lets only the manager move people in and out', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      for (const role of ['technician', 'resident'] as const) {
        await moveIn(unitId, token[role], userId.resident).expect(403);
      }

      const created = await moveIn(unitId, token.manager, userId.resident).expect(201);
      const { id } = created.body as Residency;

      for (const role of ['technician', 'resident'] as const) {
        await moveOut(id, token[role]).expect(403);
      }

      await request(server).post(`/units/${unitId}/residencies`).send({ userId: userId.resident }).expect(401);
      await request(server).delete(`/residencies/${id}`).expect(401);
    });

    it('shows who lives in a unit to staff, not to residents', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      await current(unitId, token.manager).expect(200);
      await current(unitId, token.technician).expect(200);
      // Other people's names and dates: a resident's own unit included.
      await current(unitId, token.resident).expect(403);
    });
  });

  describe('moving in', () => {
    it('lets one resident live in two units at once', async () => {
      // Decided by the owner: a person can own two flats in one complex.
      const { orgId, token, userId } = await seedOrg('alpha');
      const [first = '', second = ''] = await seedUnits(orgId, '12B', '14A');

      await moveIn(first, token.manager, userId.resident).expect(201);
      await moveIn(second, token.manager, userId.resident).expect(201);
    });

    it('refuses the same resident in the same unit twice', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      await moveIn(unitId, token.manager, userId.resident).expect(201);
      await moveIn(unitId, token.manager, userId.resident).expect(409);
    });

    it('lets exactly one of two simultaneous move-ins through', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      // The race the partial unique index exists for: two managers pressing
      // "add" for the same person at the same moment.
      const statuses = await Promise.all(
        [1, 2].map(async () => (await moveIn(unitId, token.manager, userId.resident)).status),
      );

      expect(statuses.sort()).toEqual([201, 409]);
      expect(await prisma.residency.count()).toBe(1);
    });

    it('lets a resident move back in after moving out', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      const first = await moveIn(unitId, token.manager, userId.resident).expect(201);
      await moveOut((first.body as Residency).id, token.manager).expect(204);
      await moveIn(unitId, token.manager, userId.resident).expect(201);

      // Two rows for one pair: one in the past, one current.
      expect(await prisma.residency.count()).toBe(2);
    });

    it('refuses someone who is not a resident of this organization', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const [unitId = ''] = await seedUnits(alpha.orgId, '12B');

      // A manager, a stranger's resident, and an id nobody has: one answer.
      for (const userId of [
        alpha.userId.manager,
        beta.userId.resident,
        '00000000-0000-7000-8000-000000000000',
      ]) {
        const response = await moveIn(unitId, alpha.token.manager, userId).expect(422);
        expect(response.body).toMatchObject({ errors: [{ field: 'userId' }] });
      }
    });

    it('answers 404 for another organization’s unit', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const [stranger = ''] = await seedUnits(beta.orgId, '1');

      await moveIn(stranger, alpha.token.manager, alpha.userId.resident).expect(404);
      await current(stranger, alpha.token.manager).expect(404);
    });
  });

  describe('moving out', () => {
    it('ends the residency instead of deleting it', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      const created = await moveIn(unitId, token.manager, userId.resident).expect(201);
      const { id } = created.body as Residency;

      await moveOut(id, token.manager).expect(204);

      // Gone from the unit's current list...
      const now = await current(unitId, token.manager).expect(200);
      expect(now.body).toEqual([]);

      // ...and still in the history, with the moment it ended.
      const row = await prisma.residency.findUniqueOrThrow({ where: { id } });
      expect(row.movedOutAt).not.toBeNull();
    });

    it('answers 204 again on a repeat, and keeps the first moment', async () => {
      const { orgId, token, userId } = await seedOrg('alpha');
      const [unitId = ''] = await seedUnits(orgId, '12B');

      const created = await moveIn(unitId, token.manager, userId.resident).expect(201);
      const { id } = created.body as Residency;

      await moveOut(id, token.manager).expect(204);
      const first = await prisma.residency.findUniqueOrThrow({ where: { id } });

      // A retry after a lost response must not move them out later than
      // they left.
      await moveOut(id, token.manager).expect(204);
      const second = await prisma.residency.findUniqueOrThrow({ where: { id } });

      expect(second.movedOutAt).toEqual(first.movedOutAt);
    });

    it('answers 404 for another organization’s residency', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const [unitId = ''] = await seedUnits(beta.orgId, '1');
      const theirs = await prisma.residency.create({
        data: { orgId: beta.orgId, unitId, userId: beta.userId.resident },
      });

      await moveOut(theirs.id, alpha.token.manager).expect(404);

      const row = await prisma.residency.findUniqueOrThrow({ where: { id: theirs.id } });
      expect(row.movedOutAt).toBeNull();
    });
  });

  it('refuses a moved-out date before the moved-in date, in the database itself', async () => {
    const { orgId, userId } = await seedOrg('alpha');
    const [unitId = ''] = await seedUnits(orgId, '12B');
    const residency = await prisma.residency.create({
      data: { orgId, unitId, userId: userId.resident },
    });

    await expect(
      prisma.residency.update({
        where: { id: residency.id },
        data: { movedOutAt: new Date('2000-01-01T00:00:00.000Z') },
      }),
    ).rejects.toThrow();
  });
});
