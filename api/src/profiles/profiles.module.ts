import { Module } from '@nestjs/common';
import { EducationService } from './education.service';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [ProfilesController],
  providers: [ProfilesService, EducationService],
  exports: [EducationService],
})
export class ProfilesModule {}
