import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  /**
   * Lowercased before validation runs, because the database holds a CHECK
   * that every stored address is lowercase: without this, `Resident@Demo.test`
   * would find no row and the owner of that account would be told their
   * password is wrong.
   */
  // The parameter is typed here because class-transformer hands the callback
  // an `any`, and returning it unchecked is what the linter objects to.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /**
   * Length is bounded above but not below. A minimum belongs to registration,
   * where it decides what may be stored; here it would only turn a wrong
   * password into a 422 and hand an attacker the password policy for free.
   * The maximum is not cosmetic: argon2id hashes whatever it is given, and a
   * megabyte of "password" is a cheap way to spend the server's memory.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
