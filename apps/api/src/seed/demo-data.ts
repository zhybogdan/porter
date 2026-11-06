import type { UserRole } from '../generated/prisma/enums.js';

interface DemoUser {
  email: string;
  role: UserRole;
  fullName: string;
}

interface DemoOrganization {
  /**
   * Fixed, and supplied by the seed rather than taken from the database
   * default.
   *
   * An idempotent upsert needs a key that is the same on every run, and
   * `organizations.name` is deliberately not unique -- two managing companies
   * may share a name, and the schema does not pretend otherwise. So the seed
   * brings its own ids. They are obviously synthetic on sight, which is the
   * point: nobody should mistake a demo row for a real one.
   */
  id: string;
  name: string;
  users: DemoUser[];
}

/**
 * Two organizations, not one, and that is the whole reason this file has a
 * second half.
 *
 * The tenant isolation of step 12 is a claim, and a claim with one tenant in
 * the database cannot be tested: every query returns the only organization
 * there is, whether the filter works or not. The second organization is what
 * turns "isolated" from a promise into something a test can fail on.
 */
export const DEMO_ORGANIZATIONS: DemoOrganization[] = [
  {
    id: '00000000-0000-7000-8000-000000000001',
    name: 'Lakeside Residences',
    // The three accounts the README hands a reviewer, one per role.
    users: [
      { email: 'manager@porter.test', role: 'manager', fullName: 'Demo Manager' },
      {
        email: 'technician@porter.test',
        role: 'technician',
        fullName: 'Demo Technician',
      },
      {
        email: 'resident@porter.test',
        role: 'resident',
        fullName: 'Demo Resident',
      },
    ],
  },
  {
    id: '00000000-0000-7000-8000-000000000002',
    name: 'Riverside Court',
    // The other tenant. Not in the README: these accounts exist so that
    // "a manager of one building cannot see the other" has two buildings to
    // be true about.
    users: [
      {
        email: 'manager@other.porter.test',
        role: 'manager',
        fullName: 'Other Manager',
      },
      {
        email: 'resident@other.porter.test',
        role: 'resident',
        fullName: 'Other Resident',
      },
    ],
  },
];

/** The three accounts the README documents, in the order it lists them. */
export const README_ACCOUNTS = DEMO_ORGANIZATIONS[0]?.users ?? [];
