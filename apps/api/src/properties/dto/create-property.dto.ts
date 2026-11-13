import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsTimeZone } from '../../common/validation/is-time-zone.decorator.js';

export class CreatePropertyDto {
  /** What the managers call this building: "Riverside 12". */
  // Trimmed, because a name typed with a trailing space is the same building
  // and would sort and search as a different one.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  /** Free text, one line, as a courier would read it. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string;

  /** IANA zone name, for example `Europe/Kyiv`. */
  // Required, with no default. A default would be this server's zone, and the
  // building is not where the server is: every due date and booking slot is
  // read by somebody standing in the building, so guessing it wrong is a
  // wrong hour shown to a resident rather than a formatting detail.
  @IsString()
  @IsTimeZone()
  timezone!: string;
}
