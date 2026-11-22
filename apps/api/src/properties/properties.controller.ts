import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPreconditionFailedResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { etagOf, requiredVersions } from '../common/concurrency/etag.js';
import { CursorPageQueryDto } from '../common/pagination/cursor-page.dto.js';
import { ProblemDetail } from '../common/problem/problem-detail.response.js';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { Property, PropertyPage } from './dto/property.response.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
import { PropertiesService } from './properties.service.js';

/**
 * The registry's first endpoints. Reading is open to every signed-in caller
 * of the organization; writing belongs to the manager, because a technician
 * or a resident who could add a building could also add one nobody asked for.
 */
/** What the `ETag` header on a building says, for every response that has one. */
const ETAG_HEADER = {
  ETag: {
    description:
      'This version of the building. Send it back as `If-Match` to change it',
    schema: { type: 'string' },
  },
};

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
  list(
    @Query() query: CursorPageQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PropertyPage> {
    return this.properties.list(query, user);
  }

  /** One building by id. */
  @Get(':id')
  @ApiOkResponse({
    description: 'The building',
    type: Property,
    headers: ETAG_HEADER,
  })
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
  async byId(
    @Param('id', ParseUUIDPipe) id: string,
    // `passthrough`: this handler only adds a header, and Nest still sends
    // the returned value as the body. Without it Nest would hand the whole
    // response over and send nothing itself.
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Property> {
    const property = await this.properties.byId(id, user);
    response.setHeader('ETag', etagOf(property.updatedAt));
    return property;
  }

  /** Add a building. Managers only. */
  @Roles('manager')
  @Post()
  @ApiCreatedResponse({
    description: 'The building created',
    type: Property,
    headers: ETAG_HEADER,
  })
  @ApiForbiddenResponse({
    description: 'Signed in, but not as a manager',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description: 'The body failed validation; `errors` names the fields',
    type: ProblemDetail,
  })
  async create(
    @Body() dto: CreatePropertyDto,
    // The tag on a 201 saves the client a GET before its first edit.
    @Res({ passthrough: true }) response: Response,
  ): Promise<Property> {
    const property = await this.properties.create(dto);
    response.setHeader('ETag', etagOf(property.updatedAt));
    return property;
  }

  /**
   * Change a building. Managers only, and only the version the caller read:
   * `If-Match` is required, so an edit made from a stale screen is refused
   * instead of quietly undoing somebody else's.
   */
  @Roles('manager')
  @Patch(':id')
  @ApiHeader({
    name: 'If-Match',
    required: true,
    description: 'The `ETag` from the last GET, POST or PATCH of this building',
  })
  @ApiOkResponse({
    description: 'The building after the change',
    type: Property,
    headers: ETAG_HEADER,
  })
  @ApiBadRequestResponse({
    description: 'The id is not a uuid, or If-Match is not a list of entity tags',
    type: ProblemDetail,
  })
  @ApiForbiddenResponse({
    description: 'Signed in, but not as a manager',
    type: ProblemDetail,
  })
  @ApiNotFoundResponse({
    description:
      'No such building in the caller’s organization. Also the answer ' +
      'when it exists in another one',
    type: ProblemDetail,
  })
  @ApiPreconditionFailedResponse({
    description:
      'The building changed since that ETag was issued. Read it again and retry',
    type: ProblemDetail,
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The body failed validation or changes nothing; `errors` names the fields',
    type: ProblemDetail,
  })
  @ApiResponse({
    status: HttpStatus.PRECONDITION_REQUIRED,
    description: 'If-Match is missing, or is `*`, which names no version',
    type: ProblemDetail,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    // Lower case: Node hands every header over lower-cased, whatever the
    // client typed.
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdatePropertyDto,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Property> {
    // The version travels in a header and not in the body, because it is a
    // fact about the request -- "apply this to the copy I saw" -- not a field
    // of the building. The same header works on any resource, and a body
    // field would have to be invented, validated and documented per resource.
    const versions = requiredVersions(ifMatch);
    const property = await this.properties.update(id, dto, versions, user);
    response.setHeader('ETag', etagOf(property.updatedAt));
    return property;
  }
}
