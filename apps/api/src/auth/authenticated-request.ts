import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/enums.js';

/**
 * The caller, in this application's own words.
 *
 * Deliberately not the token payload: `sub` and `org` are JWT vocabulary, and
 * handing them to controllers would make every future reader of "the current
 * user" learn how a token happens to be shaped today.
 */
export interface AuthenticatedUser {
  id: string;
  orgId: string;
  role: UserRole;
}

/**
 * An express request after the guard has let it through.
 *
 * `user` is not optional here, and that is the point: a handler only ever runs
 * after the guard, so code behind the guard never has to check.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
