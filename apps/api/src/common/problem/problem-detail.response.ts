import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The error format of this API: RFC 9457, "Problem Details for HTTP APIs".
 *
 * It is part of the contract, not an implementation detail. Clients branch on
 * `status` and show `detail`; the web console renders `errors` next to the
 * fields that failed.
 *
 * Classes and not interfaces, and the file is named `.response.ts`, so the
 * OpenAPI plugin writes these shapes into the document: an error body that
 * clients must handle is as much a promise as a success body, and a contract
 * that describes only the happy path leaves every client to guess.
 */
export class ProblemFieldError {
  /** Dotted path of the field that failed, e.g. `unit.label`. */
  field!: string;
  message!: string;
}

export class ProblemDetail {
  /**
   * A URI identifying the problem kind. `about:blank` means "nothing beyond
   * the status code", which is the honest answer for plain HTTP errors. A
   * problem that clients must handle specially gets its own URI, and that URI
   * then becomes part of the contract.
   */
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty({ example: 'Unauthorized' })
  title!: string;

  @ApiProperty({ example: 401 })
  status!: number;

  @ApiPropertyOptional()
  detail?: string;

  /** The path that produced the problem. */
  @ApiProperty({ example: '/me' })
  instance!: string;

  @ApiPropertyOptional({ type: [ProblemFieldError] })
  errors?: ProblemFieldError[];
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';
