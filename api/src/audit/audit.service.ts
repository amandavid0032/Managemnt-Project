import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { Actor } from '../common/decorators/actor.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import type { AuditAction, AuditTargetType } from './audit.actions';
import type { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

/** Anything that can run a Prisma create: the client or a transaction. */
type Db = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditEntry {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  institutionId?: string;
  /** Before/after values and reasons. Never credentials or tokens. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records one action. Pass the transaction the change itself runs in, so
   * the change and its audit row commit or roll back together: an action that
   * happened without a record — or a record of something that did not
   * happen — is exactly what an audit log exists to rule out.
   */
  record(db: Db, actor: Actor, entry: AuditEntry) {
    return db.auditLog.create({
      data: {
        id: uuidv7(),
        actorUserId: actor.id,
        actorRole: actor.platformRole,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        institutionId: entry.institutionId ?? null,
        ipAddress: actor.ip?.slice(0, 45) ?? null,
        userAgent: actor.userAgent ?? null,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonObject,
      },
    });
  }

  async list(query: QueryAuditLogsDto) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.targetType) where.targetType = query.targetType;
    if (query.targetId) where.targetId = query.targetId;
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.institutionId) where.institutionId = query.institutionId;
    if (query.from || query.to) {
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      if (from && to && from > to) throw new BadRequestException('from must be before to');
      where.createdAt = { gte: from, lte: to };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return PaginatedResult.from(await this.withNames(rows), total, query.page, query.limit);
  }

  /** The most recent entries, for the dashboard. */
  async recent(take: number) {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    return this.withNames(rows);
  }

  /**
   * Adds the actor's and target's display names. Looked up rather than joined
   * because the table deliberately has no foreign keys. Two queries for a
   * whole page, never one per row.
   */
  private async withNames<T extends { actorUserId: string | null; targetType: string; targetId: string | null }>(
    rows: T[],
  ) {
    const ids = (type: string) =>
      [...new Set(rows.filter((r) => r.targetType === type && r.targetId).map((r) => r.targetId as string))];
    const userIds = [
      ...new Set([
        ...rows.map((r) => r.actorUserId).filter((id): id is string => id !== null),
        ...ids('user'),
      ]),
    ];
    const institutionIds = ids('institution');

    const [users, institutions] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, email: true },
          })
        : [],
      institutionIds.length
        ? this.prisma.institution.findMany({
            where: { id: { in: institutionIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const instById = new Map(institutions.map((i) => [i.id, i]));

    return rows.map((row) => ({
      ...row,
      actor: row.actorUserId ? (userById.get(row.actorUserId) ?? null) : null,
      targetLabel:
        row.targetType === 'user' && row.targetId
          ? (userById.get(row.targetId)?.fullName ?? null)
          : row.targetType === 'institution' && row.targetId
            ? (instById.get(row.targetId)?.name ?? null)
            : null,
    }));
  }
}
