import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import { PasswordService } from '../auth/password.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TENANT_DB, type TenantDb } from '../prisma/tenant-db.js';
import type { Profile } from '../users/dto/profile.response.js';
import type { AcceptInviteDto } from './dto/accept-invite.dto.js';
import type { CreateInviteDto, InvitableRole } from './dto/create-invite.dto.js';
import type { IssuedInvite } from './dto/invite.response.js';
import { createInviteCode, hashInviteCode, INVITE_TTL_MS } from './invite-code.js';

@Injectable()
export class InvitesService {
  constructor(
    @Inject(TENANT_DB) private readonly db: TenantDb,
    // The unscoped handle, for two places that say why where they use it.
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Issue a code for one person. */
  async issue(
    manager: AuthenticatedUser,
    { email, role, unitId }: CreateInviteDto,
  ): Promise<IssuedInvite> {
    if (unitId !== undefined) {
      await this.requireUnitFor(role, unitId);
    }

    // Unscoped, because email is unique across the whole installation, not
    // per organization (`User.email` says why). Asking only this tenant
    // would issue a code that is bound to fail on accept. The price: a
    // manager learns that an address has an account somewhere. Accept would
    // tell them the same thing a week later, so this only moves the answer
    // to where it is useful.
    const taken = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (taken) {
      throw new ConflictException({
        detail: 'An account with this email already exists',
      });
    }

    const code = createInviteCode();

    const invite = await this.db.invite.create({
      // The cast is the one `PropertiesService.create` explains.
      data: {
        email,
        role,
        unitId: unitId ?? null,
        invitedById: manager.id,
        codeHash: hashInviteCode(code),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      } as Prisma.InviteUncheckedCreateInput,
      select: { id: true, email: true, role: true, unitId: true, expiresAt: true },
    });

    // The column holds the full enum; the CHECK and the DTO keep it to two.
    return { ...invite, role: invite.role as InvitableRole, code };
  }

  /**
   * Spend a code: create the account it was issued for and, for a resident
   * with a unit, move them in. All of it or none of it.
   *
   * Does not sign the new user in. The client already holds the email and
   * the password it just sent, and `POST /auth/login` is one request away;
   * issuing tokens here would be a second place that makes sessions, for the
   * sake of saving that request.
   */
  async accept(code: string, { fullName, password }: AcceptInviteDto): Promise<Profile> {
    // Unscoped, like login: the caller has no account yet, so there is no
    // tenant to scope by. The organization is read from the invite itself.
    const invite = await this.prisma.invite.findUnique({
      where: { codeHash: hashInviteCode(code) },
    });

    if (!invite) {
      throw new NotFoundException({ detail: 'Invite not found' });
    }

    if (invite.usedAt !== null || invite.expiresAt.getTime() <= Date.now()) {
      throw inviteGone();
    }

    // Hashed before the transaction opens: argon2id takes milliseconds on
    // purpose, and a transaction holds its locks for as long as it is open.
    const passwordHash = await this.passwords.hash(password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Claimed by a conditional update, as `AuthService.refresh` claims a
        // session: two requests with one code both pass the read above, and
        // only the database can say which of them spends it. The second one
        // waits for the first to commit, re-reads `used_at`, and matches
        // nothing. The expiry is tested again for the same reason: the read
        // above is already in the past.
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });

        if (claimed.count === 0) {
          throw new ClaimLost();
        }

        // An address taken since the invite was issued fails here on the
        // unique email, as 409 through the error filter, and the rollback
        // un-spends the code along with it.
        const user = await tx.user.create({
          data: {
            orgId: invite.orgId,
            email: invite.email,
            role: invite.role,
            fullName,
            passwordHash,
          },
          select: { id: true, email: true, fullName: true, role: true, orgId: true },
        });

        if (invite.unitId !== null) {
          await tx.residency.create({
            data: { orgId: invite.orgId, unitId: invite.unitId, userId: user.id },
          });
        }

        return user;
      });
    } catch (error) {
      if (error instanceof ClaimLost) {
        throw inviteGone();
      }

      throw error;
    }
  }

  /**
   * 422 unless the unit is in the caller's organization and the invite is
   * for a resident. A body field, not the path, hence 422 and not 404: the
   * line `ResidenciesService.moveIn` draws for `userId`.
   */
  private async requireUnitFor(role: InvitableRole, unitId: string): Promise<void> {
    const unit =
      role === 'resident'
        ? await this.db.unit.findFirst({ where: { id: unitId }, select: { id: true } })
        : null;

    if (!unit) {
      throw new UnprocessableEntityException({
        detail: 'Request validation failed',
        errors: [
          {
            field: 'unitId',
            message: 'must name a unit of your organization, on a resident invite only',
          },
        ],
      });
    }
  }
}

/**
 * Used or expired: one answer. 410 rather than 404, because the code did
 * exist, and the person holding it needs to hear "ask for a new one", not
 * "check what you typed".
 */
function inviteGone(): GoneException {
  return new GoneException({ detail: 'Invite has already been used or has expired' });
}

/** Thrown to roll the transaction back; never leaves this file. */
class ClaimLost extends Error {}
