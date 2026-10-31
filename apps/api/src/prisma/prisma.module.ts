import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Global on purpose: nearly every feature module needs the database, and
 * importing PrismaModule in each of them is ceremony that only hides the one
 * fact worth knowing, that there is a single pool for the whole app.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
