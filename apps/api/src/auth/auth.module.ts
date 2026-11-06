import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordService } from './password.service.js';

@Module({
  imports: [
    // registerAsync, because the secret and the lifetime come from the
    // validated config and a plain register() would read process.env before
    // the schema has ever run on it.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          // Named rather than left to the library's default: the algorithm is
          // half of what a signature means. `JwtAuthGuard` pins the same name
          // on the verifying side, where accepting whatever the token claims
          // is the classic way to accept a forged one.
          algorithm: 'HS256',
          expiresIn: config.get('ACCESS_TOKEN_TTL_SECONDS', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    // Global, and declared here rather than in AppModule: the guard needs the
    // JwtService this module configures. An APP_GUARD registered in any
    // module covers every route in the application.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  // The seed of step 13 and any future password change need the same hash
  // parameters as login verifies against.
  exports: [PasswordService],
})
export class AuthModule {}
