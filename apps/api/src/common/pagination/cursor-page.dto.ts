import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './cursor.js';

/** The query string of every list endpoint in this API. */
export class CursorPageQueryDto {
  /** Omit for the first page; otherwise the `nextCursor` of the page before. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** How many rows to return, at most 100. */
  // Query strings carry text, so `?limit=20` arrives as "20" and would fail
  // `@IsInt` without this. `@Type` runs before the validators, which is what
  // makes the order of these decorators matter rather than be a style.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number = DEFAULT_PAGE_SIZE;
}
