import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';
import { Profile } from '../users/dto/profile.response.js';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { CreateInviteDto } from './dto/create-invite.dto.js';
import { IssuedInvite } from './dto/invite.response.js';
import { InvitesService } from './invites.service.js';

/**
 * The way in for somebody who has no account. A manager issues a code for
 * one email and one role; the person holding it sets a name and a password,
 * and the account appears in the manager's organization.
 */
@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  /** Issue an invite. Managers only. */
  @Roles('manager')
  @Post()
  @ApiCreatedResponse({ description: 'The invite, with its code', type: IssuedInvite })
  @ApiUnauthorizedResponse({
    description: 'Missing, malformed or expired access token',
    type: ProblemDetail,
  })
  @ApiForbiddenResponse({
    description: 'Signed in, but not in a role that may do this',
    type: ProblemDetail,
  })
  @ApiConflictResponse({
    description: 'An account with this email already exists',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation, or `unitId` is not usable here',
    type: ProblemDetail,
  })
  issue(
    @CurrentUser() manager: AuthenticatedUser,
    @Body() dto: CreateInviteDto,
  ): Promise<IssuedInvite> {
    return this.invites.issue(manager, dto);
  }

  /** Accept an invite: create the account it was issued for. */
  // Public, like login: the code in the path is the credential, and the
  // caller has no token because they have no account yet.
  //
  // 201, unlike login's 200: this does create something the client can
  // address afterwards -- a user -- and the body is that user. Signing in is
  // the next request, `POST /auth/login`, with the email from the invite.
  @Public()
  @Post(':code/accept')
  @ApiOperation({ security: [] })
  @ApiCreatedResponse({ description: 'The account created', type: Profile })
  @ApiNotFoundResponse({ description: 'No invite with this code', type: ProblemDetail })
  @ApiGoneResponse({
    description: 'The invite has already been used or has expired',
    type: ProblemDetail,
  })
  @ApiConflictResponse({
    description: 'An account with this email was created after the invite',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  accept(@Param('code') code: string, @Body() dto: AcceptInviteDto): Promise<Profile> {
    return this.invites.accept(code, dto);
  }
}
