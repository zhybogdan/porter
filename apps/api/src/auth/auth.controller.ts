import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { TokenPair } from './dto/token-pair.response.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Public } from './public.decorator.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';

// Two kinds of comment live in this file, and the difference is who reads
// them. A `/** */` above a route is harvested by the OpenAPI plugin and ends
// up in the document every client is generated from, so it is written for a
// stranger integrating against this API. A `//` comment is for whoever opens
// this repository and is never published.
//
// `security: []` on each route says the same thing the `@Public()` above it
// says, but to a different audience: the decorator tells the guard to let the
// request through, the override tells the document that no token is expected.
// The two are written side by side so they are hard to change apart, and the
// day that stops being enough they become one decorator.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Exchange an email and a password for a token pair. */
  // 200, not the 201 Nest gives a POST by default. 201 promises a created
  // resource and a `Location` to find it at; this creates a session the
  // client can neither address nor fetch, and the body is a pair of tokens
  // rather than the thing created.
  //
  // Public, and obviously so: this is where a caller with no token goes to
  // get one.
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ security: [] })
  @ApiOkResponse({ description: 'A new token pair', type: TokenPair })
  @ApiUnauthorizedResponse({
    description: 'Unknown email or wrong password; the two are not told apart',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.auth.login(dto);
  }

  /** Exchange a refresh token for a new pair. */
  // Public on purpose, and this is the one that needs the argument: the
  // refresh token in the body *is* the credential here. Demanding a live
  // access token as well would make renewal impossible exactly when it is
  // needed -- after the access token has expired.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'The presented token stops working. Presenting one a second time is ' +
      'treated as a leak and revokes every token in its chain.',
    security: [],
  })
  @ApiOkResponse({ description: 'A new token pair', type: TokenPair })
  @ApiUnauthorizedResponse({
    description: 'Unknown, expired or already used refresh token',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.auth.refresh(dto);
  }

  /** Revoke one refresh token. */
  // 204: the session is gone and there is nothing to say about it. Takes the
  // refresh token in the body rather than reading the access token, because
  // logout has to work for a client whose access token has already expired.
  // Same reason it is public: the token being revoked is the credential.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ security: [] })
  @ApiNoContentResponse({
    description: 'The token is revoked, or was revoked already',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto);
  }
}
