import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { truncateAll } from '../test/db.js';
import { PrismaService } from './prisma.service.js';
import { runWithTenantContext, setTenant } from './tenant-context.js';
import { TENANT_DB, type TenantDb } from './tenant-db.js';

/**
 * What the registry tables guarantee on their own, with no service in front
 * of them.
 *
 * The one worth the file is the last pair: `org_id` is copied down from the
 * property to the unit and from the unit to the residency, and a copy is a
 * lie waiting to happen. These tests are the proof that it cannot -- that
 * the composite foreign keys refuse a row whose organization disagrees with
 * its parent's, rather than a reviewer noticing.
 */
describe('registry tables', () => {
  let prisma: PrismaService;
  let db: TenantDb;

  async function createOrg(name: string): Promise<string> {
    const org = await prisma.organization.create({ data: { name } });
    return org.id;
  }

  async function createProperty(orgId: string): Promise<string> {
    const property = await prisma.property.create({
      data: {
        orgId,
        name: 'Riverside 12',
        address: '12 Riverside Street',
        timezone: 'Europe/Kyiv',
      },
    });

    return property.id;
  }

  async function createResident(orgId: string, email: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        orgId,
        email,
        passwordHash: 'not-a-real-hash',
        role: 'resident',
        fullName: 'Demo Resident',
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
    db = moduleRef.get<TenantDb>(TENANT_DB);
  });

  afterEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('refuses two units with the same label in one property', async () => {
    const orgId = await createOrg('Demo Property Group');
    const propertyId = await createProperty(orgId);
    const unit = { orgId, propertyId, label: '12B' };

    await prisma.unit.create({ data: unit });

    await expect(prisma.unit.create({ data: unit })).rejects.toThrow(/label/);
  });

  it('allows the same label in two different properties', async () => {
    const orgId = await createOrg('Demo Property Group');
    const first = await createProperty(orgId);
    const second = await createProperty(orgId);

    await prisma.unit.create({ data: { orgId, propertyId: first, label: '12B' } });
    await prisma.unit.create({ data: { orgId, propertyId: second, label: '12B' } });

    expect(await prisma.unit.count()).toBe(2);
  });

  it('loses its units and their residencies when the property is deleted', async () => {
    const orgId = await createOrg('Demo Property Group');
    const propertyId = await createProperty(orgId);
    const userId = await createResident(orgId, 'resident@demo.test');
    const unit = await prisma.unit.create({
      data: { orgId, propertyId, label: '12B' },
    });
    await prisma.residency.create({
      data: { orgId, unitId: unit.id, userId },
    });

    await prisma.property.delete({ where: { id: propertyId } });

    // Two levels down, and that is the point of asserting both: a cascade
    // that stops halfway leaves rows pointing at a unit that no longer
    // exists, which the next query would read as a tenant's own data.
    expect(await prisma.unit.count()).toBe(0);
    expect(await prisma.residency.count()).toBe(0);
  });

  it('refuses a unit whose organization is not its property’s', async () => {
    const alpha = await createOrg('Alpha Property Group');
    const beta = await createOrg('Beta Property Group');
    const propertyId = await createProperty(alpha);

    // Both ids exist and both are the right shape. The only thing wrong is
    // that they belong to different organizations -- which is exactly the
    // mistake no `WHERE` clause written later can undo.
    await expect(
      prisma.unit.create({ data: { orgId: beta, propertyId, label: '12B' } }),
    ).rejects.toThrow(/property_id_org_id_fkey/);
  });

  it('refuses a residency joining one tenant’s unit to another’s resident', async () => {
    const alpha = await createOrg('Alpha Property Group');
    const beta = await createOrg('Beta Property Group');
    const propertyId = await createProperty(alpha);
    const unit = await prisma.unit.create({
      data: { orgId: alpha, propertyId, label: '12B' },
    });
    const outsider = await createResident(beta, 'outsider@beta.test');

    // `org_id` can only hold one value, so the row has to disagree with one
    // of its two parents whichever value it picks. Here it matches the unit
    // and therefore fails against the user.
    await expect(
      prisma.residency.create({
        data: { orgId: alpha, unitId: unit.id, userId: outsider },
      }),
    ).rejects.toThrow(/user_id_org_id_fkey/);
  });

  /**
   * The three tables were added to the tenant filter in the same step that
   * created them, so this is the proof that the list was not forgotten. A new
   * table outside that list reads across every organization in the
   * installation and nothing complains.
   *
   * Read through the scoped handle and written through the unscoped one:
   * writes through the scoped handle are still refused, and teaching it to
   * place the tenant into a nested write is step 18's job.
   */
  it('narrows properties, units and residencies to the tenant of the request', async () => {
    const alpha = await createOrg('Alpha Property Group');
    const beta = await createOrg('Beta Property Group');
    const alphaProperty = await createProperty(alpha);
    const betaProperty = await createProperty(beta);
    const alphaUser = await createResident(alpha, 'resident@alpha.test');

    const alphaUnit = await prisma.unit.create({
      data: { orgId: alpha, propertyId: alphaProperty, label: '12B' },
    });
    await prisma.unit.create({
      data: { orgId: beta, propertyId: betaProperty, label: '12B' },
    });
    await prisma.residency.create({
      data: { orgId: alpha, unitId: alphaUnit.id, userId: alphaUser },
    });

    const seen = await runWithTenantContext(async () => {
      setTenant(alpha);

      return {
        properties: await db.property.count(),
        units: await db.unit.count(),
        residencies: await db.residency.count(),
        // The leak to beat: an id the caller supplies, belonging to somebody
        // else. It has to come back as nothing rather than as a row.
        strangerProperty: await db.property.findFirst({
          where: { id: betaProperty },
        }),
      };
    });

    expect(seen.properties).toBe(1);
    expect(seen.units).toBe(1);
    expect(seen.residencies).toBe(1);
    expect(seen.strangerProperty).toBeNull();
  });
});
