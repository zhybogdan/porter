import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';

@Module({
  // For `PasswordService`: an accepted invite hashes a password with the
  // same parameters login verifies against.
  imports: [AuthModule],
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
