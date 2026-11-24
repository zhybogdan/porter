import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';

/** The roles an invite can grant. Managers are not made by invitation. */
export const INVITABLE_ROLES = ['technician', 'resident'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export class CreateInviteDto {
  /** Who the account is for. The person accepting cannot change it. */
  // Lowercased for the reason `LoginDto` gives, and because the database
  // refuses a mixed-case address on both `invites` and `users`.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /** What the new account may do. */
  @ApiProperty({ enum: INVITABLE_ROLES })
  @IsIn(INVITABLE_ROLES)
  role!: InvitableRole;

  /** For a resident: the unit they move into when they accept. */
  @IsOptional()
  @IsUUID()
  unitId?: string;
}
