import { Module } from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminController } from './admin.controller';
import { AdminSystemService } from './admin-system.service';

@Module({
  controllers: [AdminController],
  providers: [AdminAnalyticsService, AdminSystemService],
})
export class AdminModule {}
