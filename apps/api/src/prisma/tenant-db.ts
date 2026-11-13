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
 * The writes this extension can stamp, and therefore the only ones it allows
 * on a scoped model.
 *
 * A read is narrowed by adding to its `where`; a write has no `where` to add
 * to, so the tenant goes into the row itself. Which is also why `update`,
 * `delete` and `upsert` are still absent: each takes a unique `where`, the
 * same place `findUnique` fails, so a pass-through would edit a row belonging
 * to anyone. Their replacements are `updateMany` and `deleteMany`, which take
 * a filter -- and which is what optimistic locking needs anyway, because a
 * conditional update is the only kind that can lose a race safely.
 */
const STAMPABLE = new Set(['create', 'createMany', 'createManyAndReturn']);

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

          const stamping = STAMPABLE.has(operation);

          if (!stamping && !FILTERABLE.has(operation)) {
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

          return query(
            stamping
              ? withStamp(args, field, tenant)
              : withScope(args, field, tenant),
          );
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
  const query = asRecord(args);
  const where = asRecord(query['where']);
  const asked = where[field];

  if (asked !== undefined && asked !== tenant) {
    throw new Error(
      `query constrains ${field} to ${JSON.stringify(asked)} while the request belongs to ${tenant}`,
    );
  }

  return { ...query, where: { ...where, [field]: tenant } };
}

/**
 * Writes the tenant into the row being created, for one row or for a list.
 *
 * The caller does not pass `orgId` and should not: a handler that names the
 * organization is a handler that can name the wrong one, and the whole point
 * of this file is that the request's tenant is not a parameter anybody can
 * get wrong.
 */
function withStamp(args: unknown, field: string, tenant: string): object {
  const query = asRecord(args);
  const data = query['data'];

  if (Array.isArray(data)) {
    return {
      ...query,
      data: data.map((row) => stampRow(row, field, tenant)),
    };
  }

  return { ...query, data: stampRow(data, field, tenant) };
}

function stampRow(row: unknown, field: string, tenant: string): object {
  const data = asRecord(row);
  const asked = data[field];

  if (asked !== undefined && asked !== tenant) {
    throw new Error(
      `write sets ${field} to ${JSON.stringify(asked)} while the request belongs to ${tenant}`,
    );
  }

  refuseNestedWrites(data);

  return { ...data, [field]: tenant };
}

/**
 * A nested write creates rows this function cannot reach.
 *
 * `property.create({ data: { name, units: { create: [...] } } })` would stamp
 * the property and leave every unit without a tenant, and the database would
 * then refuse the whole statement -- or, for a model whose column is
 * nullable, accept rows nobody can see. Refusing beats both: the rows are
 * created in separate calls, each stamped on its own.
 */
function refuseNestedWrites(data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'object' || value === null || value instanceof Date) {
      continue;
    }

    const nested = value as Record<string, unknown>;

    if ('create' in nested || 'createMany' in nested || 'connectOrCreate' in nested) {
      throw new Error(
        `nested write on "${key}" cannot be scoped to a tenant; create the rows in separate calls, or take the unscoped PrismaService and say in a comment why`,
      );
    }
  }
}

/** Whatever Prisma handed us, as something with keys. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
