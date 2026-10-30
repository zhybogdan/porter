import { Injectable } from '@nestjs/common';

export interface HealthReport {
  status: 'ok';
  uptimeSeconds: number;
}

/**
 * Trivial for now on purpose. It becomes the place where the database check
 * lives once PrismaService exists, and then /health starts answering 503.
 */
@Injectable()
export class HealthService {
  check(): HealthReport {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }
}
