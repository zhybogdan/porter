import type { PrismaService } from './prisma.service.js';
import { currentTenant } from './tenant-context.js';

/** Injection token for the tenant-scoped handle. */
export const TENANT_DB = Symbol('TENANT_DB');

/**
 * Which models belong to a tenant, and the column that says so.
 *
 * One list, in one file. The alternative is the filter written out at every
 * call site, and the failure mode of that is not a broken feature -- it is one
 * query out of twenty quietly returning another organization's rows.
 *
 * `Organization` is scoped by its own id: it *is* the tenant, so "your
 * organization" and "the row with your id" are the same row. `Session` is
 * absent on purpose and the schema says why: a refresh request arrives with a
 * token and nothing else, so the row has to be found before any tenant is
 * known.
 */
const SCOPE_FIELD = new Map<string, string>([
  ['User', 'orgId'],
  ['Organization', 'id'],
  ['Property', 'orgId'],
  ['Unit', 'orgId'],
  ['Residency', 'orgId'],
]);

/**
 * The operations this extension can filter, and therefore the only ones it
 * allows on a scoped model.
 *
 * Everything else is refused rather than passed through. `findUnique` is the
 * one that matters: Prisma only accepts unique columns in its `where`, so
 * `orgId` cannot be added to it, and a silent pass-through would be a lookup
 * by id across every tenant in the installation -- exactly the leak this file
 * exists to prevent. The replacement is `findFirst`, which takes any filter.
 */
const FILTERABLE = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

/**
 * The database handle feature code gets: every query it makes is confined to
 * the organization of the request being handled.
 *
 * Raw SQL (`$queryRaw`, `$executeRaw`) arrives here without a model and
 * therefore passes through unfiltered. Nothing can be done about that from an
 * extension -- Prisma does not parse the string -- so raw statements against a
 * scoped table have to carry `org_id` themselves. Noted in DEBT.md.
 */
export function createTenantDb(prisma: PrismaService) {
  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const field = SCOPE_FIELD.get(model);

          if (field === undefined) {
            return query(args);
          }

          if (!FILTERABLE.has(operation)) {
            throw new Error(
              `${operation} on ${model} cannot be scoped to a tenant; use findFirst, findMany or the *Many writes, or take the unscoped PrismaService and say in a comment why`,
            );
          }

          const tenant = currentTenant();

          if (tenant === undefined) {
            // Refusing beats returning everything. A missing tenant means this
            // code ran outside a request -- a job, a seed, a test -- and the
            // right answer there is the unscoped handle with a reason written
            // next to it, not a query that silently spans every organization.
            throw new Error(
              `${operation} on ${model} needs a tenant and this request has none`,
            );
          }

          return query(withScope(args, field, tenant));
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantDb>;

/**
 * Adds the tenant to the filter, and refuses a filter that names a different
 * one. Overriding it silently would hide the bug; the only honest answers are
 * "same tenant, carry on" and "stop".
 */
function withScope(args: unknown, field: string, tenant: string): object {
  const query =
    typeof args === 'object' && args !== null
      ? (args as Record<string, unknown>)
      : {};
  const where =
    typeof query['where'] === 'object' && query['where'] !== null
      ? (query['where'] as Record<string, unknown>)
      : {};
  const asked = where[field];

  if (asked !== undefined && asked !== tenant) {
    throw new Error(
      `query constrains ${field} to ${JSON.stringify(asked)} while the request belongs to ${tenant}`,
    );
  }

  return { ...query, where: { ...where, [field]: tenant } };
}
