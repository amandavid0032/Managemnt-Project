import { Module } from '@nestjs/common';
import { InstitutionDashboardController } from './institution-dashboard.controller';
import { InstitutionDashboardService } from './institution-dashboard.service';

@Module({
  controllers: [InstitutionDashboardController],
  providers: [InstitutionDashboardService],
})
export class InstitutionDashboardModule {}
