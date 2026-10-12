import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PlatformRole } from '@prisma/client';
import type { Request } from 'express';
import { PLATFORM_ROLES_KEY } from '../decorators/platform-roles.decorator';
import type { AuthUser } from '../types/auth-user';

@Injectable()
export class PlatformRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    // The role comes from the DB-backed token payload, never from the request.
    if (!req.user || !required.includes(req.user.platformRole)) {
      throw new ForbiddenException('Insufficient platform privileges');
    }
    return true;
  }
}
