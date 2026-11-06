import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  orgId?: string;
}

/**
 * The tenant of the request being handled, carried without being passed.
 *
 * `AsyncLocalStorage` is Node's own mechanism for this: a value attached to a
 * chain of asynchronous calls rather than to a variable. Whatever the handler
 * awaits, and whatever that awaits in turn, reads the same store, and two
 * requests in flight at the same time never see each other's.
 *
 * The alternative is an `orgId` parameter threaded through every service and
 * every repository call. That version is explicit, and it fails the moment one
 * function forgets to pass it along -- which is the failure this whole step
 * exists to remove.
 */
const storage = new AsyncLocalStorage<TenantContext>();

/**
 * Opens an empty store for the rest of the request.
 *
 * Called from middleware, before the guards: at that point nobody knows the
 * tenant yet, so the envelope goes in empty and `setTenant` fills it once the
 * access token has been read. Opening it later -- from a guard, say -- would
 * not work: a guard returns before the handler runs, and the store would be
 * closed again by the time anything queried the database.
 */
export function runWithTenantContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

/** Records the tenant for this request. Called by `JwtAuthGuard`. */
export function setTenant(orgId: string): void {
  const store = storage.getStore();

  if (store === undefined) {
    // No envelope to write into: the middleware did not run for this request.
    // That is a wiring mistake and has to be loud, because the alternative is
    // a request that quietly has no tenant and queries that quietly have no
    // filter.
    throw new Error('setTenant called outside a tenant context');
  }

  store.orgId = orgId;
}

/** The tenant of this request, or undefined on a public or non-HTTP path. */
export function currentTenant(): string | undefined {
  return storage.getStore()?.orgId;
}
