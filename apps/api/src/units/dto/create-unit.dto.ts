import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateUnitDto {
  /** As written on the door: "12B", "Penthouse", "Unit 4 (rear)". */
  // Trimmed, because "12B " and "12B" are the same door, and the database
  // would otherwise let both in past the one-label-per-building rule.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  label!: string;
}
