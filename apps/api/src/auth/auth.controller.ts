import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Public } from './public.decorator.js';
import type { TokenPair } from './token-pair.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * 200, not the 201 Nest gives a POST by default. 201 promises a created
   * resource and a `Location` to find it at; this creates a session the
   * client can neither address nor fetch, and the body is a pair of tokens
   * rather than the thing created.
   *
   * Public, and obviously so: this is where a caller with no token goes to
   * get one.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.auth.login(dto);
  }

  /**
   * Public on purpose, and this is the one that needs the argument: the
   * refresh token in the body *is* the credential here. Demanding a live
   * access token as well would make renewal impossible exactly when it is
   * needed -- after the access token has expired.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.auth.refresh(dto);
  }

  /**
   * 204: the session is gone and there is nothing to say about it. Takes the
   * refresh token in the body rather than reading the access token, because
   * logout has to work for a client whose access token has already expired.
   * Same reason it is public: the token being revoked is the credential.
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto);
  }
}
