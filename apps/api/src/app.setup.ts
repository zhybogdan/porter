import {
  type INestApplication,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { ProblemExceptionFilter } from './common/problem/problem-exception.filter.js';
import { flattenValidationErrors } from './common/problem/validation-errors.js';

/**
 * Everything that must be true of the running app, in one place.
 *
 * `main.ts`, the integration tests and the OpenAPI script all call this. A
 * pipe or filter registered only in `main.ts` would be missing from the tests
 * and from the generated document, and the tests would then be passing
 * against an app that does not exist in production.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.useGlobalPipes(
    new ValidationPipe({
      // Unknown fields are rejected, not stripped. Silently dropping them
      // means a client can misspell a field, get 200, and never learn that
      // nothing was saved.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new UnprocessableEntityException({
          detail: 'Request validation failed',
          errors: flattenValidationErrors(errors),
        }),
    }),
  );

  app.useGlobalFilters(new ProblemExceptionFilter());

  return app;
}
