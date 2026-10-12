import type { MembershipRole } from '@prisma/client';

/**
 * Attached by TenantGuard after confirming an ACTIVE membership.
 * Its presence is proof that the caller belongs to this institution.
 */
export interface TenantContext {
  institutionId: string;
  membershipId: string;
  membershipRole: MembershipRole;
}
