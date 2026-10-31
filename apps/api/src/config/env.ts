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
