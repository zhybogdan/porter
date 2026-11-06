import { SetMetadata } from '@nestjs/common';

/**
 * The metadata key the decorator writes and the guard reads.
 *
 * A constant rather than the same string literal typed out in two files: the
 * two sides have to agree exactly, and a typo in either one leaves a route
 * open with nothing failing anywhere to say so.
 */
export const IS_PUBLIC_KEY = 'auth:public';

/**
 * Marks a route, or a whole controller, as reachable without an access token.
 *
 * The white list is written down at the route it applies to, so the answer to
 * "what is open?" is a grep and not a reading of the guard.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
