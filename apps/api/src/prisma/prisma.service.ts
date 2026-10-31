import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The database handle, owned by Nest rather than by a module-level singleton.
 *
 * Prisma 7 has no query engine of its own: it talks to Postgres through a
 * driver adapter, so the connection pool here is node-postgres's and its size
 * is ours to set. That matters for the race tests of week 6: a pool smaller
 * than the number of concurrent requests serialises them, and the test then
 * passes without ever having raced.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DATABASE_POOL_MAX', { infer: true }),
      }),
    });
  }

  /**
   * Connect while the app is starting, not on the first request: a wrong URL
   * or an unreachable database should stop the process, not surface as a slow
   * 500 for whoever happened to arrive first.
   */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /**
   * Nest calls this on shutdown. Without it the pool keeps its sockets open,
   * the process does not exit, and in tests every suite leaves connections
   * behind until Postgres refuses new ones.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
