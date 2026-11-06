import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { type HealthReport, HealthService } from './health.service.js';

/**
 * Public as a whole: a probe is a load balancer or an uptime monitor, and
 * neither of them has an account here. Marked on the controller rather than
 * the route, because every future check added to it is a probe too.
 */
@Public()
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
