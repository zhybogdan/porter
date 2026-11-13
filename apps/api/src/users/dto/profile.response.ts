import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/enums.js';

/**
 * What a client is told about itself. No password hash, no timestamps: a
 * response shape is a promise, and every field in it is one more thing that
 * cannot change later without breaking somebody.
 *
 * A class and not an interface so the OpenAPI plugin can read it; see
 * `TokenPair` for the reasoning.
 */
export class Profile {
  id!: string;
  email!: string;
  fullName!: string;

  /** What this user is allowed to do. */
  // `enumName` rather than three inline strings: a named enum becomes a named
  // type in both generated clients, and the web console branches on it.
  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  /** The organization this user belongs to: the tenant boundary. */
  orgId!: string;
}
