import { BadRequestException, Injectable } from '@nestjs/common';
import {
  InstitutionCategory,
  InstitutionStatus,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import type { Granularity, RegistrationsQueryDto } from './dto/registrations-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default window per granularity, and the most buckets one request may ask for. */
const WINDOW: Record<Granularity, { defaultDays: number; maxBuckets: number }> = {
  day: { defaultDays: 30, maxBuckets: 400 },
  week: { defaultDays: 7 * 12, maxBuckets: 260 },
  month: { defaultDays: 365, maxBuckets: 240 },
  year: { defaultDays: 365 * 5, maxBuckets: 50 },
};
const APPROX_BUCKET_DAYS: Record<Granularity, number> = { day: 1, week: 7, month: 28, year: 365 };

/**
 * Every figure on the Super Admin dashboard comes from here, and every one
 * is a query over real rows. Where the data needed for a number does not
 * exist — status history, a user's country — the response says so with
 * `null` and a reason, rather than a plausible-looking guess.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const d60 = new Date(now.getTime() - 60 * DAY_MS);
    const liveUser = { deletedAt: null };
    const liveInst = { deletedAt: null };

    const activeMembers = (role: MembershipRole) =>
      this.prisma.user.count({
        where: {
          deletedAt: null,
          memberships: {
            some: {
              role,
              status: MembershipStatus.ACTIVE,
              leftAt: null,
              institution: { deletedAt: null },
            },
          },
        },
      });

    const [
      totalUsers,
      usersLast30,
      usersPrev30,
      totalInstitutions,
      instLast30,
      instPrev30,
      published,
      pending,
      activeStudents,
      activeTeachers,
      platformAdmins,
      suspended,
    ] = await Promise.all([
      this.prisma.user.count({ where: liveUser }),
      this.prisma.user.count({ where: { ...liveUser, createdAt: { gte: d30 } } }),
      this.prisma.user.count({ where: { ...liveUser, createdAt: { gte: d60, lt: d30 } } }),
      this.prisma.institution.count({ where: liveInst }),
      this.prisma.institution.count({ where: { ...liveInst, createdAt: { gte: d30 } } }),
      this.prisma.institution.count({ where: { ...liveInst, createdAt: { gte: d60, lt: d30 } } }),
      this.prisma.institution.count({ where: { ...liveInst, status: InstitutionStatus.PUBLISHED } }),
      this.prisma.institution.count({ where: { ...liveInst, status: InstitutionStatus.PENDING_REVIEW } }),
      activeMembers(MembershipRole.STUDENT),
      activeMembers(MembershipRole.TEACHER),
      this.prisma.user.count({
        where: { ...liveUser, platformRole: { in: [PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN] } },
      }),
      this.prisma.user.count({ where: { ...liveUser, status: UserStatus.SUSPENDED } }),
    ]);

    // A trend is only offered where the history to compute it exists: rows
    // carry created_at, so "new in the last 30 days" is real. Status columns
    // have no history, so status-based cards get no comparison at all.
    const trend = (current: number, previous: number) => ({
      windowDays: 30,
      current,
      previous,
    });

    return {
      generatedAt: now.toISOString(),
      kpis: {
        totalUsers: { value: totalUsers, newRegistrations: trend(usersLast30, usersPrev30) },
        totalInstitutions: { value: totalInstitutions, newRegistrations: trend(instLast30, instPrev30) },
        publishedInstitutions: { value: published },
        pendingApprovals: { value: pending },
        activeStudents: { value: activeStudents },
        activeTeachers: { value: activeTeachers },
        platformAdmins: { value: platformAdmins },
        suspendedAccounts: { value: suspended },
      },
    };
  }

  /**
   * New users and institutions per bucket, zero-filled, in UTC.
   *
   * Counts every record created in the bucket — including ones archived or
   * suspended since — because a registration that happened stays a
   * registration. Totals elsewhere exclude archived rows.
   */
  async registrations(query: RegistrationsQueryDto) {
    const g = query.granularity;
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - WINDOW[g].defaultDays * DAY_MS);
    if (from > to) throw new BadRequestException('from must be before to');
    const buckets = (to.getTime() - from.getTime()) / DAY_MS / APPROX_BUCKET_DAYS[g];
    if (buckets > WINDOW[g].maxBuckets) {
      throw new BadRequestException(
        `That range is too long for ${g}ly buckets (max ${WINDOW[g].maxBuckets}). Choose a coarser granularity.`,
      );
    }

    // g is constrained by @IsIn and passed as a bound parameter, never spliced.
    const rows = await this.prisma.$queryRaw<{ bucket: Date; users: bigint; institutions: bigint }[]>`
      WITH bounds AS (
        SELECT date_trunc(${g}, ${from}::timestamptz AT TIME ZONE 'UTC') AS lo,
               date_trunc(${g}, ${to}::timestamptz AT TIME ZONE 'UTC')   AS hi
      ),
      series AS (
        SELECT generate_series(lo, hi, ('1 ' || ${g})::interval) AS bucket FROM bounds
      ),
      u AS (
        SELECT date_trunc(${g}, created_at AT TIME ZONE 'UTC') AS bucket, count(*) AS n
        FROM users, bounds
        WHERE created_at AT TIME ZONE 'UTC' >= lo
          AND created_at <= ${to}::timestamptz
        GROUP BY 1
      ),
      i AS (
        SELECT date_trunc(${g}, created_at AT TIME ZONE 'UTC') AS bucket, count(*) AS n
        FROM institutions, bounds
        WHERE created_at AT TIME ZONE 'UTC' >= lo
          AND created_at <= ${to}::timestamptz
        GROUP BY 1
      )
      SELECT s.bucket, COALESCE(u.n, 0) AS users, COALESCE(i.n, 0) AS institutions
      FROM series s
      LEFT JOIN u ON u.bucket = s.bucket
      LEFT JOIN i ON i.bucket = s.bucket
      ORDER BY s.bucket
    `;

    const series = rows.map((r) => ({
      // date_trunc on a UTC-shifted timestamp returns a zone-less value that
      // Prisma reads as UTC already.
      bucket: r.bucket.toISOString(),
      users: Number(r.users),
      institutions: Number(r.institutions),
    }));
    return {
      granularity: g,
      timezone: 'UTC',
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        users: series.reduce((n, r) => n + r.users, 0),
        institutions: series.reduce((n, r) => n + r.institutions, 0),
      },
      series,
    };
  }

  async distribution() {
    const live = { deletedAt: null };
    const [byCategoryStatus, byCountryStatus] = await Promise.all([
      this.prisma.institution.groupBy({
        by: ['category', 'status'],
        where: live,
        _count: { _all: true },
        orderBy: { category: 'asc' },
      }),
      this.prisma.institution.groupBy({
        by: ['countryCode', 'status'],
        where: live,
        _count: { _all: true },
        orderBy: { countryCode: 'asc' },
      }),
    ]);

    const byStatus: Record<string, number> = Object.fromEntries(
      Object.values(InstitutionStatus)
        .filter((s) => s !== InstitutionStatus.ARCHIVED)
        .map((s) => [s, 0]),
    );
    const categories = new Map<string, { category: InstitutionCategory; total: number; byStatus: Record<string, number> }>();
    for (const row of byCategoryStatus) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + row._count._all;
      const entry = categories.get(row.category) ?? { category: row.category, total: 0, byStatus: {} };
      entry.total += row._count._all;
      entry.byStatus[row.status] = row._count._all;
      categories.set(row.category, entry);
    }
    const countries = new Map<string, { countryCode: string; total: number; published: number }>();
    for (const row of byCountryStatus) {
      const entry = countries.get(row.countryCode) ?? { countryCode: row.countryCode, total: 0, published: 0 };
      entry.total += row._count._all;
      if (row.status === InstitutionStatus.PUBLISHED) entry.published += row._count._all;
      countries.set(row.countryCode, entry);
    }

    return {
      institutions: {
        byStatus,
        byCategory: [...categories.values()].sort((a, b) => b.total - a.total),
        byCountry: [...countries.values()].sort((a, b) => b.total - a.total),
      },
      users: {
        byCountry: null,
        byCountryUnavailableReason:
          'Accounts do not record a country. Profile location is free text and is not used for statistics.',
      },
    };
  }

  /** The lists under "Recent activity" and "Pending approvals". */
  async activity() {
    const take = 8;
    const [recentUsers, recentInstitutions, recentlyPublished, adminActions, pending] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, fullName: true, email: true, platformRole: true, status: true, emailVerifiedAt: true, createdAt: true },
      }),
      this.prisma.institution.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, name: true, category: true, countryCode: true, status: true, createdAt: true },
      }),
      // verifiedAt is stamped the first time a record is published and never
      // cleared, so this is "first published", which is what the UI calls it.
      this.prisma.institution.findMany({
        where: { deletedAt: null, verifiedAt: { not: null } },
        orderBy: { verifiedAt: 'desc' },
        take,
        select: { id: true, name: true, category: true, countryCode: true, status: true, verifiedAt: true },
      }),
      this.audit.recent(10),
      this.pendingApprovals(10),
    ]);

    return { recentUsers, recentInstitutions, recentlyPublished, adminActions, pendingApprovals: pending };
  }

  /**
   * Institutions waiting for a decision. `submittedAt` is when the record
   * last entered PENDING_REVIEW according to the audit log; it is null for
   * records submitted before the audit log existed (or created that way by
   * a seed or import), and the UI says so rather than guessing.
   */
  async pendingApprovals(take: number) {
    const where: Prisma.InstitutionWhereInput = { deletedAt: null, status: InstitutionStatus.PENDING_REVIEW };
    const [rows, total] = await Promise.all([
      this.prisma.institution.findMany({
        where,
        orderBy: { updatedAt: 'asc' },
        take,
        select: {
          id: true,
          name: true,
          category: true,
          typeLabel: true,
          countryCode: true,
          city: true,
          verifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.institution.count({ where }),
    ]);
    const submissions = rows.length
      ? await this.prisma.auditLog.findMany({
          where: {
            action: 'institution.status_changed',
            targetId: { in: rows.map((r) => r.id) },
            metadata: { path: ['to'], equals: InstitutionStatus.PENDING_REVIEW },
          },
          orderBy: { createdAt: 'desc' },
          select: { targetId: true, createdAt: true },
        })
      : [];
    const submittedAt = new Map<string, Date>();
    for (const s of submissions) {
      if (s.targetId && !submittedAt.has(s.targetId)) submittedAt.set(s.targetId, s.createdAt);
    }
    return {
      total,
      rows: rows.map((r) => ({ ...r, submittedAt: submittedAt.get(r.id)?.toISOString() ?? null })),
    };
  }
}
