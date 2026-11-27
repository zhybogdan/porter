import { useSyncExternalStore } from 'react';

/**
 * The zone names this browser knows, read once.
 *
 * Taken from the browser and not from a list kept here, for the same reason
 * the API checks zones against its own runtime: a copied list goes stale
 * whenever a country changes its rules.
 */
let zones: readonly string[] | undefined;

function browserZones(): readonly string[] {
  zones ??= ['UTC', ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC')];
  return zones;
}

const noSubscription = () => () => undefined;

/**
 * The list of zones and the browser's own zone, or `null` while the page is
 * rendered on the server.
 *
 * The server's Node and the visitor's browser can know different zone lists
 * and are usually in different zones, so whatever the server rendered would
 * not match the browser and React would throw the page away. Rendering the
 * select only in the browser avoids the mismatch instead of hiding it.
 */
export function useTimeZones(): { zones: readonly string[]; current: string } | null {
  const ready = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!ready) return null;
  return { zones: browserZones(), current: Intl.DateTimeFormat().resolvedOptions().timeZone };
}
