import { Controller, Get } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { Tenant, TenantScoped } from '../common/decorators/tenant.decorator';
import type { TenantContext } from '../common/types/tenant-context';
import { InstitutionDashboardService } from './institution-dashboard.service';

/**
 * The institution's own dashboard (/school/:slug in the web app).
 *
 * The browser resolves the slug to an id using /auth/me, but that id is NOT
 * trusted: TenantGuard re-verifies an ACTIVE membership for it on every
 * request. Admins and staff may view; teachers and students get the same
 * 404 as a stranger — a membership is not, by itself, a key to the office.
 */
@Controller({ path: 'institutions/:institutionId/overview', version: '1' })
export class InstitutionDashboardController {
  constructor(private readonly dashboard: InstitutionDashboardService) {}

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN, MembershipRole.STAFF)
  @Get()
  overview(@Tenant() tenant: TenantContext) {
    return this.dashboard.overview(tenant);
  }
}
