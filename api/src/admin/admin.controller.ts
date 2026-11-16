import { Controller, Get, Query } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';
import { PlatformRoles } from '../common/decorators/platform-roles.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminSystemService } from './admin-system.service';
import { RegistrationsQueryDto } from './dto/registrations-query.dto';

/**
 * Read-only platform figures for the Super Admin dashboard.
 * Staff-only by default (class-level); settings are SUPER_ADMIN only.
 */
@PlatformRoles(PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly analytics: AdminAnalyticsService,
    private readonly system: AdminSystemService,
  ) {}

  @Get('overview')
  overview() {
    return this.analytics.overview();
  }

  @Get('analytics/registrations')
  registrations(@Query() query: RegistrationsQueryDto) {
    return this.analytics.registrations(query);
  }

  @Get('analytics/distribution')
  distribution() {
    return this.analytics.distribution();
  }

  @Get('activity')
  activity() {
    return this.analytics.activity();
  }

  @Get('approvals')
  approvals() {
    return this.analytics.pendingApprovals(100);
  }

  @Get('system/health')
  health() {
    return this.system.health();
  }

  /** Configuration reveals infrastructure; owners only. */
  @PlatformRoles(PlatformRole.SUPER_ADMIN)
  @Get('settings')
  settings() {
    return this.system.settings();
  }
}
