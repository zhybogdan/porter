import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';
import { MoveInDto } from './dto/move-in.dto.js';
import { Residency } from './dto/residency.response.js';
import { ResidenciesService } from './residencies.service.js';

const FORBIDDEN = {
  description: 'Signed in, but not in a role that may do this',
  type: ProblemDetail,
};

/**
 * Who lives where. Reading and moving in go under the unit, because a
 * residency is created for one; moving out goes to the residency itself,
 * because by then it has its own id and the unit adds nothing.
 *
 * Residents cannot call any of it: the list is other people's names and
 * dates, and moving in or out is the manager's record to keep.
 */
@ApiTags('residencies')
@ApiUnauthorizedResponse({
  description: 'Missing, malformed or expired access token',
  type: ProblemDetail,
})
@ApiBadRequestResponse({ description: 'An id is not a uuid', type: ProblemDetail })
@Controller()
export class ResidenciesController {
  constructor(private readonly residencies: ResidenciesService) {}

  /** The current residents of a unit. */
  @Roles('manager', 'technician')
  @Get('units/:unitId/residencies')
  @ApiOkResponse({ description: 'Current residencies', type: [Residency] })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({
    description: 'No such unit in the caller’s organization',
    type: ProblemDetail,
  })
  current(
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ): Promise<Residency[]> {
    return this.residencies.current(unitId);
  }

  /** Move a resident in. Managers only. */
  @Roles('manager')
  @Post('units/:unitId/residencies')
  @ApiCreatedResponse({ description: 'The residency started', type: Residency })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({
    description: 'No such unit in the caller’s organization',
    type: ProblemDetail,
  })
  @ApiConflictResponse({
    description: 'That resident already lives in that unit',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation, or `userId` is not a resident',
    type: ProblemDetail,
  })
  moveIn(
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: MoveInDto,
  ): Promise<Residency> {
    return this.residencies.moveIn(unitId, dto);
  }

  /**
   * Move a resident out. Managers only. Ends the residency rather than
   * deleting it, and answers 204 again if it has already ended.
   */
  @Roles('manager')
  @Delete('residencies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'The residency has ended' })
  @ApiForbiddenResponse(FORBIDDEN)
  @ApiNotFoundResponse({
    description: 'No such residency in the caller’s organization',
    type: ProblemDetail,
  })
  moveOut(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.residencies.moveOut(id);
  }
}
