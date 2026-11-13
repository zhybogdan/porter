import { ApiProperty } from '@nestjs/swagger';

/**
 * One building, as a client sees it.
 *
 * No `orgId`. A caller only ever sees its own organization's buildings, so
 * the field would say the same thing on every row of every response, and a
 * field in the contract is a promise that costs something to keep.
 */
export class Property {
  id!: string;
  name!: string;
  address!: string;

  /** IANA zone name, for example `Europe/Kyiv`. */
  timezone!: string;

  createdAt!: Date;

  /** Also the value of the `ETag` header on this resource. */
  updatedAt!: Date;
}

export class PropertyPage {
  @ApiProperty({ type: [Property] })
  items!: Property[];

  /**
   * Pass back as `?cursor=` for the next page. Null on the last one, which is
   * how a client knows to stop -- rather than by seeing fewer rows than it
   * asked for, which is also true of a full last page.
   */
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
