import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, InstitutionStatus, PlatformRole, Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/decorators/actor.decorator';
import { PrismaService } from '../database/prisma.service';
import { slugify } from '../common/utils/slugify';
import type { AuthUser } from '../common/types/auth-user';
import type { CreateInstitutionDto } from './dto/create-institution.dto';
import type { QueryInstitutionsDto } from './dto/query-institutions.dto';
import type { UpdateInstitutionDto } from './dto/update-institution.dto';
import type { UpdateInstitutionStatusDto } from './dto/update-institution-status.dto';

const MEDIA_INCLUDE = {
  select: { id: true, url: true, altText: true, sortOrder: true, attributionText: true },
  orderBy: { sortOrder: 'asc' },
} as const;

/**
 * The publication lifecycle, as an explicit allow-list.
 *
 * A free-for-all `status = whatever` would let a record go straight from
 * DRAFT to SUSPENDED, a state that only means anything for something
 * previously published. Writing the edges down also makes the product rule
 * reviewable in one place instead of inferred from the UI.
 *
 * ARCHIVED is absent on purpose: archiving is DELETE /institutions/:id, which
 * also sets deletedAt. Allowing it here would produce rows that are ARCHIVED
 * but not soft-deleted, so the slug would stay taken and the row would keep
 * surfacing in staff queries.
 */
const STATUS_TRANSITIONS: Readonly<Record<InstitutionStatus, readonly InstitutionStatus[]>> = {
  [InstitutionStatus.DRAFT]: [InstitutionStatus.PENDING_REVIEW, InstitutionStatus.PUBLISHED],
  [InstitutionStatus.PENDING_REVIEW]: [InstitutionStatus.PUBLISHED, InstitutionStatus.DRAFT],
  [InstitutionStatus.PUBLISHED]: [InstitutionStatus.SUSPENDED, InstitutionStatus.DRAFT],
  [InstitutionStatus.SUSPENDED]: [InstitutionStatus.PUBLISHED, InstitutionStatus.DRAFT],
  [InstitutionStatus.ARCHIVED]: [],
};

