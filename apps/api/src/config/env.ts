import { z } from 'zod';

/**
 * Every variable the api needs, in one place.
 *
 * The point is not documentation: the schema runs at boot, so a missing or
 * malformed variable stops the process with the name of the variable instead
 * of surfacing as undefined somewhere deep in a request three hours later.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .startsWith('postgresql://', 'must be a postgresql:// connection string'),
  /**
   * Size of the node-postgres pool. A race test firing N concurrent requests
   * needs at least N connections, or the pool serialises them and the test
   * passes without racing.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),

  /**
   * Signs and verifies every access token. 32 characters is the floor
   * because HS256 is a keyed hash: a short secret is a password an attacker
   * can grind offline against any token they already hold, and a forged
   * token is then indistinguishable from a real one.
   */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  /**
   * Seconds. Short because an access token cannot be revoked: there is no
   * row to delete, so a stolen one stays valid until it expires, and this
   * number is exactly how long that window is. The price of shortening it is
   * paid in refresh traffic, not in security.
   */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(3600)
    .default(900),
  /**
   * Seconds. Long because it decides how often a phone asks the resident to
   * type their password again, and it is safe to be long only because the
   * token has a row in `sessions` that logout and reuse detection can kill.
   */
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2_592_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const lines = parsed.error.issues.map(
      (issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }

  return parsed.data;
}
