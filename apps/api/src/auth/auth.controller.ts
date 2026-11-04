import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import type { TokenPair } from './token-pair.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * 200, not the 201 Nest gives a POST by default. 201 promises a created
   * resource and a `Location` to find it at; this creates a session the
   * client can neither address nor fetch, and the body is a pair of tokens
   * rather than the thing created.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.auth.login(dto);
  }

  /**
   * Stays open to anonymous callers once the guard of step 10 arrives: the
   * refresh token is the credential, and requiring a live access token to
   * renew one would make renewal impossible exactly when it is needed.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.auth.refresh(dto);
  }

  /**
   * 204: the session is gone and there is nothing to say about it. Takes the
   * refresh token in the body rather than reading the access token, because
   * logout has to work for a client whose access token has already expired.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto);
  }
}
