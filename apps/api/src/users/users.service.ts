import { Injectable } from '@nestjs/common';
import { unauthenticated } from '../auth/unauthenticated.js';
import type { UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * What a client is told about itself. No password hash, no timestamps: a
 * response shape is a promise, and every field in it is one more thing that
 * cannot change later without breaking somebody.
 */
export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  orgId: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read from the database, not echoed back from the token.
   *
   * The token holds three claims and is minutes old. Answering from it would
   * keep showing a name the user has already changed, and would cap this
   * endpoint at whatever is safe to put in a signed, publicly readable
   * string -- which an email and a full name are not.
   */
  async profile(userId: string): Promise<Profile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        orgId: true,
      },
    });

    // A good signature over a user who no longer exists. 401 and not 404:
    // nothing is missing at this path, the caller's credential is.
    if (!user) {
      throw unauthenticated();
    }

    return user;
  }
}
