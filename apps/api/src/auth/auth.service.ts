import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessTokenPayload } from './access-token-payload.js';
import type { LoginDto } from './dto/login.dto.js';
import { PasswordService } from './password.service.js';
import { createRefreshToken, hashRefreshToken } from './refresh-token.js';
import type { TokenPair } from './token-pair.js';

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

    return this.issueTokens(user);
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const refreshToken = createRefreshToken();
    const refreshTtl = this.config.get('REFRESH_TOKEN_TTL_SECONDS', {
      infer: true,
    });

    // The row is written before the response is built. If this throws, the
    // client gets an error and no tokens, which is the safe direction: a
    // refresh token the database never heard of is one no logout can kill.
    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    const payload: AccessTokenPayload = {
      sub: user.id,
      org: user.orgId,
      role: user.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
      refreshToken,
    };
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
