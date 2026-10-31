import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { type HealthReport, HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * 503 when the database is unreachable, and the report in the body either
   * way. A monitoring probe needs the status code; a human needs to know
   * which part is down, and an empty 503 answers neither.
   */
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.check();

    response.status(
      report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return report;
  }
}
