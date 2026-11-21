import { ApiProperty } from '@nestjs/swagger';

/**
 * One unit -- a door in a building -- as a client sees it.
 *
 * `propertyId` is here although the URL already names the building: a unit
 * will also turn up where no building is in the path (a resident's own unit,
 * a request's unit), and a client should not have to remember where it got
 * the row to know whose it is. No `orgId`, for the same reason `Property`
 * has none.
 */
export class Unit {
  id!: string;
  propertyId!: string;

  /** As written on the door. */
  label!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export class UnitPage {
  @ApiProperty({ type: [Unit] })
  items!: Unit[];

  /** Pass back as `?cursor=` for the next page. Null on the last one. */
  @ApiProperty({ type: String, nullable: true })
  nextCursor!: string | null;
}
