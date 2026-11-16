import { Injectable } from '@nestjs/common';
import {
  InstitutionStatus,
  MembershipStatus,
  type InstitutionCategory,
  type MembershipRole,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface EducationEntry {
  membershipId: string;
  institution: {
    name: string;
    /** Null when the institution has no public page to link to. */
    slug: string | null;
    category: InstitutionCategory;
    city: string | null;
    countryCode: string;
  };
  role: MembershipRole;
  status: MembershipStatus;
  /** ACTIVE and not ended. */
  current: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
  /** Roll number / staff ID. Shown to the owner only — never on a public profile. */
  institutionMemberId?: string | null;
}

export type EducationView = 'self' | 'public';

/**
 * Education history, derived from institution memberships.
 *
 * There is deliberately no separate "education" table that people fill in
 * themselves. A membership is created only by an institution's administrator
 * (or platform staff), so every entry here is the institution's own
 * attestation — nobody can claim to have attended somewhere by typing it.
 *
 * Ended memberships are kept (status LEFT, left_at set) rather than deleted,
 * which is what makes this a history and not just a list of current links.
 */
@Injectable()
export class EducationService {
  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: string, view: EducationView): Promise<EducationEntry[]> {
    const where: Prisma.InstitutionMembershipWhereInput =
      view === 'self'
        ? // The owner sees everything except rejected requests — including
          // pending and suspended links, so they know where they stand.
          { userId, status: { not: MembershipStatus.REJECTED } }
        : // Others see only attested, settled history at institutions that
          // are themselves public. A draft or archived institution is not
          // something to advertise on someone's behalf.
          {
            userId,
            status: { in: [MembershipStatus.ACTIVE, MembershipStatus.LEFT] },
            institution: { status: InstitutionStatus.PUBLISHED, deletedAt: null },
          };

    const rows = await this.prisma.institutionMembership.findMany({
      where,
      select: {
        id: true,
        role: true,
        status: true,
        joinedAt: true,
        leftAt: true,
        createdAt: true,
        institutionMemberId: true,
        institution: {
          select: {
            name: true,
            slug: true,
            category: true,
            city: true,
            countryCode: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    const entries = rows.map((row): EducationEntry => {
      const linkable =
        row.institution.status === InstitutionStatus.PUBLISHED && row.institution.deletedAt === null;
      return {
        membershipId: row.id,
        institution: {
          name: row.institution.name,
          slug: linkable ? row.institution.slug : null,
          category: row.institution.category,
          city: row.institution.city,
          countryCode: row.institution.countryCode,
        },
        role: row.role,
        status: row.status,
        current: row.status === MembershipStatus.ACTIVE && row.leftAt === null,
        joinedAt: row.joinedAt,
        leftAt: row.leftAt,
        ...(view === 'self' ? { institutionMemberId: row.institutionMemberId } : {}),
      };
    });

    // Current first, then most recent start. Sorted here rather than in SQL
    // because "current" is derived from two columns.
    const startOf = (e: EducationEntry) => (e.joinedAt ?? new Date(0)).getTime();
    return entries.sort((a, b) => Number(b.current) - Number(a.current) || startOf(b) - startOf(a));
  }
}
