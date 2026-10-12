import type { PlatformRole } from '@prisma/client';

/** Identity attached by JwtAuthGuard. Derived from a verified token only. */
export interface AuthUser {
  id: string;
  platformRole: PlatformRole;
}
