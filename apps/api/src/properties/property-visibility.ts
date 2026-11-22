import type { AuthenticatedUser } from '../auth/authenticated-request.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Which of the organization's buildings a caller may see, as a `where`
 * fragment for `property` queries.
 *
 * A manager and a technician see every building of their organization: one
 * runs them, the other is sent to any of them. A resident sees only the
 * buildings they currently live in -- the project document gives a resident
 * "their own unit and their own requests", and a list of every building the
 * company manages is neither. Until residencies existed there was nothing to
 * narrow by, which is why this arrived with them.
 *
 * The organization is not here: the tenant extension adds it to every query.
 * The relation filter below is not scoped by that extension, and it does not
 * need to be: the composite foreign keys hold a unit's and a residency's
 * `org_id` to their building's, so a building that passes the tenant filter
 * cannot have a unit or a resident from anywhere else.
 */
export function visibleProperties(
  user: AuthenticatedUser,
): Prisma.PropertyWhereInput {
  if (user.role !== 'resident') {
    return {};
  }

  return {
    units: {
      some: {
        // Current only: a resident who moved out keeps their history, not
        // their view of the building.
        residencies: { some: { userId: user.id, movedOutAt: null } },
      },
    },
  };
}
