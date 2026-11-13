import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * An IANA zone name: `Europe/Kyiv`, or the one exception, `UTC`.
 *
 * Checked against the runtime's own zone database rather than a list kept
 * here -- `Intl` refuses a name it does not know, and a list in this
 * repository would be a copy that goes stale every time a country changes
 * its rules.
 *
 * An offset like `+02:00` is refused even where `Intl` would take it. An
 * offset is a fact about one moment: a building stored as `+02:00` would show
 * the wrong hour to everyone in it from the last Sunday in October onwards.
 */
export function IsTimeZone(options?: ValidationOptions) {
  return function registerIsTimeZone(object: object, propertyName: string) {
    registerDecorator({
      name: 'isTimeZone',
      target: object.constructor,
      propertyName,
      options: { message: 'must be an IANA time zone name', ...options },
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') {
            return false;
          }

          if (value !== 'UTC' && !value.includes('/')) {
            return false;
          }

          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}
