import {
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  afterCursor,
  CURSOR_ORDER,
  type CursorPage,
  DEFAULT_PAGE_SIZE,
  toPage,
} from '../common/pagination/cursor.js';
import type { Prisma } from '../generated/prisma/client.js';
import { TENANT_DB, type TenantDb } from '../prisma/tenant-db.js';
import type { CursorPageQueryDto } from '../common/pagination/cursor-page.dto.js';
import type { CreatePropertyDto } from './dto/create-property.dto.js';
import type { Property } from './dto/property.response.js';
import type { UpdatePropertyDto } from './dto/update-property.dto.js';

/**
 * The columns a client is told about, in one place. Spelling them out rather
 * than returning the row means a column added to the table later -- an
 * internal note, a soft-delete flag -- does not appear in the API because
 * somebody forgot it would.
 */
const VISIBLE = {
  id: true,
  name: true,
  address: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PropertiesService {
  // The scoped handle, never `PrismaService`: every query below is written as
  // if this organization were the only one in the database, and that is the
  // extension's job to make true.
  constructor(@Inject(TENANT_DB) private readonly db: TenantDb) {}

  async list({
    cursor,
    limit = DEFAULT_PAGE_SIZE,
  }: CursorPageQueryDto): Promise<CursorPage<Property>> {
    const rows = await this.db.property.findMany({
      where: afterCursor(cursor),
      orderBy: [...CURSOR_ORDER],
      // One more than asked for, and `toPage` says why.
      take: limit + 1,
      select: VISIBLE,
    });

    return toPage(rows, limit);
  }

  async byId(id: string): Promise<Property> {
    // `findFirst`, not `findUnique`: Prisma only takes unique columns in a
    // `findUnique` filter, so the tenant cannot be added to one -- and the
    // extension refuses it for exactly that reason.
    const property = await this.db.property.findFirst({
      where: { id },
      select: VISIBLE,
    });

    if (!property) {
      // 404 whether the building belongs to somebody else or does not exist.
      // 403 would answer a question the caller is not entitled to ask: it
      // says "this one is real", and a run through made-up ids would then
      // count a competitor's buildings.
      throw new NotFoundException({ detail: 'Property not found' });
    }

    return property;
  }

  create(dto: CreatePropertyDto): Promise<Property> {
    return this.db.property.create({
      // No `orgId`, and that is the point: the extension writes it from the
      // request's tenant, so a handler cannot name the wrong organization
      // because it cannot name one at all.
      //
      // The cast is the price. A Prisma query extension rewrites the
      // arguments at run time and cannot rewrite the generated types, so the
      // compiler still demands the column the extension is about to add. One
      // assertion, in the one place a row is created, with the reason beside
      // it -- rather than a column passed by every caller and checked by
      // nobody.
      data: dto as Prisma.PropertyCreateInput,
      select: VISIBLE,
    });
  }

  /**
   * Change a building, but only the version the caller has seen.
   *
   * `versions` come from `If-Match`: the `updated_at` values the caller
   * believes are current. The write goes through only if one of them still
   * is, so two managers editing the same building from the same read cannot
   * both win -- the second one is told the building moved on, instead of
   * silently erasing the first one's change.
   */
  async update(
    id: string,
    dto: UpdatePropertyDto,
    versions: Date[],
  ): Promise<Property> {
    if (Object.keys(dto).length === 0) {
      // Not a harmless no-op: the write would still move `updated_at`, and
      // every other client holding this building's ETag would then be told
      // it changed when nothing did.
      throw new UnprocessableEntityException({
        detail: 'Send at least one field to change',
      });
    }

    // One statement, and the version is part of its filter. That is the whole
    // lock: the database lets one write at a time touch the row, the first
    // one moves `updated_at`, and the second one's filter then matches
    // nothing. Reading the row first and comparing in code would leave a gap
    // between the check and the write for another request to land in.
    //
    // `updateManyAndReturn`, not `update`: `update` takes a unique `where`,
    // which can hold neither the tenant nor the version, and the tenant
    // extension refuses it for that reason.
    const [updated] = await this.db.property.updateManyAndReturn({
      where: { id, updatedAt: { in: versions } },
      data: dto,
      select: VISIBLE,
    });

    if (updated) {
      return updated;
    }

    // Nothing was written, for one of two reasons, and they need different
    // answers: the building is not there (404, nothing to retry against) or
    // it changed since the caller read it (412, read it again and retry).
    // `byId` throws the 404, with the same rule about other organizations.
    await this.byId(id);

    throw new PreconditionFailedException({
      detail:
        'The building changed since the ETag you sent; read it again and retry',
    });
  }
}
