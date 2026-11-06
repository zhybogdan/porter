import { UnauthorizedException } from '@nestjs/common';

/**
 * One body for every way authentication fails: no header, wrong scheme, a
 * broken signature, an expired token, claims this API does not recognise, or
 * a user deleted since the token was signed.
 *
 * A client can act on "your token is not good" and can do nothing with which
 * of the six checks rejected it. An attacker can: "expired" says the
 * signature verified, which says the secret is right.
 */
export function unauthenticated(): UnauthorizedException {
  return new UnauthorizedException({ detail: 'Missing or invalid access token' });
}
