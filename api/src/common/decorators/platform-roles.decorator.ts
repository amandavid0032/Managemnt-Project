import { SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '@prisma/client';

export const PLATFORM_ROLES_KEY = 'platformRoles';

/** Restricts a route to platform-wide roles (never tenant roles). */
export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);
