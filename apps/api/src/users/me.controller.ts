import { Controller, Get } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { type Profile, UsersService } from './users.service.js';

/**
 * `/me` rather than `/users/:id`: the only user a client is allowed to ask
 * about by default is itself, and a path with no id in it cannot be pointed
 * at somebody else.
 */
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  /**
   * Nothing here says "authenticate", and no `@Public()` is needed to be
   * protected: the global guard has already run, so `user` is a fact by the
   * time this method is entered.
   */
  @Get()
  profile(@CurrentUser() user: AuthenticatedUser): Promise<Profile> {
    return this.users.profile(user.id);
  }
}
