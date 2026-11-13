import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { HealthReport } from './dto/health-report.response.js';
import { HealthService } from './health.service.js';

/**
 * Liveness of the API and of what it depends on.
 */
// Public as a whole: a probe is a load balancer or an uptime monitor, and
// neither of them has an account here. Marked on the controller rather than
// the route, because every future check added to it is a probe too.
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Report whether the API and the database answer. */
  // The status code is the controller's, the report is the service's. A
  // monitoring probe needs the code; a human needs to know which part is
  // down, and an empty 503 answers neither.
  @Get()
  @ApiOperation({
    description:
      'The body is the same in both answers and names the part that is down.',
    security: [],
  })
  @ApiOkResponse({ description: 'Everything answers', type: HealthReport })
  @ApiServiceUnavailableResponse({
    description: 'At least one dependency is down',
    type: HealthReport,
  })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthReport> {
    const report = await this.health.check();

    response.status(
      report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return report;
  }
}
