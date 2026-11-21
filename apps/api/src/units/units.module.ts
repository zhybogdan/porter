import { Module } from '@nestjs/common';
import { UnitsController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
