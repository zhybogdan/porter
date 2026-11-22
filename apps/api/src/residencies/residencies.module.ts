import { Module } from '@nestjs/common';
import { ResidenciesController } from './residencies.controller.js';
import { ResidenciesService } from './residencies.service.js';

@Module({
  controllers: [ResidenciesController],
  providers: [ResidenciesService],
})
export class ResidenciesModule {}
