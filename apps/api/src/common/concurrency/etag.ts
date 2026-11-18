import {
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

/**
 * The version of a row, as it travels in HTTP headers.
 *
 * `updated_at` is the version. Prisma moves it on every write, so there is no
 * second column to keep in step with the first. A client sees it as an entity
 * tag -- milliseconds in double quotes, the way RFC 9110 spells one -- and is
 * meant to treat it as opaque: it gets one from a GET, hands it back in
 * `If-Match`, and never compares two of them itself. The only comparison that
 * can be trusted is the one the database makes while it writes.
 *
 * Milliseconds because the column stores exactly that much
 * (`@db.Timestamptz(3)`), so the tag goes out and comes back without losing a
 * digit. More would be invented precision; less would make two different
 * versions look alike.
 */
export function etagOf(updatedAt: Date): string {
  return `"${String(updatedAt.getTime())}"`;
}

/** One entity tag: `"` + visible ASCII except `"` + `"` (RFC 9110, 8.8.3). */
const ENTITY_TAG = /^"([!#-~]*)"$/;

/**
 * The versions an `If-Match` header names, on a request that must not
 * proceed without one.
 *
 * Returns a list because the header may carry several tags and matches if
 * any of them does. A well-formed tag this API could not have issued is
 * dropped rather than refused: it is valid HTTP that simply matches nothing,
 * and the answer to that is 412 from the write, not 400 from here.
 */
export function requiredVersions(header: string | undefined): Date[] {
  const value = header?.trim() ?? '';

  if (value === '') {
    throw preconditionRequired(
      'This request must be conditional: send If-Match with the ETag from a GET of this resource',
    );
  }

  if (value === '*') {
    // Valid HTTP, read by RFC 9110 as "whatever version is current". Refused
    // anyway: it names no version, so two managers sending it would both
    // match, and the second would overwrite the first without knowing --
    // exactly what `If-Match` is required here to prevent.
    throw preconditionRequired(
      'If-Match: * names no version; send the ETag from a GET of this resource',
    );
  }

  const versions: Date[] = [];

  for (const token of value.split(',')) {
    const tag = token.trim();
    // A weak tag (`W/"..."`) fails here too, and should: it promises two
    // versions are equivalent, not identical, and RFC 9110 requires the
    // strong comparison for `If-Match`. This API never issues one.
    const opaque = ENTITY_TAG.exec(tag)?.[1];

    if (opaque === undefined) {
      throw new BadRequestException({
        detail: 'If-Match must be a list of quoted entity tags',
      });
    }

    if (/^\d+$/.test(opaque)) {
      const milliseconds = Number(opaque);

      if (Number.isSafeInteger(milliseconds)) {
        versions.push(new Date(milliseconds));
      }
    }
  }

  return versions;
}

// Nest ships an exception class for most statuses and none for 428, which
// RFC 6585 added later than the rest.
function preconditionRequired(detail: string): HttpException {
  return new HttpException({ detail }, HttpStatus.PRECONDITION_REQUIRED);
}
