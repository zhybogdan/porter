import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { TENANT_DB, createTenantDb } from './tenant-db.js';

/**
 * Global on purpose: nearly every feature module needs the database, and
 * importing PrismaModule in each of them is ceremony that only hides the one
 * fact worth knowing, that there is a single pool for the whole app.
 *
 * Two handles out of one connection, and which one a service asks for is the
 * whole of its tenant safety:
 *
 * - `TENANT_DB` for feature code. Every query is confined to the organization
 *   of the request, and an operation that cannot be confined is refused.
 * - `PrismaService` for the few places that must see across tenants: login and
 *   refresh look a row up before any tenant is known, the health probe has no
 *   request at all, and seeds and tests create the organizations themselves.
 *   Each of those says so where it injects it.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: TENANT_DB, useFactory: createTenantDb, inject: [PrismaService] },
  ],
  exports: [PrismaService, TENANT_DB],
})
export class PrismaModule {}
