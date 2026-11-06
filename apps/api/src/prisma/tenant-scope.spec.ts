import {
  Controller,
  Get,
  Inject,
  type INestApplication,
  Module,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import type { AccessTokenPayload } from '../auth/access-token-payload.js';
import { PasswordService } from '../auth/password.service.js';
import { truncateAll } from '../test/db.js';
import { PrismaService } from './prisma.service.js';
import { TENANT_DB, type TenantDb } from './tenant-db.js';

/**
 * Fixtures: the routes a real feature would have, without adding them to the
 * API before week 3 needs them. Each one does the plainest possible thing
 * through the tenant handle, so a failure here is the scope and not a feature.
 */
@Controller('__tenant')
class TenantProbeController {
  constructor(@Inject(TENANT_DB) private readonly db: TenantDb) {}

  /** No filter at all: whatever comes back, the extension put the limit on it. */
  @Get('users')
  async users(): Promise<string[]> {
    const rows = await this.db.user.findMany({ select: { email: true } });

    return rows.map((row) => row.email);
  }

  @Get('users/count')
  count(): Promise<number> {
    return this.db.user.count();
  }

  /** A lookup by a primary key the caller supplies, which is the leak to beat. */
  @Get('users/:id')
  async user(@Param('id') id: string): Promise<{ email: string }> {
    const row = await this.db.user.findFirst({
      where: { id },
      select: { email: true },
    });

    // 404 and not 403: the row the caller asked for does not exist as far as
    // this caller is concerned, and saying "forbidden" would confirm that it
    // exists somewhere -- which is exactly the fact a tenant boundary hides.
    if (row === null) {
      throw new NotFoundException({ detail: 'User not found' });
    }

    return row;
  }

  @Get('organization')
  organization(): Promise<{ name: string } | null> {
    return this.db.organization.findFirst({ select: { name: true } });
  }

  /** An operation the extension cannot filter, and therefore refuses. */
  @Get('refused/:id')
  refused(@Param('id') id: string): Promise<unknown> {
    return this.db.user.findUnique({ where: { id } });
  }

  /** A filter that names somebody else's organization, on purpose. */
  @Get('cross/:orgId')
  cross(@Param('orgId') orgId: string): Promise<unknown> {
    return this.db.user.findMany({ where: { orgId } });
  }
}

@Module({ controllers: [TenantProbeController] })
class TenantProbeModule {}

const PASSWORD = 'correct horse battery staple';

interface Seeded {
  orgId: string;
  managerId: string;
  managerEmail: string;
  residentEmail: string;
  /** An access token for this organization's manager, ready to send. */
  token: string;
}

describe('org_id as the tenant boundary', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwords: PasswordService;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  let a: Seeded;
  let b: Seeded;

  /** One organization with a manager and a resident, seeded unscoped. */
  async function seedOrg(slug: string): Promise<Seeded> {
    const managerEmail = `manager@${slug}.test`;
    const residentEmail = `resident@${slug}.test`;
    const passwordHash = await passwords.hash(PASSWORD);

    const org = await prisma.organization.create({
      data: {
        name: `${slug} Property Group`,
        users: {
          create: [
            {
              email: managerEmail,
              passwordHash,
              role: 'manager',
              fullName: `${slug} Manager`,
            },
            {
              email: residentEmail,
              passwordHash,
              role: 'resident',
              fullName: `${slug} Resident`,
            },
          ],
        },
      },
      select: { id: true, users: { select: { id: true, email: true } } },
    });

    const manager = org.users.find((user) => user.email === managerEmail);

    if (manager === undefined) {
      throw new Error('seed did not create the manager');
    }

    return {
      orgId: org.id,
      managerId: manager.id,
      managerEmail,
      residentEmail,
      token: await jwt.signAsync({
        sub: manager.id,
        org: org.id,
        role: 'manager',
      } satisfies AccessTokenPayload),
    };
  }

  async function userIdOf(email: string): Promise<string> {
    const { id } = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    });

    return id;
  }

  function asManagerOf(seed: Seeded, path: string): request.Test {
    return request(server)
      .get(path)
      .set('Authorization', `Bearer ${seed.token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, TenantProbeModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    passwords = app.get(PasswordService);
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    a = await seedOrg('alpha');
    b = await seedOrg('beta');
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists only the caller organization, with no filter written anywhere', async () => {
    const response = await asManagerOf(a, '/__tenant/users').expect(200);

    expect((response.body as string[]).sort()).toEqual(
      [a.managerEmail, a.residentEmail].sort(),
    );
  });

  it('counts only the caller organization', async () => {
    // Four users exist. The query says `count()` and nothing else.
    expect(await prisma.user.count()).toBe(4);

    const response = await asManagerOf(a, '/__tenant/users/count').expect(200);

    expect(response.text).toBe('2');
  });

  it('answers 404, not 403, for a user of another organization by direct id', async () => {
    const foreign = await userIdOf(b.residentEmail);

    const response = await asManagerOf(a, `/__tenant/users/${foreign}`).expect(
      404,
    );

    expect(JSON.stringify(response.body)).not.toContain(b.residentEmail);
  });

  it('still finds a user of the caller organization by direct id', async () => {
    const own = await userIdOf(a.residentEmail);

    const response = await asManagerOf(a, `/__tenant/users/${own}`).expect(200);

    expect(response.body).toEqual({ email: a.residentEmail });
  });

  it('gives each caller its own organization row and never the other one', async () => {
    const forA = await asManagerOf(a, '/__tenant/organization').expect(200);
    const forB = await asManagerOf(b, '/__tenant/organization').expect(200);

    expect(forA.body).toEqual({ name: 'alpha Property Group' });
    expect(forB.body).toEqual({ name: 'beta Property Group' });
  });

  it('refuses an operation it cannot filter instead of passing it through', async () => {
    const foreign = await userIdOf(b.residentEmail);

    // findUnique takes only unique columns, so org_id cannot be added to it.
    // Letting it through would be a lookup by id across every tenant.
    await asManagerOf(a, `/__tenant/refused/${foreign}`).expect(500);
  });

  it('refuses a query that names another organization outright', async () => {
    await asManagerOf(a, `/__tenant/cross/${b.orgId}`).expect(500);
  });

  it('allows a query that names the caller own organization', async () => {
    await asManagerOf(a, `/__tenant/cross/${a.orgId}`).expect(200);
  });

  it('catches a token whose organization and user do not belong together', async () => {
    // Signed by us, so the signature is fine, and the role is real. The user
    // is from alpha and the organization from beta. Before the scope existed
    // nothing compared the two claims and /me answered 200.
    const token = await jwt.signAsync({
      sub: a.managerId,
      org: b.orgId,
      role: 'manager',
    } satisfies AccessTokenPayload);

    await request(server)
      .get('/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('refuses to query at all when there is no request to take a tenant from', async () => {
    const db = app.get<TenantDb>(TENANT_DB);

    // No HTTP request, so no store and no tenant: a job or a script reaching
    // for this handle gets an error rather than every organization's rows.
    await expect(db.user.findMany()).rejects.toThrow(/needs a tenant/);
  });
});
