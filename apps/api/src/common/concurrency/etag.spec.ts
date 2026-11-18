import { HttpStatus, type HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { etagOf, requiredVersions } from './etag.js';

function statusOf(run: () => unknown): number {
  try {
    run();
  } catch (error) {
    return (error as HttpException).getStatus();
  }

  throw new Error('expected a throw');
}

describe('etag', () => {
  const moment = new Date('2026-11-18T09:30:00.123Z');

  it('round-trips a version through the header without losing a digit', () => {
    expect(requiredVersions(etagOf(moment))).toEqual([moment]);
  });

  it('reads every tag in a list', () => {
    const later = new Date(moment.getTime() + 1);

    expect(requiredVersions(`${etagOf(moment)}, ${etagOf(later)}`)).toEqual([
      moment,
      later,
    ]);
  });

  it('answers 428 when there is no version to check', () => {
    expect(statusOf(() => requiredVersions(undefined))).toBe(
      HttpStatus.PRECONDITION_REQUIRED,
    );
    expect(statusOf(() => requiredVersions('  '))).toBe(
      HttpStatus.PRECONDITION_REQUIRED,
    );
    expect(statusOf(() => requiredVersions('*'))).toBe(
      HttpStatus.PRECONDITION_REQUIRED,
    );
  });

  it('answers 400 to something that is not an entity tag at all', () => {
    expect(statusOf(() => requiredVersions('1763458200123'))).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect(statusOf(() => requiredVersions('W/"1763458200123"'))).toBe(
      HttpStatus.BAD_REQUEST,
    );
  });

  it('lets a well-formed tag it never issued through, to match nothing', () => {
    // Valid HTTP that names no version of ours. The write then finds no row
    // and answers 412 -- the honest answer for "your version is not current".
    expect(requiredVersions('"not-ours"')).toEqual([]);
  });
});
