import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from './authenticated-request.js';

/**
 * The caller the guard put on the request.
 *
 * A parameter decorator rather than `@Req()` in every handler: a controller
 * that never holds the express request cannot read a header the guard has not
 * validated, and the signature then says what the route actually needs.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
