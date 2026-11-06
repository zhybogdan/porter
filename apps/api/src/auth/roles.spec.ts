import { randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  type INestApplication,
  Module,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import type { ProblemDetail } from '../common/problem/problem-detail.js';
import type { UserRole } from '../generated/prisma/enums.js';
import type { AccessTokenPayload } from './access-token-payload.js';
import { Public } from './public.decorator.js';
import { Roles } from './roles.decorator.js';

/**
 * Fixtures, not production routes. The step needs one endpoint per role to
 * prove the matrix, and inventing three real endpoints to test a guard would
 * leave three endpoints in the API forever -- the same reasoning as the
 * `/__probe` fixture of step 4.
 */
@Controller('__roles')
class RolesProbeController {
  @Roles('manager')
  @Get('manager')
  manager(): string {
    return 'manager';
  }

  @Roles('technician')
  @Get('technician')
  technician(): string {
    return 'technician';
  }

  @Roles('resident')
  @Get('resident')
  resident(): string {
    return 'resident';
  }

  /** Two roles, because "staff but not residents" is the real shape of this. */
  @Roles('manager', 'technician')
  @Get('staff')
  staff(): string {
    return 'staff';
  }

  /** No `@Roles()`: authenticated is enough. */
  @Get('any')
  any(): string {
    return 'any';
  }
}

/** The decorator on the controller, inherited by a route that sets none. */
@Roles('manager')
@Controller('__roles-on-controller')
class ControllerLevelProbe {
  @Get()
  index(): string {
    return 'manager';
  }
}

/** Public and role-restricted at once: a contradiction, and it must be loud. */
@Public()
@Controller('__roles-contradiction')
class ContradictionProbe {
  @Roles('manager')
  @Get()
  unreachable(): string {
    return 'never';
  }
}

@Module({
  controllers: [RolesProbeController, ControllerLevelProbe, ContradictionProbe],
})
class RolesProbeModule {}

/**
 * The permission matrix, written out rather than generated: a loop that
 * derives the expected answer from the same list the guard reads would agree
 * with any bug the guard has.
 */
const MATRIX: [role: UserRole, route: string, status: number][] = [
  ['manager', 'manager', 200],
  ['technician', 'manager', 403],
  ['resident', 'manager', 403],

  ['manager', 'technician', 403],
  ['technician', 'technician', 200],
  ['resident', 'technician', 403],

  ['manager', 'resident', 403],
  ['technician', 'resident', 403],
  ['resident', 'resident', 200],

  ['manager', 'staff', 200],
  ['technician', 'staff', 200],
  ['resident', 'staff', 403],

  ['manager', 'any', 200],
  ['technician', 'any', 200],
  ['resident', 'any', 200],
];

describe('RolesGuard', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let server: Parameters<typeof request>[0];

  /**
   * A token for a user that does not exist in the database, on purpose: these
   * fixtures never read it, and the guards never do either. The test is then
   * about the role and nothing else.
   */
  function tokenFor(role: UserRole): Promise<string> {
    return jwt.signAsync({
      sub: randomUUID(),
      org: randomUUID(),
      role,
    } satisfies AccessTokenPayload);
  }

  async function get(path: string, role?: UserRole): Promise<request.Response> {
    const pending = request(server).get(path);

    return role === undefined
      ? pending
      : pending.set('Authorization', `Bearer ${await tokenFor(role)}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, RolesProbeModule],
    }).compile();

    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    jwt = app.get(JwtService);
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(MATRIX)(
    'a %s calling /__roles/%s gets %i',
    async (role, route, status) => {
      const response = await get(`/__roles/${route}`, role);

      expect(response.status).toBe(status);
    },
  );

  it('answers 401, not 403, when no token is sent to a role-gated route', async () => {
    const response = await get('/__roles/manager');

    // Authentication runs first: "who are you" has no answer yet, so asking
    // about the role would be answering the second question before the first.
    expect(response.status).toBe(401);
  });

  it('says in problem+json that the role is the problem', async () => {
    const response = await get('/__roles/manager', 'resident');
    const body = response.body as ProblemDetail;

    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(body).toMatchObject({
      status: 403,
      title: 'Forbidden',
      detail: 'This role may not use this endpoint',
      instance: '/__roles/manager',
    });
  });

  it('applies a controller-level @Roles to a route that sets none', async () => {
    expect((await get('/__roles-on-controller', 'manager')).status).toBe(200);
    expect((await get('/__roles-on-controller', 'resident')).status).toBe(403);
  });

  it('fails loudly on a route that is public and role-gated at once', async () => {
    const response = await get('/__roles-contradiction');

    // 500 and not 401: nothing is wrong with the caller. The pair of
    // decorators cannot be satisfied, and a wiring mistake of ours has to
    // look like one.
    expect(response.status).toBe(500);
  });
});
