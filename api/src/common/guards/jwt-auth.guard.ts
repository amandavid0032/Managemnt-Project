import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Applied globally. Routes must opt OUT with @Public() rather than opt in, so
 * a newly added endpoint is protected by default and a forgotten decorator
 * fails closed.
 *
 * Public routes still perform OPTIONAL authentication: if a valid token is
 * present, req.user is populated so a handler can vary its response for a
 * privileged caller (a platform admin seeing unpublished institutions, for
 * example). An absent or invalid token simply leaves the request anonymous —
 * it never rejects.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      try {
        await super.canActivate(context);
      } catch {
        // Anonymous access is allowed here; a bad token is simply ignored.
      }
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}
