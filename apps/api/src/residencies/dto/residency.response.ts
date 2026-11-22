import { ApiProperty } from '@nestjs/swagger';

/** One resident living in one unit, for a stretch of time. */
export class Residency {
  id!: string;
  unitId!: string;
  userId!: string;
  movedInAt!: Date;

  /** Null while they still live there. */
  @ApiProperty({ type: Date, nullable: true })
  movedOutAt!: Date | null;
}
