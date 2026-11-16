import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { PlatformRole } from '@prisma/client';

/**
 * The roles a super admin may grant or revoke through the API.
 *
 * SUPER_ADMIN is deliberately absent. Creating a platform owner still needs
 * database access (`npm run create:superadmin`), so a stolen super-admin
 * session cannot mint a second owner that survives the first being revoked,
 * and no request can demote the last one.
 */
export const ASSIGNABLE_PLATFORM_ROLES = [PlatformRole.USER, PlatformRole.PLATFORM_ADMIN] as const;

export class UpdatePlatformRoleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : value))
  @IsIn(ASSIGNABLE_PLATFORM_ROLES, {
    message: `platformRole must be one of: ${ASSIGNABLE_PLATFORM_ROLES.join(', ')}`,
  })
  platformRole!: (typeof ASSIGNABLE_PLATFORM_ROLES)[number];
}
