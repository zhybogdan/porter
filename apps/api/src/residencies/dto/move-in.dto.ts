import { IsUUID } from 'class-validator';

export class MoveInDto {
  /** The resident's user id. Must be a resident of the caller's organization. */
  @IsUUID()
  userId!: string;
}
