import { Injectable, NotFoundException } from '@nestjs/common';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { TenantContext } from '../common/types/tenant-context';

const PLATFORM_OVERRIDE = 'platform-override';

type RoleCounts = Record<MembershipRole, number>;

const zeroRoles = (): RoleCounts => ({
  [MembershipRole.STUDENT]: 0,
  [MembershipRole.TEACHER]: 0,
  [MembershipRole.STAFF]: 0,
  [MembershipRole.INSTITUTION_ADMIN]: 0,
});

/**
 * The school dashboard overview.
 *
 * Every number is a COUNT over institution_memberships for this tenant —
 * nothing is estimated, cached or invented. Attendance, fees and hostel
 * figures are absent because those modules do not exist; a dashboard tile
 * for them would have to be made up.
 */
@Injectable()
export class InstitutionDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenant: TenantContext) {
    const institutionId = tenant.institutionId;

    const [institution, grouped, viewer] = await Promise.all([
      this.prisma.institution.findFirst({
        where: { id: institutionId, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          legalName: true,
          category: true,
          typeLabel: true,
          description: true,
          status: true,
          verifiedAt: true,
          email: true,
          phone: true,
          website: true,
          addressLine1: true,
          addressLine2: true,
          city: true,
          state: true,
          postalCode: true,
          countryCode: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.institutionMembership.groupBy({
        by: ['role', 'status'],
        where: { institutionId },
        _count: { _all: true },
      }),
      tenant.membershipId === PLATFORM_OVERRIDE
        ? Promise.resolve(null)
        : this.prisma.institutionMembership.findFirst({
            where: { id: tenant.membershipId, institutionId },
            select: { id: true, role: true, status: true, joinedAt: true, institutionMemberId: true },
          }),
    ]);

    // TenantGuard already checked this; a concurrent archive could still
    // land between the guard and here.
    if (!institution) throw new NotFoundException('Institution not found');

    const active = zeroRoles();
    let pending = 0;
    let suspended = 0;
    let former = 0;

    for (const row of grouped) {
      const n = row._count._all;
      if (row.status === MembershipStatus.ACTIVE) active[row.role] += n;
      else if (row.status === MembershipStatus.PENDING) pending += n;
      else if (row.status === MembershipStatus.SUSPENDED) suspended += n;
      else if (row.status === MembershipStatus.LEFT) former += n;
    }

    return {
      institution,
      members: {
        active: {
          students: active.STUDENT,
          teachers: active.TEACHER,
          staff: active.STAFF,
          administrators: active.INSTITUTION_ADMIN,
          total: Object.values(active).reduce((sum, n) => sum + n, 0),
        },
        pending,
        suspended,
        former,
      },
      viewer: {
        /** The role the server used to authorise this request. */
        role: tenant.membershipRole,
        canManage: tenant.membershipRole === MembershipRole.INSTITUTION_ADMIN,
        /** True for platform staff working across tenants without a membership. */
        platformOverride: tenant.membershipId === PLATFORM_OVERRIDE,
        membership: viewer,
      },
    };
  }
}
