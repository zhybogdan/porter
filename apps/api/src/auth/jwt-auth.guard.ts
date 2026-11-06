import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserRole } from '../generated/prisma/enums.js';
import { setTenant } from '../prisma/tenant-context.js';
import type { AccessTokenPayload } from './access-token-payload.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { unauthenticated } from './unauthenticated.js';

/**
 * Authentication for every route, with an explicit white list.
 *
 * Registered once as `APP_GUARD`, not hung on controllers one by one. Both
 * ways can be got wrong, and the difference is which mistake is safe: forget
 * `@Public()` and a public route answers 401 until someone notices, forget
 * the guard and a private route answers 200 to anybody and nobody notices.
 *
 * It asks the database nothing. That is the whole point of carrying a signed
 * token, and also its price: a user demoted or deleted a minute ago still
 * holds a valid token until it expires. Fifteen minutes is the leash.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Handler first, then controller: a public controller may still hold one
    // protected route, and the decorator nearer the code is the deliberate
    // one. `getAllAndOverride` returns the first of the two that is set.
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = bearerToken(request.headers.authorization);

    if (token === null) {
      throw unauthenticated();
    }

    let claims: Record<string, unknown>;

    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        // One algorithm, named here rather than taken from the token's own
        // header. Measured, not assumed: removing this line does not let
        // `alg: none` through, because jsonwebtoken already refuses an
        // unsigned token when the key is a string. What it does let through
        // is HS384 and HS512 signed with our own secret -- the library's
        // default for a string key is all three -- which is an accepted
        // token shape nobody designed. And the day this secret becomes an
        // RSA public key, the same looseness is the classic forgery: sign
        // HS256 with the key the server publishes itself.
        algorithms: ['HS256'],
      });
    } catch {
      throw unauthenticated();
    }

    // A verified signature says the token is ours, which is not the same as
    // saying it is the kind of token this guard knows how to read.
    if (!isAccessTokenPayload(claims)) {
      throw unauthenticated();
    }

    (request as AuthenticatedRequest).user = {
      id: claims.sub,
      orgId: claims.org,
      role: claims.role,
    };

    // The same fact, recorded a second time and for a different reader. The
    // request object is for controllers; this is for the database handle,
    // which has no request to look at and must not be handed one -- a query
    // layer that reaches for HTTP is a query layer that cannot be used from a
    // job or a test.
    setTenant(claims.org);

    return true;
  }
}

/**
 * The token out of `Authorization: Bearer <token>`, or null for a header that
 * is absent, uses another scheme, or carries anything but one value.
 */
function bearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }

  const [scheme, token, ...rest] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || token === undefined || rest.length > 0) {
    return null;
  }

  return token;
}

const ROLES = new Set<string>(Object.values(UserRole));

function isAccessTokenPayload(
  claims: Record<string, unknown>,
): claims is Record<string, unknown> & AccessTokenPayload {
  return (
    typeof claims['sub'] === 'string' &&
    typeof claims['org'] === 'string' &&
    typeof claims['role'] === 'string' &&
    ROLES.has(claims['role'])
  );
}
