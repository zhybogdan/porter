import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  afterCursor,
  CURSOR_ORDER,
  type CursorPage,
  DEFAULT_PAGE_SIZE,
  toPage,
} from '../common/pagination/cursor.js';
import type { CursorPageQueryDto } from '../common/pagination/cursor-page.dto.js';
import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import type { Prisma } from '../generated/prisma/client.js';
import { visibleProperties } from '../properties/property-visibility.js';
import { TENANT_DB, type TenantDb } from '../prisma/tenant-db.js';
import type { CreateUnitDto } from './dto/create-unit.dto.js';
import type { Unit } from './dto/unit.response.js';

/** The columns a client is told about. Why a list: `PropertiesService`. */
const VISIBLE = {
  id: true,
  propertyId: true,
  label: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UnitsService {
  constructor(@Inject(TENANT_DB) private readonly db: TenantDb) {}

  /** The units of one building, newest first. */
  async list(
    propertyId: string,
    { cursor, limit = DEFAULT_PAGE_SIZE }: CursorPageQueryDto,
    user: AuthenticatedUser,
  ): Promise<CursorPage<Unit>> {
    await this.requireProperty(propertyId, user);

    const rows = await this.db.unit.findMany({
      // Two filters, and each does a different job. `propertyId` keeps the
      // other buildings of the same company out; the extension adds `orgId`
      // and keeps the other companies out. Either one alone leaks.
      where: { propertyId, ...afterCursor(cursor) },
      orderBy: [...CURSOR_ORDER],
      take: limit + 1,
      select: VISIBLE,
    });

    return toPage(rows, limit);
  }

  /** Add a door to a building. */
  async create(
    propertyId: string,
    dto: CreateUnitDto,
    user: AuthenticatedUser,
  ): Promise<Unit> {
    await this.requireProperty(propertyId, user);

    // A second label "12B" in the same building is refused by the unique
    // index and leaves through the error filter as 409. Not checked here
    // first: a check before the insert is the check-then-act gap again, and
    // two managers adding the same door at once would both pass it.
    return this.db.unit.create({
      // No `orgId`: the extension writes it, and the composite foreign key
      // then refuses the row unless the building belongs to that same
      // organization. The cast is the one `PropertiesService.create` explains.
      data: { ...dto, propertyId } as Prisma.UnitUncheckedCreateInput,
      select: VISIBLE,
    });
  }

  /**
   * 404 unless the building exists in the caller's organization.
   *
   * Without it, a list for somebody else's building would come back as an
   * empty page -- a 200 that pretends the building is real and merely bare --
   * and an insert into it would hit the foreign key and answer 409, which
   * says "there is something here you conflict with". 404 is what every other
   * route answers for another organization's id, and the answer has to be
   * the same everywhere for it to hide anything.
   */
  private async requireProperty(
    id: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const property = await this.db.property.findFirst({
      // A resident sees the doors of the buildings they live in, and only
      // those: 404 for the rest, as in `PropertiesService.byId`.
      where: { id, ...visibleProperties(user) },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException({ detail: 'Property not found' });
    }
  }
}
