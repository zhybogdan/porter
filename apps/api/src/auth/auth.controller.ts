import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
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
}
