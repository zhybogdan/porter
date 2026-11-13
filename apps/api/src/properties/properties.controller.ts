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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CursorPageQueryDto } from '../common/pagination/cursor-page.dto.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { Property, PropertyPage } from './dto/property.response.js';
import { PropertiesService } from './properties.service.js';

/**
 * The registry's first endpoints. Reading is open to every signed-in caller
 * of the organization; writing belongs to the manager, because a technician
 * or a resident who could add a building could also add one nobody asked for.
 */
@ApiTags('properties')
@ApiUnauthorizedResponse({
  description: 'Missing, malformed or expired access token',
  type: ProblemDetail,
})
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  /** The buildings of the caller's organization, newest first. */
  @Get()
  @ApiOkResponse({ description: 'One page of buildings', type: PropertyPage })
  @ApiBadRequestResponse({
    description: 'The cursor could not be read',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'A query parameter failed validation',
    type: ProblemDetail,
  })
  list(@Query() query: CursorPageQueryDto): Promise<PropertyPage> {
    return this.properties.list(query);
  }

  /** One building by id. */
  @Get(':id')
  @ApiOkResponse({ description: 'The building', type: Property })
  @ApiBadRequestResponse({
    description: 'The id is not a uuid',
    type: ProblemDetail,
  })
  @ApiNotFoundResponse({
    description:
      'No such building in the caller’s organization. Also the answer ' +
      'when it exists in another one',
    type: ProblemDetail,
  })
  byId(@Param('id', ParseUUIDPipe) id: string): Promise<Property> {
    return this.properties.byId(id);
  }

  /** Add a building. Managers only. */
  @Roles('manager')
  @Post()
  @ApiCreatedResponse({ description: 'The building created', type: Property })
  @ApiForbiddenResponse({
    description: 'Signed in, but not as a manager',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  create(@Body() dto: CreatePropertyDto): Promise<Property> {
    return this.properties.create(dto);
  }
}
