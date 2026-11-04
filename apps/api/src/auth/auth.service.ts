import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessTokenPayload } from './access-token-payload.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { PasswordService } from './password.service.js';
import { createRefreshToken, hashRefreshToken } from './refresh-token.js';
import type { TokenPair } from './token-pair.js';

/**
 * Everything an access token is built from, and nothing else. Narrower than
 * `User` on purpose: it is also the shape the refresh query has to select, so
 * widening the token means widening this and seeing every call site fail.
 */
type TokenSubject = Pick<User, 'id' | 'orgId' | 'role'>;

/**
 * Either the client or a transaction opened on it. Writes that must land
 * together take the transaction; writes that stand alone take the client.
 */
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * An unknown email and a wrong password fail the same way: same status,
   * same body, same work done. Telling them apart is a feature for whoever
   * is checking which addresses exist in this building, and for nobody else
   * -- the person who mistyped their own email cannot act on the difference
   * anyway.
   */
  async login({ email, password }: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await this.passwords.verifyDecoy(password);
      throw invalidCredentials();
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw invalidCredentials();
    }

    // The row is written before the response is built. If this throws, the
    // client gets an error and no tokens, which is the safe direction: a
    // refresh token the database never heard of is one no logout can kill.
    const { token } = await this.createSession(user.id, this.prisma);

    return this.tokenPair(user, token);
  }

  /**
   * Rotation: the presented token dies, a new one takes its place, and the
   * dead row keeps a pointer at its successor. Without it a stolen refresh
   * token is good for the whole thirty days. With it the thief and the real
   * client hold the same token, and the next renewal by either one leaves the
   * other holding a token that no longer works.
   *
   * That is also what makes a second presentation of one token meaningful,
   * and it is the only signal this API gets that a token has leaked at all.
   */
  async refresh({ refreshToken }: RefreshTokenDto): Promise<TokenPair> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        // The role travels in the access token, so it is re-read here rather
        // than copied from the old one: a demotion reaches the API at the
        // next refresh, which is the shortest leash this design has.
        user: { select: { id: true, orgId: true, role: true } },
      },
    });

    if (!session) {
      throw invalidRefreshToken();
    }

    if (session.revokedAt) {
      await this.revokeChain(session.id);
      throw invalidRefreshToken();
    }

    // Expiry is not reuse: nothing here says the token leaked, only that
    // nobody used it in time. The chain is left alone and the client logs in.
    if (session.expiresAt.getTime() <= Date.now()) {
      throw invalidRefreshToken();
    }

    try {
      const token = await this.prisma.$transaction(async (tx) => {
        const next = await this.createSession(session.user.id, tx);

        // The old row is claimed by a conditional update rather than by the
        // read above: two requests arriving with one token both see it live,
        // and only the database can decide which of them rotates it. In READ
        // COMMITTED the second UPDATE waits on the row lock and then re-tests
        // `revoked_at IS NULL` against the committed version, so it matches
        // nothing. Both columns move in one statement because of the CHECK:
        // a row may not point at a successor while it is still usable.
        const claimed = await tx.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date(), replacedById: next.id },
        });

        if (claimed.count === 0) {
          throw new RotationLost();
        }

        return next.token;
      });

      return this.tokenPair(session.user, token);
    } catch (error) {
      if (!(error instanceof RotationLost)) {
        throw error;
      }

      // Losing the claim means this token was presented twice: the other
      // presentation rotated it a moment ago. Indistinguishable from a
      // replay, and deliberately treated as one -- telling a racing client
      // apart from a thief needs a grace window this API does not have.
      await this.revokeChain(session.id);
      throw invalidRefreshToken();
    }
  }

  /**
   * Idempotent, and answers 204 to a token it has never seen. Logout promises
   * that the token no longer works, and for an unknown or already-dead one
   * that promise is already kept. A 401 would buy nothing and cost two
   * things: an oracle for which refresh tokens exist, and a failure for the
   * client that merely retried after its first attempt timed out.
   */
  async logout({ refreshToken }: RefreshTokenDto): Promise<void> {
    // `revokedAt: null` in the filter, so a second logout cannot overwrite
    // the moment the session actually died.
    await this.prisma.session.updateMany({
      where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** A fresh refresh token, and the row that makes it revocable. */
  private async createSession(
    userId: string,
    db: Db,
  ): Promise<{ id: string; token: string }> {
    const token = createRefreshToken();
    const ttl = this.config.get('REFRESH_TOKEN_TTL_SECONDS', { infer: true });

    const { id } = await db.session.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(token),
        // Counted from now, not inherited from the token being replaced, so a
        // client that keeps renewing never has to type the password again.
        // The cost is that a chain has no end of its own; an absolute cap on
        // the chain is what would add one (see DEBT.md).
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
      select: { id: true },
    });

    return { id, token };
  }

  private async tokenPair(
    subject: TokenSubject,
    refreshToken: string,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: subject.id,
      org: subject.orgId,
      role: subject.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      refreshToken,
    };
  }

  /**
   * Reuse detection: kill every session in the rotation chain this row
   * belongs to, walking it in both directions and leaving the timestamps of
   * the already dead alone.
   *
   * The chain and not the user, because the chain is what leaked. Revoking
   * every session of the user would log their other phone out as well, which
   * hands the attacker a logout button they did not have.
   *
   * Raw SQL because walking a chain is a recursive CTE and Prisma has no
   * syntax for one; the alternative is a loop of round trips that is not
   * atomic and gets slower the longer the chain. `updated_at` is set by hand
   * for the same reason: Prisma applies `@updatedAt` in the client, and this
   * statement does not go through it.
   */
  private async revokeChain(sessionId: string): Promise<void> {
    await this.prisma.$executeRaw`
      WITH RECURSIVE chain AS (
        SELECT id, replaced_by FROM sessions WHERE id = ${sessionId}::uuid
        UNION
        SELECT s.id, s.replaced_by
        FROM sessions s
        JOIN chain c ON s.id = c.replaced_by OR s.replaced_by = c.id
      )
      UPDATE sessions SET revoked_at = now(), updated_at = now()
      WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL
    `;
  }
}

/**
 * Built in one place so the two call sites cannot drift. The message says
 * "email or password" on purpose: it is true of both failures and informative
 * about neither.
 */
function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({ detail: 'Invalid email or password' });
}

/**
 * Expired, revoked, replayed or never issued: one answer for all four. The
 * client's move is the same in every case, and the only caller who would act
 * on the difference is the one holding a stolen token.
 */
function invalidRefreshToken(): UnauthorizedException {
  return new UnauthorizedException({ detail: 'Invalid refresh token' });
}

/**
 * Thrown to roll the transaction back, never seen outside this file. Returning
 * a value instead would commit the session row that was just created for a
 * token the caller is not going to be given.
 */
class RotationLost extends Error {}
