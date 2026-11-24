import { createHash, randomBytes } from 'node:crypto';

/**
 * 256 bits, the same as a refresh token, and for the same reason: the code is
 * the only thing standing between a stranger and an account in somebody's
 * building, so guessing one has to be hopeless. It travels as a link, not as
 * something typed by hand, which is what lets it be this long.
 */
const INVITE_CODE_BYTES = 32;

/** How long a code works. A week: long enough to reach somebody on holiday. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInviteCode(): string {
  return randomBytes(INVITE_CODE_BYTES).toString('base64url');
}

/**
 * SHA-256 rather than argon2id, for the reason `hashRefreshToken` gives: the
 * code is random, so there is no dictionary for slowness to defend against.
 */
export function hashInviteCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
