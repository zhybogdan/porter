import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

/**
 * Writes the OpenAPI document that every client of this API is generated
 * from. Not a server: nothing listens, nothing is queried.
 *
 * Runs from the compiled output -- `nest build`, then `node dist/openapi.js`.
 * The decorator metadata and everything the @nestjs/swagger plugin adds exist
 * only in that output: TypeScript types are erased at compile time, so a run
 * through tsx or esbuild would produce a document with empty schemas.
 *
 * `configureApp` is the same function `main.ts` and the integration tests
 * call. A global prefix or a validation rule set only in `main.ts` would give
 * the document paths and shapes the running API does not have, and the
 * generated clients would then be wrong in a way no test here could see.
 */
async function main(): Promise<void> {
  // `NestFactory.create` instantiates the providers but does not run the
  // lifecycle hooks -- `onModuleInit` waits for `app.init()`, which only
  // `app.listen()` reaches. That is what keeps this script off the database:
  // `PrismaService` is constructed, its pool is built lazily by node-postgres,
  // and nothing ever asks it for a connection.
  //
  // The alternative was to make the connection lazy in `PrismaService` itself,
  // and it costs more than it looks: a wrong DATABASE_URL would stop failing
  // at boot and start surfacing as a slow 500 for whoever happened to arrive
  // first. The document is generated without a database either way, so the
  // cheaper side is the one that changes nothing about how the API starts.
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);

  const config = new DocumentBuilder()
    .setTitle('Porter API')
    .setDescription(
      'Maintenance requests and amenity booking for managed apartment buildings.',
    )
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    // Required by default, overridden per route with `security: []`. This is
    // the document saying what the code says: one global guard, and a short
    // list of operations that opted out. Opt-in would describe the same API
    // today and lie the first time somebody forgets a decorator.
    .addSecurityRequirements('bearer')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const out = resolve(
    process.argv[2] ?? '../../packages/contract/openapi.json',
  );
  mkdirSync(dirname(out), { recursive: true });

  // Two spaces and a trailing newline, because this file is committed and
  // read as a diff: a one-line document would show every change as one
  // changed line, and a breaking change would be invisible in review.
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();

  console.log(`openapi document written to ${out}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
