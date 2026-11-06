import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../generated/prisma/enums.js';

/** The metadata key `RolesGuard` reads. One constant, two readers. */
export const ROLES_KEY = 'auth:roles';

/**
 * Narrows a route, or a whole controller, to the roles listed.
 *
 * Authentication is already the default, so this answers the second question:
 * not "who are you" but "may you, specifically, do this". A route with no
 * `@Roles()` is open to every signed-in caller.
 *
 * The parameter is a non-empty tuple, so `@Roles()` does not compile. An empty
 * list would be a route nobody may call -- a lock with no key, which is not a
 * thing anyone means to write and would read as "no restriction" at a glance.
 */
export const Roles = (...roles: [UserRole, ...UserRole[]]) =>
  SetMetadata(ROLES_KEY, roles);
