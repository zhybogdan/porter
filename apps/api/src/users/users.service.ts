import { Inject, Injectable } from '@nestjs/common';
import { unauthenticated } from '../auth/unauthenticated.js';
import { TENANT_DB, type TenantDb } from '../prisma/tenant-db.js';
import type { Profile } from './dto/profile.response.js';

@Injectable()
export class UsersService {
  constructor(@Inject(TENANT_DB) private readonly db: TenantDb) {}

  /**
   * Read from the database, not echoed back from the token.
   *
   * The token holds three claims and is minutes old. Answering from it would
   * keep showing a name the user has already changed, and would cap this
   * endpoint at whatever is safe to put in a signed, publicly readable
   * string -- which an email and a full name are not.
   */
  async profile(userId: string): Promise<Profile> {
    // `findFirst` and not `findUnique`, although the id is unique: Prisma only
    // accepts unique columns in a `findUnique` filter, so the tenant scope
    // cannot be added to one and the extension refuses it outright.
    //
    // The scope then buys something here too. The id comes from the token's
    // `sub` and the organization from its `org`, and nothing has ever checked
    // that the two belong together. Now the query does: a token claiming one
    // organization and a user id from another matches no row and answers 401.
    const user = await this.db.user.findFirst({
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
