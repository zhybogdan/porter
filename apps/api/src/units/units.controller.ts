import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator.js';
import { CursorPageQueryDto } from '../common/pagination/cursor-page.dto.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';
import { CreateUnitDto } from './dto/create-unit.dto.js';
import { Unit, UnitPage } from './dto/unit.response.js';
import { UnitsService } from './units.service.js';

const NOT_FOUND = {
  description:
    'No such building in the caller’s organization. Also the answer ' +
    'when it exists in another one',
  type: ProblemDetail,
};

/**
 * Units live under their building in the URL because a unit has no meaning
 * without one: "12B" names a door only once you know which house. Requests
 * will not be nested like this -- a manager reads them across every building
 * at once, and a technician across every building they are sent to.
 */
@ApiTags('units')
@ApiUnauthorizedResponse({
  description: 'Missing, malformed or expired access token',
  type: ProblemDetail,
})
@ApiBadRequestResponse({
  description: 'The building id is not a uuid, or the cursor could not be read',
  type: ProblemDetail,
})
@Controller('properties/:propertyId/units')
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  /** The units of one building, newest first. */
  @Get()
  @ApiOkResponse({ description: 'One page of units', type: UnitPage })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiUnprocessableEntityResponse({
    description: 'A query parameter failed validation',
    type: ProblemDetail,
  })
  list(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<UnitPage> {
    return this.units.list(propertyId, query);
  }

  /** Add a unit to a building. Managers only. */
  @Roles('manager')
  @Post()
  @ApiCreatedResponse({ description: 'The unit created', type: Unit })
  @ApiForbiddenResponse({
    description: 'Signed in, but not as a manager',
    type: ProblemDetail,
  })
  @ApiNotFoundResponse(NOT_FOUND)
  @ApiConflictResponse({
    description: 'This building already has a unit with that label',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  create(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateUnitDto,
  ): Promise<Unit> {
    return this.units.create(propertyId, dto);
  }
}
