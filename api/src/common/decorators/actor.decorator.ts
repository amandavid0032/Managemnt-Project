import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../types/auth-user';

/**
 * The authenticated user plus where the request came from, for the audit log.
 *
 * `ip` is req.ip, which honours `trust proxy` (one hop, set in main.ts), so a
 * client cannot forge it with its own X-Forwarded-For header.
 */
export interface Actor extends AuthUser {
  ip?: string;
  userAgent?: string;
}

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (!req.user) throw new Error('CurrentActor used on a route without JwtAuthGuard');
  return {
    ...req.user,
    ip: req.ip,
    userAgent: req.get('user-agent')?.slice(0, 512),
  };
});
