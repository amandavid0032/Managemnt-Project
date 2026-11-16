import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus, PlatformRole, Prisma, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/decorators/actor.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import type { QueryUsersDto } from './dto/query-users.dto';
import type { UpdatePlatformRoleDto } from './dto/update-platform-role.dto';
import type { UpdateUserStatusDto } from './dto/update-user-status.dto';

/**
 * passwordHash and tokenVersion are absent by design. A `select` that names
 * every field explicitly cannot leak a column added in a later migration,
 * which is exactly what `include`-everything eventually does.
 */
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  platformRole: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { memberships: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findMany(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.platformRole) where.platformRole = query.platformRole;
    if (query.status) where.status = query.status;
    // Same definition as the dashboard's "Active students/teachers" figures,
    // so a card and the list it links to always agree.
    if (query.membershipRole) {
      where.memberships = {
        some: {
          role: query.membershipRole,
          status: MembershipStatus.ACTIVE,
          leftAt: null,
          institution: { deletedAt: null },
        },
      };
    }
    if (query.emailVerified !== undefined) {
      where.emailVerifiedAt = query.emailVerified ? { not: null } : null;
    }

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { fullName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // sortBy is constrained by @IsIn, so this cannot become injection.
    const orderBy: Prisma.UserOrderByWithRelationInput = { [query.sortBy]: query.sortOrder };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: query.skip,
        take: query.limit,
        select: ADMIN_USER_SELECT,
      }),
      this.prisma.user.count({ where }),
    ]);

    return PaginatedResult.from(data, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...ADMIN_USER_SELECT,
        memberships: {
          where: { institution: { deletedAt: null } },
          select: {
            id: true,
            role: true,
            status: true,
            institutionMemberId: true,
            joinedAt: true,
            institution: { select: { id: true, slug: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * Suspends or reinstates an account.
   *
   * Suspension must take effect NOW, not whenever the victim's 15-minute
   * access token happens to expire — an account suspended for abuse that keeps
   * working for another quarter of an hour is not suspended. So it bumps
   * tokenVersion (killing outstanding access tokens, which JwtStrategy
   * re-checks on every request) and revokes the refresh rows, in one
   * transaction with the status change.
   */
  async changeStatus(id: string, dto: UpdateUserStatusDto, actor: Actor) {
    // Guard against locking yourself out of the platform. Easy to do, and
    // recoverable only with database access.
    if (id === actor.id) {
      throw new BadRequestException('You cannot change your own account status');
    }

    const target = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, platformRole: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // A platform admin must not be able to disable the platform owner —
    // otherwise the lesser role can neutralise the greater one.
    if (
      target.platformRole === PlatformRole.SUPER_ADMIN &&
      actor.platformRole !== PlatformRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only a super admin can change a super admin account');
    }

    if (target.status === dto.status) {
      throw new BadRequestException(`Account is already ${dto.status}`);
    }

    const suspending = dto.status === UserStatus.SUSPENDED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          status: dto.status,
          ...(suspending ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: ADMIN_USER_SELECT,
      });
      if (suspending) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record(tx, actor, {
        action: 'user.status_changed',
        targetType: 'user',
        targetId: id,
        metadata: { from: target.status, to: dto.status },
      });
      return updated;
    });
  }

  /**
   * Grants or revokes PLATFORM_ADMIN. Super admins only (enforced on the
   * route), and never on yourself or on another super admin — so the API can
   * neither escalate anyone to owner nor remove the last owner.
   *
   * The role is read from the database on every request (JwtStrategy), so a
   * change applies at once; tokenVersion is bumped anyway so the person signs
   * in again and their UI reloads with the right navigation.
   */
  async changePlatformRole(id: string, dto: UpdatePlatformRoleDto, actor: Actor) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot change your own platform role');
    }
    const target = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, status: true, platformRole: true, emailVerifiedAt: true },
    });
    if (!target) throw new NotFoundException('User not found');

    if (target.platformRole === PlatformRole.SUPER_ADMIN) {
      throw new ForbiddenException('Super admin accounts can only be changed with database access');
    }
    if (target.platformRole === dto.platformRole) {
      throw new BadRequestException(`User is already ${dto.platformRole}`);
    }
    if (
      dto.platformRole === PlatformRole.PLATFORM_ADMIN &&
      (target.status !== UserStatus.ACTIVE || !target.emailVerifiedAt)
    ) {
      throw new BadRequestException('Only an active account with a verified email can be made a platform admin');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { platformRole: dto.platformRole, tokenVersion: { increment: 1 } },
        select: ADMIN_USER_SELECT,
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record(tx, actor, {
        action: 'user.platform_role_changed',
        targetType: 'user',
        targetId: id,
        metadata: { from: target.platformRole, to: dto.platformRole },
      });
      return updated;
    });
  }

  /** Platform-wide counts for the admin overview. */
  async stats() {
    const [total, active, suspended, staff] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { deletedAt: null, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { deletedAt: null, status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({
        where: {
          deletedAt: null,
          platformRole: {
            in: [PlatformRole.PLATFORM_ADMIN, PlatformRole.SUPER_ADMIN],
          },
        },
      }),
    ]);

    return { total, active, suspended, staff };
  }
}
