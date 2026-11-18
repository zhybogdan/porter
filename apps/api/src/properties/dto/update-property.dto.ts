import { PartialType } from '@nestjs/swagger';
import { CreatePropertyDto } from './create-property.dto.js';

/**
 * The body of a PATCH: the body of a POST with every field optional.
 *
 * Derived rather than written out, so the two cannot drift apart. A rule
 * added to `name` on creation -- a longer limit, a new trim -- applies to an
 * edit too, without anybody remembering that it should. `PartialType` from
 * `@nestjs/swagger` and not from `@nestjs/mapped-types`: both copy the
 * validators, only this one also copies what the OpenAPI document says.
 */
export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {}
