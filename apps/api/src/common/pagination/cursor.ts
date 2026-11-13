import { BadRequestException } from '@nestjs/common';

/**
 * Keyset pagination over `(created_at, id)`.
 *
 * Not `skip`/`take`. An offset is a count of rows, and the count changes
 * under the reader: insert a row while somebody is on page 2 and one row
 * shifts to page 3, where they have already been -- so they never see it.
 * A cursor names the last row seen, so the next page starts after that row
 * whatever happened in between.
 *
 * The pair rather than `created_at` alone, because two rows can share a
 * timestamp: with a non-unique key the "after this" filter either skips rows
 * or repeats them, depending on which way the comparison leans. Appending the
 * id makes the key unique, and `uuid v7` makes it sort the same way as the
 * timestamp it carries.
 */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * A ceiling, not a suggestion. `?limit=100000` is how one client turns a list
 * endpoint into a way to read the whole table in one statement.
 */
export const MAX_PAGE_SIZE = 100;

/** What a cursor points at: the last row of the page just read. */
export interface CursorKey {
  createdAt: Date;
  id: string;
}

export interface CursorPage<T> {
  items: T[];
  /** Null on the last page. */
  nextCursor: string | null;
}

/**
 * Opaque on purpose: base64 of two values a client has no business reading.
 * A cursor that looks like `createdAt=...&id=...` is a cursor somebody will
 * hand-edit, and then the shape of this key becomes part of the contract and
 * cannot change without breaking them.
 */
export function encodeCursor({ createdAt, id }: CursorKey): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): CursorKey {
  const [timestamp, id, ...rest] = Buffer.from(cursor, 'base64url')
    .toString('utf8')
    .split('|');

  const createdAt = new Date(timestamp ?? '');

  if (
    rest.length > 0 ||
    id === undefined ||
    id === '' ||
    Number.isNaN(createdAt.getTime())
  ) {
    // 400 and not 422: the body validated fine, this is a value we could not
    // read at all. Clients get cursors from us and send them back unchanged,
    // so the only way to arrive here is to have made one up.
    throw new BadRequestException({ detail: 'Malformed cursor' });
  }

  return { createdAt, id };
}

/**
 * The `where` fragment that skips everything up to and including the cursor,
 * for a list ordered newest first.
 *
 * Reads as: strictly older, or the same moment and a smaller id.
 */
export function afterCursor(cursor: string | undefined): object {
  if (cursor === undefined) {
    return {};
  }

  const { createdAt, id } = decodeCursor(cursor);

  return {
    OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
  };
}

/** Newest first, with the id breaking ties the timestamp cannot. */
export const CURSOR_ORDER = [
  { createdAt: 'desc' },
  { id: 'desc' },
] as const;

/**
 * Turns one extra row into the answer to "is there a next page".
 *
 * The query asks for `limit + 1`. If it comes back, there is more, and the
 * extra row is dropped from the page rather than shown. The alternative is a
 * second `count()` query, which costs a full scan to answer a question the
 * one extra row already answers.
 */
export function toPage<T extends CursorKey>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);

  return {
    items,
    nextCursor:
      rows.length > limit && last !== undefined ? encodeCursor(last) : null,
  };
}
