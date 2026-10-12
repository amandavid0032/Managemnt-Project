import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { Tenant, TenantScoped } from '../common/decorators/tenant.decorator';
import type { TenantContext } from '../common/types/tenant-context';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipsService } from './memberships.service';

/**
 * Tenant-scoped resource. The :institutionId route parameter is resolved by
 * TenantGuard, which requires an ACTIVE membership and returns 404 — not 403 —
 * when there is none, so the endpoint cannot be used to probe which
 * institutions exist.
 */
@Controller({ path: 'institutions/:institutionId/memberships', version: '1' })
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN, MembershipRole.STAFF)
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() pagination: PaginationQueryDto) {
    return this.memberships.list(tenant, pagination);
  }

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN, MembershipRole.STAFF)
  @Get(':membershipId')
  findOne(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.memberships.findOne(tenant, membershipId);
  }

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN)
  @Post()
  create(@Tenant() tenant: TenantContext, @Body() dto: CreateMembershipDto) {
    return this.memberships.create(tenant, dto);
  }
}
