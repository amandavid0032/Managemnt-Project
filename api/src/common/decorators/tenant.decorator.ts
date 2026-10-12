import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';
import type { Request } from 'express';
import type { AuthUser } from '../types/auth-user';
import type { TenantContext } from '../types/tenant-context';

export const TENANT_ROLES_KEY = 'tenantRoles';

/**
 * Marks a route as tenant-scoped. TenantGuard resolves the institution from
 * the ROUTE PARAMETER and verifies an ACTIVE membership. Passing no roles
 * means "any active member".
 */
export const TenantScoped = (...roles: MembershipRole[]) =>
  SetMetadata(TENANT_ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user) throw new Error('CurrentUser used on a route without JwtAuthGuard');
    return req.user;
  },
);

/**
 * The ONLY sanctioned source of an institution id for tenant-scoped work.
 * It is derived from a verified membership — never from the request body.
 */
export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<Request & { tenant?: TenantContext }>();
    if (!req.tenant) throw new Error('Tenant used on a route without @TenantScoped');
    return req.tenant;
  },
);
