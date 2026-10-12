import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, InstitutionStatus, PlatformRole, Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import { slugify } from '../common/utils/slugify';
import type { AuthUser } from '../common/types/auth-user';
import type { CreateInstitutionDto } from './dto/create-institution.dto';
import type { QueryInstitutionsDto } from './dto/query-institutions.dto';
import type { UpdateInstitutionDto } from './dto/update-institution.dto';

const MEDIA_INCLUDE = {
  select: { id: true, url: true, altText: true, sortOrder: true, attributionText: true },
  orderBy: { sortOrder: 'asc' },
} as const;

const isPlatformStaff = (user?: AuthUser): boolean =>
  user?.platformRole === PlatformRole.PLATFORM_ADMIN ||
  user?.platformRole === PlatformRole.SUPER_ADMIN;

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(dto: CreateInstitutionDto, user: AuthUser) {
    return this.prisma.institution.create({
      data: {
        id: uuidv7(),
        ...dto,
        slug: await this.uniqueSlug(dto.name),
        // Server-owned lifecycle: new records are never born PUBLISHED.
        status: InstitutionStatus.DRAFT,
        source: DataSource.MANUAL,
        createdByUserId: user.id,
      },
    });
  }

  async update(id: string, dto: UpdateInstitutionDto) {
    await this.assertExists(id);
    return this.prisma.institution.update({ where: { id }, data: { ...dto } });
  }

  /**
   * Soft delete. The row is retained for audit and for the foreign keys that
   * later phases (enrollments, fees) will hang off it. The partial unique
   * index on slug excludes soft-deleted rows, so the slug becomes reusable.
   */
  async softDelete(id: string): Promise<{ id: string; deleted: true }> {
    await this.assertExists(id);
    await this.prisma.institution.update({
      where: { id },
      data: { deletedAt: new Date(), status: InstitutionStatus.ARCHIVED },
    });
    return { id, deleted: true };
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Institution not found');
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
