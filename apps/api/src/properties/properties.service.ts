import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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
}
