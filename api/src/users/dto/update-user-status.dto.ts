import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { UserStatus } from '@prisma/client';

/**
 * Only the two statuses a moderator actually decides.
 *
 * PENDING_VERIFICATION belongs to the (not yet built) email-verification flow
 * and DEACTIVATED is the user's own choice to close their account. Letting an
 * administrator set either by hand would mean staff could fake a verified
 * address, or make a closed account indistinguishable from a banned one.
 *
 * Platform roles have their own SUPER_ADMIN-only endpoint, which can grant
 * PLATFORM_ADMIN but never SUPER_ADMIN: that still requires database access
 * (`npm run create:superadmin`), so no request can escalate anyone to owner.
 */
export const MODERATABLE_STATUSES = [UserStatus.ACTIVE, UserStatus.SUSPENDED] as const;

export class UpdateUserStatusDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsIn(MODERATABLE_STATUSES, {
    message: `status must be one of: ${MODERATABLE_STATUSES.join(', ')}`,
  })
  status!: (typeof MODERATABLE_STATUSES)[number];
}
