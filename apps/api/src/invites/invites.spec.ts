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
import type { Profile } from '../users/dto/profile.response.js';
import type { IssuedInvite } from './dto/invite.response.js';
import { hashInviteCode } from './invite-code.js';

const PASSWORD = 'correct horse battery staple';

describe('invites endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  function seedOrg(label: string): Promise<SeededOrg> {
    return seedOrgWith(prisma, jwt, label);
  }

  async function seedUnit(orgId: string): Promise<string> {
    const property = await prisma.property.create({
      data: { orgId, name: 'Riverside 12', address: '12 Riverside Street', timezone: 'Europe/Kyiv' },
    });
    const unit = await prisma.unit.create({
      data: { orgId, propertyId: property.id, label: '12B' },
    });
    return unit.id;
  }

  function issue(token: string, body: object) {
    return request(server)
      .post('/invites')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  function accept(code: string, body: object = { fullName: 'Olena Koval', password: PASSWORD }) {
    return request(server).post(`/invites/${code}/accept`).send(body);
  }

  async function issued(token: string, body: object): Promise<IssuedInvite> {
    return (await issue(token, body).expect(201)).body as IssuedInvite;
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

  describe('issuing', () => {
    it('lets only the manager issue', async () => {
      const { token } = await seedOrg('alpha');
      const body = { email: 'new@alpha.test', role: 'technician' };

      await issue(token.technician, body).expect(403);
      await issue(token.resident, body).expect(403);
      await request(server).post('/invites').send(body).expect(401);
      await issue(token.manager, body).expect(201);
    });

    it('returns the code once and stores only its hash', async () => {
      const { token } = await seedOrg('alpha');

      const invite = await issued(token.manager, { email: 'New@Alpha.test ', role: 'technician' });

      expect(invite.email).toBe('new@alpha.test');
      const row = await prisma.invite.findUniqueOrThrow({ where: { id: invite.id } });
      expect(row.codeHash).toBe(hashInviteCode(invite.code));
      expect(row.codeHash).not.toContain(invite.code);
    });

    it('refuses to make a manager', async () => {
      const { token } = await seedOrg('alpha');

      await issue(token.manager, { email: 'boss@alpha.test', role: 'manager' }).expect(422);
    });

    it('refuses a unit on a technician invite, and another organization’s unit', async () => {
      const alpha = await seedOrg('alpha');
      const beta = await seedOrg('beta');
      const ours = await seedUnit(alpha.orgId);
      const theirs = await seedUnit(beta.orgId);

      const tech = await issue(alpha.token.manager, { email: 'a@alpha.test', role: 'technician', unitId: ours }).expect(422);
      expect(tech.body).toMatchObject({ errors: [{ field: 'unitId' }] });

      await issue(alpha.token.manager, { email: 'b@alpha.test', role: 'resident', unitId: theirs }).expect(422);
      expect(await prisma.invite.count()).toBe(0);
    });

    it('refuses an email that already has an account, in any organization', async () => {
      const alpha = await seedOrg('alpha');
      await seedOrg('beta');

      await issue(alpha.token.manager, { email: 'resident@beta.test', role: 'resident' }).expect(409);
    });
  });

  describe('accepting', () => {
    it('creates the account in the inviting organization, and it can sign in', async () => {
      const alpha = await seedOrg('alpha');
      await seedOrg('beta');
      const { code } = await issued(alpha.token.manager, { email: 'tech@alpha.test', role: 'technician' });

      const created = await accept(code).expect(201);
      const profile = created.body as Profile;

      expect(profile).toMatchObject({ email: 'tech@alpha.test', role: 'technician', orgId: alpha.orgId });

      await request(server)
        .post('/auth/login')
        .send({ email: 'tech@alpha.test', password: PASSWORD })
        .expect(200);
    });

    it('moves a resident into the unit on the invite', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const unitId = await seedUnit(orgId);
      const { code } = await issued(token.manager, { email: 'flat@alpha.test', role: 'resident', unitId });

      const profile = (await accept(code).expect(201)).body as Profile;

      const residency = await prisma.residency.findFirstOrThrow({ where: { userId: profile.id } });
      expect(residency).toMatchObject({ unitId, orgId, movedOutAt: null });
    });

    it('works once', async () => {
      const { token } = await seedOrg('alpha');
      const { code } = await issued(token.manager, { email: 'once@alpha.test', role: 'technician' });

      await accept(code).expect(201);
      await accept(code, { fullName: 'Somebody Else', password: PASSWORD }).expect(410);
    });

    it('answers 410 for an expired code and 404 for an unknown one', async () => {
      const { token } = await seedOrg('alpha');
      const { id, code } = await issued(token.manager, { email: 'late@alpha.test', role: 'technician' });

      await prisma.invite.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      await accept(code).expect(410);
      await accept('no-such-code').expect(404);
      expect(await prisma.user.count({ where: { email: 'late@alpha.test' } })).toBe(0);
    });

    it('lets exactly one of two simultaneous accepts through', async () => {
      const { token } = await seedOrg('alpha');
      const { code } = await issued(token.manager, { email: 'race@alpha.test', role: 'technician' });

      const statuses = await Promise.all([1, 2].map(async () => (await accept(code)).status));

      expect(statuses.sort()).toEqual([201, 410]);
      expect(await prisma.user.count({ where: { email: 'race@alpha.test' } })).toBe(1);
    });

    it('keeps the code unspent when the email was taken in the meantime', async () => {
      const { orgId, token } = await seedOrg('alpha');
      const { id, code } = await issued(token.manager, { email: 'taken@alpha.test', role: 'technician' });

      await prisma.user.create({
        data: { orgId, email: 'taken@alpha.test', passwordHash: 'x', role: 'resident', fullName: 'Early Bird' },
      });

      await accept(code).expect(409);

      // The rollback took the claim with it.
      const row = await prisma.invite.findUniqueOrThrow({ where: { id } });
      expect(row.usedAt).toBeNull();
    });

    it('refuses a password shorter than 15 characters, without spending the code', async () => {
      const { token } = await seedOrg('alpha');
      const { id, code } = await issued(token.manager, { email: 'short@alpha.test', role: 'technician' });

      const response = await accept(code, { fullName: 'Olena Koval', password: 'fourteen chars' }).expect(422);
      expect(response.body).toMatchObject({ errors: [{ field: 'password' }] });

      const row = await prisma.invite.findUniqueOrThrow({ where: { id } });
      expect(row.usedAt).toBeNull();
    });
  });

  describe('rules the database holds itself', () => {
    it('refuses a manager invite and a unit on a technician invite', async () => {
      const { orgId, userId } = await seedOrg('alpha');
      const unitId = await seedUnit(orgId);
      const base = {
        orgId,
        invitedById: userId.manager,
        expiresAt: new Date(Date.now() + 60_000),
      };

      await expect(
        prisma.invite.create({ data: { ...base, codeHash: 'a', email: 'm@alpha.test', role: 'manager' } }),
      ).rejects.toThrow();
      await expect(
        prisma.invite.create({ data: { ...base, codeHash: 'b', email: 't@alpha.test', role: 'technician', unitId } }),
      ).rejects.toThrow();
    });
  });
});