const isPlatformStaff = (user?: AuthUser): boolean =>
  user?.platformRole === PlatformRole.PLATFORM_ADMIN ||
  user?.platformRole === PlatformRole.SUPER_ADMIN;

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findMany(
    query: QueryInstitutionsDto,
    user?: AuthUser,
  ) {
    const where: Prisma.InstitutionWhereInput = { deletedAt: null };

    // Anonymous and ordinary users only ever see PUBLISHED rows. A client
    // cannot widen this by passing ?status=DRAFT.
    where.status = isPlatformStaff(user)
      ? (query.status ?? undefined)
      : InstitutionStatus.PUBLISHED;

    if (query.category) where.category = query.category;
    if (query.countryCode) where.countryCode = query.countryCode;
    if (query.state) where.state = { equals: query.state, mode: 'insensitive' };
    if (query.city) where.city = { equals: query.city, mode: 'insensitive' };
    // Verification is an internal review signal; only staff may filter on it.
    if (query.verified !== undefined && isPlatformStaff(user)) {
      where.verifiedAt = query.verified ? { not: null } : null;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // sortBy is constrained by @IsIn, so this cannot become injection.
    const orderBy: Prisma.InstitutionOrderByWithRelationInput = {
      [query.sortBy]: query.sortOrder,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.institution.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.limit,
        // Fetched with the parent in one query — a per-row media lookup would
        // be a classic N+1 on the busiest endpoint in the product.
        include: { media: MEDIA_INCLUDE },
      }),
      this.prisma.institution.count({ where }),
    ]);

    return PaginatedResult.from(data, total, query.page, query.limit);
  }

  /** Accepts either a UUID or a slug, so URLs can be human-readable. */
  async findOne(idOrSlug: string, user?: AuthUser) {
    const where: Prisma.InstitutionWhereInput = {
      deletedAt: null,
      OR: [{ id: isUuid(idOrSlug) ? idOrSlug : undefined }, { slug: idOrSlug }].filter(
        (c) => Object.values(c)[0] !== undefined,
      ) as Prisma.InstitutionWhereInput[],
    };
    if (!isPlatformStaff(user)) where.status = InstitutionStatus.PUBLISHED;

    const institution = await this.prisma.institution.findFirst({
      where,
      include: { media: MEDIA_INCLUDE },
    });
    if (!institution) throw new NotFoundException('Institution not found');
    return institution;
  }

  async create(dto: CreateInstitutionDto, actor: Actor) {
    const slug = await this.uniqueSlug(dto.name);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.institution.create({
        data: {
          id: uuidv7(),
          ...dto,
          slug,
          // Server-owned lifecycle: new records are never born PUBLISHED.
          status: InstitutionStatus.DRAFT,
          source: DataSource.MANUAL,
          createdByUserId: actor.id,
        },
      });
      await this.audit.record(tx, actor, {
        action: 'institution.created',
        targetType: 'institution',
        targetId: created.id,
        metadata: { name: created.name, category: created.category, countryCode: created.countryCode },
      });
      return created;
    });
  }

  async update(id: string, dto: UpdateInstitutionDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.institution.findFirst({ where: { id, deletedAt: null } });
      if (!before) throw new NotFoundException('Institution not found');
      const updated = await tx.institution.update({ where: { id }, data: { ...dto } });

      // Field-level before/after, so "who changed the phone number" has an
      // answer. Long text is recorded as changed without copying it.
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(dto) as (keyof UpdateInstitutionDto)[]) {
        const from = before[key as keyof typeof before];
        const to = updated[key as keyof typeof updated];
        if (String(from ?? '') === String(to ?? '')) continue;
        changes[key] = key === 'description' ? { changed: true } : { from: from ?? null, to: to ?? null };
      }
      if (Object.keys(changes).length > 0) {
        await this.audit.record(tx, actor, {
          action: 'institution.updated',
          targetType: 'institution',
          targetId: id,
          metadata: { changes },
        });
      }
      return updated;
    });
  }

  /**
   * Moves a record through the publication lifecycle.
   *
   * `verifiedAt` is stamped the first time a record reaches PUBLISHED and is
   * never cleared afterwards: it records that a human once approved this
   * record, which stays true even if it is later suspended.
   */
  async changeStatus(id: string, dto: UpdateInstitutionStatusDto, actor: Actor) {
    const current = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, verifiedAt: true },
    });
    if (!current) throw new NotFoundException('Institution not found');

    if (dto.status === InstitutionStatus.ARCHIVED) {
      throw new BadRequestException(
        'Archive an institution with DELETE /institutions/:id, which also soft-deletes it',
      );
    }

    if (dto.status === current.status) {
      throw new BadRequestException(`Institution is already ${current.status}`);
    }

    const allowed = STATUS_TRANSITIONS[current.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        allowed.length === 0
          ? `An ${current.status} institution cannot change status`
          : `Cannot go from ${current.status} to ${dto.status}. Allowed: ${allowed.join(', ')}`,
      );
    }

    // Sending a submission back is a rejection, and a rejection the
    // institution cannot learn the reason for is not a review process.
    const rejecting =
      current.status === InstitutionStatus.PENDING_REVIEW && dto.status === InstitutionStatus.DRAFT;
    if (rejecting && !dto.reason) {
      throw new BadRequestException('A reason is required when rejecting a submission');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.institution.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.status === InstitutionStatus.PUBLISHED && current.verifiedAt === null
            ? { verifiedAt: new Date() }
            : {}),
        },
      });
      await this.audit.record(tx, actor, {
        action: 'institution.status_changed',
        targetType: 'institution',
        targetId: id,
        metadata: {
          from: current.status,
          to: dto.status,
          ...(rejecting ? { decision: 'REJECTED' } : {}),
          ...(current.status === InstitutionStatus.PENDING_REVIEW &&
          dto.status === InstitutionStatus.PUBLISHED
            ? { decision: 'APPROVED' }
            : {}),
          ...(dto.reason ? { reason: dto.reason } : {}),
        },
      });
      return updated;
    });
  }

  /**
   * Soft delete. The row is retained for audit and for the foreign keys that
   * later phases (enrollments, fees) will hang off it. The partial unique
   * index on slug excludes soft-deleted rows, so the slug becomes reusable.
   */
  async softDelete(id: string, actor: Actor): Promise<{ id: string; deleted: true }> {
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.institution.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, status: true, name: true },
      });
      if (!found) throw new NotFoundException('Institution not found');
      await tx.institution.update({
        where: { id },
        data: { deletedAt: new Date(), status: InstitutionStatus.ARCHIVED },
      });
      await this.audit.record(tx, actor, {
        action: 'institution.archived',
        targetType: 'institution',
        targetId: id,
        metadata: { from: found.status, name: found.name },
      });
    });
    return { id, deleted: true };
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name).slice(0, 180) || 'institution';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const clash = await this.prisma.institution.findFirst({
        where: { slug: candidate, deletedAt: null },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    // Deterministic attempts exhausted — fall back to a guaranteed-unique suffix.
    return `${base}-${uuidv7().slice(0, 8)}`;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string): boolean => UUID_RE.test(value);
