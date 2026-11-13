import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  // `AppModule` validates the whole configuration while it is being
  // evaluated: the `ConfigModule.forRoot({ validate })` call sits inside its
  // `@Module` metadata, so importing the module is enough to run the schema.
  // The document needs none of those values, but the module refuses to exist
  // without them, and `.env` is deliberately not in the repository -- so the
  // first CI run of `pnpm contract` failed with no database URL and no secret.
  //
  // Placeholders, and only where a value is missing: a developer with a real
  // `.env` keeps it. Nothing reads them. No provider asks for a connection --
  // that waits for `onModuleInit`, which only `app.listen()` reaches and this
  // script never does -- and nothing in the document comes from configuration,
  // which is checked by generating it against a dead DATABASE_URL and getting
  // the same bytes.
  //
  // The alternative was to hand CI a configuration of its own: a copied
  // `.env.test`, or values pasted into the workflow. Both make this check
  // depend on a second place being right, and a check that needs setup to
  // pass is a check that will one day pass for the wrong reason.
  process.env['DATABASE_URL'] ??=
    'postgresql://openapi:openapi@127.0.0.1:1/openapi';
  process.env['JWT_SECRET'] ??= 'openapi-document-placeholder-secret';

  // Imported here rather than at the top of the file, and that is not style:
  // ESM evaluates every static import before the first statement of this
  // module, so a static `import { AppModule }` would run the configuration
  // schema before the two lines above could set anything.
  const { AppModule } = await import('./app.module.js');

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
