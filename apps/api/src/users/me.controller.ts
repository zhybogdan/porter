import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';
import { Profile } from './dto/profile.response.js';
import { UsersService } from './users.service.js';

/**
 * `/me` rather than `/users/:id`: the only user a client is allowed to ask
 * about by default is itself, and a path with no id in it cannot be pointed
 * at somebody else.
 */
@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  /** The signed-in user, read from the database rather than from the token. */
  // Nothing here says "authenticate", and no `@Public()` is needed to be
  // protected: the global guard has already run, so `user` is a fact by the
  // time this method is entered. Nothing here says "bearer token" either --
  // the document requires one on every operation that does not opt out.
  @Get()
  @ApiOkResponse({ description: 'The signed-in user', type: Profile })
  @ApiUnauthorizedResponse({
    description: 'Missing, malformed or expired access token',
    type: ProblemDetail,
  })
  profile(@CurrentUser() user: AuthenticatedUser): Promise<Profile> {
    return this.users.profile(user.id);
  }
}
