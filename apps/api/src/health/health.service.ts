import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  uptimeSeconds: number;
}

/**
 * Answers what is true, not what to send: the HTTP status is the controller's
 * decision. Keeping the two apart means that when monitoring starts
 * complaining, the log says which of the two was wrong.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthReport> {
    const database = await this.pingDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  /**
   * A real round trip, not a flag on the client: a pool can hold a socket that
   * the server has already closed, and only a query finds out.
   */
  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      // Why it is down belongs to the caller's log, not to the answer: the
      // report is public and a connection error carries the credentials.
      return 'down';
    }
  }
}
