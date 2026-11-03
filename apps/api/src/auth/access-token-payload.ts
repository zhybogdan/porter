import type { UserRole } from '../generated/prisma/enums.js';

/**
 * Everything the API is willing to believe without touching the database.
 *
 * Three claims and no more. A JWT is signed, not encrypted: anyone holding it
 * reads it, so a name, a phone number or an email in here is a privacy leak
 * through every log and proxy that ever sees the header. And every claim is a
 * copy of a row that can change, which is why `role` is only safe at this
 * short a lifetime: demote a user and their old token keeps the old role
 * until it expires.
 */
export interface AccessTokenPayload {
  /** The user id. `sub` is the registered claim for "who this token is about". */
  sub: string;
  /** The tenant. Read by the guard of step 12, so no request has to look it up. */
  org: string;
  role: UserRole;
}
