import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptInviteDto {
  /** As the person wants to be addressed. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  /** At least 15 characters. */
  // This is registration, the place `LoginDto` says a minimum belongs. 15 is
  // NIST SP 800-63B-4's floor for a password that is the only factor, which
  // it is here. No rules about digits or symbols: the same document drops
  // them, because they push people to `Password1!` and not to anything
  // harder to guess. The maximum is the one login has, for its reason.
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  password!: string;
}
