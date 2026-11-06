import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/enums.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { ROLES_KEY } from './roles.decorator.js';

/**
 * Authorization, and only that: by the time this runs `JwtAuthGuard` has
 * already established who the caller is, because global guards run in the
 * order `AuthModule` declares them.
 *
 * A guard and a decorator rather than `if (user.role === 'manager')` inside
 * each service. Three reasons, in order of how much they cost when ignored:
 * the rule is then visible at the route instead of buried in a method nobody
 * reads before calling it; it is one place to test rather than one per
 * service; and a service called from somewhere new -- a job, a seed, another
 * service -- carries its check along and refuses work it was never meant to
 * refuse.
 *
 * The role comes from the access token, never from a fresh read. That is what
 * makes this free, and it is why a demoted manager stays a manager until the
 * token expires (see DEBT.md).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No `@Roles()` means every authenticated caller, not everybody: the
    // authentication guard has already turned the anonymous ones away.
    if (allowed === undefined) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();
    const user = request.user;

    if (user === undefined) {
      // `@Roles()` on a route the authentication guard waved through, which
      // means the route is also `@Public()`. That pair cannot be satisfied:
      // it demands a role from a caller who was never asked to have one.
      // Our mistake, not the client's, so it is a 500 with a stack in the
      // log rather than a 401 that would read like a credential problem.
      throw new Error(
        `@Roles() on a public route: ${context.getClass().name}.${context.getHandler().name}`,
      );
    }

    if (!allowed.includes(user.role)) {
      // 403, not 404 or 401. The caller is known and their credential is
      // fine; what is missing is permission, and saying so is not a leak
      // here -- the path is in the contract either way.
      throw new ForbiddenException({
        detail: 'This role may not use this endpoint',
      });
    }

    return true;
  }
}
