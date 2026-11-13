import { ApiProperty } from '@nestjs/swagger';

/**
 * The body of `GET /health`, returned with 200 when everything answers and
 * with 503 when it does not.
 *
 * A class and not an interface so the OpenAPI plugin can read it; see
 * `TokenPair` for the reasoning.
 */
export class HealthReport {
  /** `degraded` whenever any check below is down. */
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status!: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  database!: 'up' | 'down';

  /** Seconds since this process started, rounded. */
  uptimeSeconds!: number;
}
