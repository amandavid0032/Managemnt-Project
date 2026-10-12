import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard with an explicit, config-driven off switch.
 *
 * Rate limiting is registered through APP_GUARD, which Nest binds under its
 * own token rather than the guard class — so `overrideGuard(ThrottlerGuard)`
 * in a test module does nothing. Rather than contort the test setup, the
 * switch lives in configuration where it is validated and documented.
 *
 * THROTTLE_ENABLED defaults to true and must never be false in production;
 * the environment schema rejects that combination at boot.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(process.env.THROTTLE_ENABLED === 'false');
  }
}
