import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MembershipRole } from '@prisma/client';
import { type Actor, CurrentActor } from '../common/decorators/actor.decorator';
import { Tenant, TenantScoped } from '../common/decorators/tenant.decorator';
import type { TenantContext } from '../common/types/tenant-context';
import { CreateMembershipDto } from './dto/create-membership.dto';
import {
  LookupMemberDto,
  QueryMembershipsDto,
  UpdateMembershipDto,
  UpdateMembershipStatusDto,
} from './dto/manage-membership.dto';
import { MembershipsService } from './memberships.service';

/**
 * Tenant-scoped resource. The :institutionId route parameter is resolved by
 * TenantGuard, which requires an ACTIVE membership and returns 404 — not 403 —
 * when there is none, so the endpoint cannot be used to probe which
 * institutions exist.
 *
 * Reading the member list: INSTITUTION_ADMIN and STAFF.
 * Changing anything: INSTITUTION_ADMIN only. TEACHER and STUDENT get neither.
 *
 * Membership roles are tenant-scoped. Nothing here touches users.platform_role:
 * making someone a school's INSTITUTION_ADMIN gives them no platform authority.
 */
@Controller({ path: 'institutions/:institutionId/memberships', version: '1' })
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN, MembershipRole.STAFF)
  @Get()
  list(@Tenant() tenant: TenantContext, @Query() query: QueryMembershipsDto) {
    return this.memberships.list(tenant, query);
  }

  /**
   * Declared before ':membershipId' so the literal is not parsed as an id.
   * Throttled: even exact lookups reveal whether an address is registered,
   * so the rate is kept to what a person enrolling people actually needs.
   */
  @TenantScoped(MembershipRole.INSTITUTION_ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('lookup')
  lookup(@Tenant() tenant: TenantContext, @Query() query: LookupMemberDto) {
    return this.memberships.lookup(tenant, query.email);
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
  create(
    @Tenant() tenant: TenantContext,
    @Body() dto: CreateMembershipDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.memberships.create(tenant, dto, actor);
  }

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN)
  @Patch(':membershipId')
  update(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMembershipDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.memberships.update(tenant, membershipId, dto, actor);
  }

  @TenantScoped(MembershipRole.INSTITUTION_ADMIN)
  @Patch(':membershipId/status')
  changeStatus(
    @Tenant() tenant: TenantContext,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMembershipStatusDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.memberships.changeStatus(tenant, membershipId, dto, actor);
  }
}
