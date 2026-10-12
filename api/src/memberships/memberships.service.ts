import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, type InstitutionMembership } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PaginatedResult } from '../common/dto/pagination.dto';
import type { PaginationQueryDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import type { TenantContext } from '../common/types/tenant-context';
import type { CreateMembershipDto } from './dto/create-membership.dto';

const MEMBER_SELECT = {
  id: true,
  role: true,
  status: true,
  institutionMemberId: true,
  joinedAt: true,
  leftAt: true,
  createdAt: true,
  institutionId: true,
  user: { select: { id: true, email: true, fullName: true } },
} as const;

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every query below takes its institutionId from TenantContext — the value
   * produced by TenantGuard after verifying an ACTIVE membership. No method
   * here accepts an institution id from the caller.
   */
  async list(tenant: TenantContext, pagination: PaginationQueryDto) {
    const where = { institutionId: tenant.institutionId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.institutionMembership.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.prisma.institutionMembership.count({ where }),
    ]);

    return PaginatedResult.from(data, total, pagination.page, pagination.limit);
  }

  async findOne(tenant: TenantContext, membershipId: string) {
    const membership = await this.prisma.institutionMembership.findFirst({
      // Both predicates matter: without institutionId this would leak
      // another tenant's membership to anyone who guessed the id.
      where: { id: membershipId, institutionId: tenant.institutionId },
      select: MEMBER_SELECT,
    });
    if (!membership) throw new NotFoundException('Membership not found');
    return membership;
  }

  async create(tenant: TenantContext, dto: CreateMembershipDto): Promise<InstitutionMembership> {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.prisma.institutionMembership.findFirst({
      where: {
        userId: dto.userId,
        institutionId: tenant.institutionId,
        role: dto.role,
        leftAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('This user already holds that role at this institution');
    }

    return this.prisma.institutionMembership.create({
      data: {
        id: uuidv7(),
        userId: dto.userId,
        institutionId: tenant.institutionId, // from the guard, never the body
        role: dto.role,
        institutionMemberId: dto.institutionMemberId,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
  }
}
