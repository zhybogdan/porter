import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * One class for both `/auth/refresh` and `/auth/logout`: they ask the same
 * question of the same value, and splitting them now would be two identical
 * schemas in the contract. The day one of them grows a field, it gets its own.
 */
export class RefreshTokenDto {
  /** The string handed out by login or by the previous refresh. */
  // No format is asserted beyond a size bound -- the token carries no meaning
  // for the client, and a length check here would only be the current value
  // of `REFRESH_TOKEN_BYTES` written down a second place. The bound exists
  // for the same reason as the one on the password: everything that arrives
  // gets hashed, and a megabyte of it should be refused before that.
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  refreshToken!: string;
}
