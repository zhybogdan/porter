import type { ValidationError } from 'class-validator';
import type { ProblemFieldError } from './problem-detail.js';

/**
 * class-validator reports a tree: one node per property, with `children` for
 * nested objects. Flattened into dotted paths, because a client needs to know
 * which field to mark, and `unit.label` is that answer.
 *
 * Done here rather than by parsing the default message strings: those read
 * "label must be a string" and the field name would have to be guessed back
 * out of English.
 */
export function flattenValidationErrors(
  errors: readonly ValidationError[],
  path = '',
): ProblemFieldError[] {
  return errors.flatMap((error) => {
    const field = path ? `${path}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message,
    }));

    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}
