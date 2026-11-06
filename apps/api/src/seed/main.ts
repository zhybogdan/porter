import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { PasswordService } from '../auth/password.service.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { seedDemoData } from './seed.js';

/**
 * `pnpm db:seed`.
 *
 * Built on the real `AppModule` through a Nest application context -- the same
 * wiring the server uses, minus the HTTP listener. Two things come free from
 * that and both matter: the env schema runs, so a bad `DATABASE_URL` stops
 * here with the variable named; and the hash comes from the same
 * `PasswordService` login verifies against, so the seed cannot quietly write
 * hashes with parameters nothing can check.
 */
async function main(): Promise<void> {
  const logger = new Logger('seed');

  // Quiet during bootstrap: a seed has no business printing a line per module
  // initialised. Raised again below, because the same levels also decide
  // whether this command says anything at all about what it did -- which the
  // first run of it proved by finishing in complete silence.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  Logger.overrideLogger(['error', 'warn', 'log']);

  try {
    const password = app
      .get(ConfigService<Env, true>)
      .get('SEED_PASSWORD', { infer: true });

    if (password === undefined) {
      // No fallback. A default demo password would be committed, would end up
      // on the deployed demo, and would be the first thing anyone tried.
      throw new Error(
        'SEED_PASSWORD is not set. The seed does not invent one: see .env.example',
      );
    }

    const summary = await seedDemoData(
      app.get(PrismaService),
      app.get(PasswordService),
      password,
    );

    logger.log(
      `seeded ${String(summary.organizations)} organizations and ${String(summary.users)} users`,
    );
  } finally {
    // Always: the pool keeps its sockets open otherwise and the command hangs
    // instead of exiting, which in CI looks like a stuck job rather than a
    // finished seed.
    await app.close();
  }
}

main().catch((error: unknown) => {
  new Logger('seed').error(
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
