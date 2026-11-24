import { ApiProperty } from '@nestjs/swagger';
import { INVITABLE_ROLES, type InvitableRole } from './create-invite.dto.js';

/** An invite as issued, with its code. Returned once and never again. */
export class IssuedInvite {
  id!: string;
  email!: string;

  @ApiProperty({ enum: INVITABLE_ROLES })
  role!: InvitableRole;

  @ApiProperty({ type: String, nullable: true })
  unitId!: string | null;

  expiresAt!: Date;

  /**
   * Hand this to the person, as `POST /invites/{code}/accept`. Only its hash
   * is stored, so it cannot be shown again: a lost code means a new invite.
   */
  code!: string;
}
