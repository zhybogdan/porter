import { createHash, randomBytes } from 'node:crypto';

/**
 * 256 bits of randomness. A refresh token is an opaque string the client
 * hands back verbatim, so it needs no structure and no claims -- only enough
 * entropy that guessing one is hopeless.
 */
const REFRESH_TOKEN_BYTES = 32;

export function createRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256, not argon2id. Argon2 is slow on purpose because a password is
 * short and guessable; this token is 256 random bits, so there is no
 * dictionary to walk and nothing for slowness to buy. What the hash does buy
 * is that a leaked dump of `sessions` contains no usable token -- and it is
 * computed on every refresh, where argon2id's nine milliseconds would be a
 * tax on every client in the fleet.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
