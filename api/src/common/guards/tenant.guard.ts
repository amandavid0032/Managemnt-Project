import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipStatus, PlatformRole, type MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';
import { TENANT_ROLES_KEY } from '../decorators/tenant.decorator';
import type { AuthUser } from '../types/auth-user';
import type { TenantContext } from '../types/tenant-context';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The single choke point for tenant isolation.
 *
 * Rules enforced here:
 *  1. The institution id is read from the ROUTE PARAMETER, never the body.
 *     Tenant-scoped DTOs have no institutionId field, and global validation
 *     runs forbidNonWhitelisted, so sending one returns 400.
 *  2. Access requires an ACTIVE membership row. Absence is denied.
 *  3. Denial is 404, not 403 — a 403 would confirm that an institution the
 *     caller cannot see does exist.
 *
 * Postgres row-level security can later be layered underneath this without
 * touching any service code, because every tenant query flows through here.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(
      TENANT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles === undefined) return true; // not a tenant-scoped route

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser; tenant?: TenantContext }>();

    if (!req.user) throw new UnauthorizedException();

    // Express 5 types params as string | string[]. Anything but a single
    // well-formed UUID is rejected before it reaches the database.
    const raw = req.params['institutionId'];
    const institutionId = typeof raw === 'string' ? raw : undefined;
    if (!institutionId || !UUID_RE.test(institutionId)) {
      throw new NotFoundException('Institution not found');
    }

    const membership = await this.prisma.institutionMembership.findFirst({
      where: {
        userId: req.user.id,
        institutionId,
        status: MembershipStatus.ACTIVE,
        leftAt: null,
        institution: { deletedAt: null },
      },
      select: { id: true, role: true, institutionId: true },
    });

    if (membership) {
      if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
        throw new NotFoundException('Institution not found');
      }
      req.tenant = {
        institutionId: membership.institutionId,
        membershipId: membership.id,
        membershipRole: membership.role,
      };
      return true;
    }

    // Platform staff may operate across tenants for support and moderation.
    // This is an explicit, auditable exception — not an implicit bypass.
    if (
      req.user.platformRole === PlatformRole.PLATFORM_ADMIN ||
      req.user.platformRole === PlatformRole.SUPER_ADMIN
    ) {
      const institution = await this.prisma.institution.findFirst({
        where: { id: institutionId, deletedAt: null },
        select: { id: true },
      });
      if (!institution) throw new NotFoundException('Institution not found');
      req.tenant = {
        institutionId: institution.id,
        membershipId: 'platform-override',
        membershipRole: 'INSTITUTION_ADMIN' as MembershipRole,
      };
      return true;
    }

    throw new NotFoundException('Institution not found');
  }
}
