import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { TENANT_DB, type TenantDb } from '../prisma/tenant-db.js';
import type { MoveInDto } from './dto/move-in.dto.js';
import type { Residency } from './dto/residency.response.js';

/** The columns a client is told about. Why a list: `PropertiesService`. */
const VISIBLE = {
  id: true,
  unitId: true,
  userId: true,
  movedInAt: true,
  movedOutAt: true,
} as const;

@Injectable()
export class ResidenciesService {
  constructor(@Inject(TENANT_DB) private readonly db: TenantDb) {}

  /** Who lives in a unit now, longest-standing first. */
  async current(unitId: string): Promise<Residency[]> {
    await this.requireUnit(unitId);

    // No paging: a unit holds a household, not a table's worth of rows.
    return this.db.residency.findMany({
      where: { unitId, movedOutAt: null },
      orderBy: [{ movedInAt: 'asc' }, { id: 'asc' }],
      select: VISIBLE,
    });
  }

  /** Move a resident into a unit. */
  async moveIn(unitId: string, { userId }: MoveInDto): Promise<Residency> {
    await this.requireUnit(unitId);

    const resident = await this.db.user.findFirst({
      where: { id: userId, role: 'resident' },
      select: { id: true },
    });

    if (!resident) {
      // 422 and one sentence for three cases: no such user, a user of
      // another organization, a manager or a technician. Telling the first
      // two apart would let a caller probe for other companies' user ids.
      throw new UnprocessableEntityException({
        detail: 'Request validation failed',
        errors: [
          {
            field: 'userId',
            message: 'must name a resident of your organization',
          },
        ],
      });
    }

    // Already living there is refused by the partial unique index and
    // leaves through the error filter as 409 -- not checked here first, for
    // the reason `UnitsService.create` gives.
    return this.db.residency.create({
      // The cast is the one `PropertiesService.create` explains.
      data: { unitId, userId } as Prisma.ResidencyUncheckedCreateInput,
      select: VISIBLE,
    });
  }

  /**
   * Move a resident out. The row stays, with `moved_out_at` set: a request
   * from last spring still has to say who lived in the unit when it was
   * filed, and a deleted row cannot.
   *
   * Safe to send twice. The update only touches a residency that is still
   * current, so a retry after a lost response finds nothing to change and
   * keeps the first moment, rather than moving the resident out later than
   * they left.
   */
  async moveOut(id: string): Promise<void> {
    const ended = await this.db.residency.updateMany({
      where: { id, movedOutAt: null },
      data: { movedOutAt: new Date() },
    });

    if (ended.count > 0) {
      return;
    }

    const exists = await this.db.residency.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException({ detail: 'Residency not found' });
    }

    // Already moved out: nothing to do, and the answer is the same success.
  }

  /** 404 unless the unit exists in the caller's organization. */
  private async requireUnit(id: string): Promise<void> {
    const unit = await this.db.unit.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!unit) {
      throw new NotFoundException({ detail: 'Unit not found' });
    }
  }
}
