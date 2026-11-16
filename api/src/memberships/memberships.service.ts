import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma, UserStatus } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/decorators/actor.decorator';
import { PaginatedResult } from '../common/dto/pagination.dto';
import { PrismaService } from '../database/prisma.service';
import type { TenantContext } from '../common/types/tenant-context';
import type { CreateMembershipDto } from './dto/create-membership.dto';
import type {
  QueryMembershipsDto,
  UpdateMembershipDto,
  UpdateMembershipStatusDto,
} from './dto/manage-membership.dto';

const MEMBER_SELECT = {
  id: true,
  userId: true,
  role: true,
  status: true,
  institutionMemberId: true,
  joinedAt: true,
  leftAt: true,
  createdAt: true,
  updatedAt: true,
  institutionId: true,
  user: { select: { id: true, email: true, fullName: true } },
  createdBy: { select: { id: true, fullName: true } },
} as const;

type Tx = Prisma.TransactionClient;

/** Prisma's codes for races a careful pre-check can still lose. */
const UNIQUE_VIOLATION = 'P2002';
const SERIALIZATION_FAILURE = 'P2034'; // deadlock / write conflict

/** How the actor reached this institution: their own membership, or platform staff override. */
const actingAs = (tenant: TenantContext): string =>
  tenant.membershipId === 'platform-override' ? 'PLATFORM_OVERRIDE' : tenant.membershipRole;

const isPrismaError = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Every query below takes its institutionId from TenantContext — the value
   * produced by TenantGuard after verifying an ACTIVE membership. No method
   * here accepts an institution id from the caller.
   */
  async list(tenant: TenantContext, query: QueryMembershipsDto) {
    const where: Prisma.InstitutionMembershipWhereInput = { institutionId: tenant.institutionId };
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { user: { fullName: { contains: query.search, mode: 'insensitive' } } },
        { user: { email: { contains: query.search, mode: 'insensitive' } } },
        { institutionMemberId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.institutionMembership.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.institutionMembership.count({ where }),
    ]);

    return PaginatedResult.from(data, total, query.page, query.limit);
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

  /**
   * Finds one account by its exact address, so an administrator can confirm
   * they have the right person before adding them.
   *
   * Returns only what is needed to recognise them — name, address, whether
   * the address is verified, and the roles they already hold HERE. Nothing
   * about their memberships at other institutions: that is another tenant's
   * business.
   */
  async lookup(tenant: TenantContext, email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        emailVerifiedAt: true,
        memberships: {
          where: { institutionId: tenant.institutionId, leftAt: null },
          select: { id: true, role: true, status: true },
        },
      },
    });
    if (!user) throw new NotFoundException('No EduHub account uses that email address');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerifiedAt !== null,
      accountActive: user.status === UserStatus.ACTIVE,
      currentMemberships: user.memberships,
    };
  }

  /**
   * Links an existing account to this institution.
   *
   * The address must be VERIFIED. Otherwise anyone could register an account
   * with a student's address before the student does, wait to be enrolled,
   * and walk into that school's data. Verification is what proves the account
   * belongs to the person the institution means.
   */
  async create(tenant: TenantContext, dto: CreateMembershipDto, actor: Actor) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      select: { id: true, status: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('That account is not active and cannot be added');
    }
    if (!user.emailVerifiedAt) {
      throw new BadRequestException(
        'That person has not verified their email address yet. Ask them to verify it, then add them.',
      );
    }

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

    // Two admins adding the same person at once: the partial unique index
    // stops the second, and inTransaction reports it as a 409, not a 500.
    return this.inTransaction(async (tx) => {
      const created = await tx.institutionMembership.create({
        data: {
          id: uuidv7(),
          userId: dto.userId,
          institutionId: tenant.institutionId, // from the guard, never the body
          role: dto.role,
          institutionMemberId: dto.institutionMemberId,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
          createdByUserId: actor.id,
        },
        select: MEMBER_SELECT,
      });
      await this.audit.record(tx, actor, {
        action: 'membership.created',
        targetType: 'membership',
        targetId: created.id,
        institutionId: tenant.institutionId,
        metadata: { userId: dto.userId, role: dto.role, actingAs: actingAs(tenant) },
      });
      return created;
    });
  }

  /** Corrects role or member id. Status has its own endpoint. */
  async update(tenant: TenantContext, membershipId: string, dto: UpdateMembershipDto, actor: Actor) {
    if (dto.role === undefined && dto.institutionMemberId === undefined) {
      throw new BadRequestException('Nothing to change');
    }

    return this.inTransaction(async (tx) => {
      const current = await this.loadForChange(tx, tenant, membershipId);

      if (dto.role !== undefined && dto.role !== current.role) {
        await this.assertAdminRemains(tx, tenant, current, { role: dto.role });
      }

      const updated = await tx.institutionMembership.update({
        where: { id: current.id },
        data: {
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.institutionMemberId !== undefined
            ? { institutionMemberId: dto.institutionMemberId }
            : {}),
        },
        select: MEMBER_SELECT,
      });
      await this.audit.record(tx, actor, {
        action: 'membership.updated',
        targetType: 'membership',
        targetId: current.id,
        institutionId: tenant.institutionId,
        metadata: {
          userId: updated.userId,
          ...(dto.role !== undefined ? { role: { from: current.role, to: dto.role } } : {}),
          ...(dto.institutionMemberId !== undefined ? { institutionMemberIdChanged: true } : {}),
          actingAs: actingAs(tenant),
        },
      });
      return updated;
    });
  }

  /**
   * Suspend, reinstate or end a membership.
   *
   * Ending sets LEFT and left_at and KEEPS the row. Deleting it would erase
   * the person's education history at this institution — the record that
   * they were here does not stop being true when they leave.
   *
   * Access is lost immediately in every case: TenantGuard requires an ACTIVE
   * membership with no left_at on every request.
   */
  async changeStatus(
    tenant: TenantContext,
    membershipId: string,
    dto: UpdateMembershipStatusDto,
    actor: Actor,
  ) {
    return this.inTransaction(async (tx) => {
      const current = await this.loadForChange(tx, tenant, membershipId);

      if (current.status === dto.status) {
        throw new BadRequestException(`Membership is already ${dto.status}`);
      }
      if (dto.status !== MembershipStatus.ACTIVE) {
        await this.assertAdminRemains(tx, tenant, current, { status: dto.status });
      }

      const ending = dto.status === MembershipStatus.LEFT;
      const updated = await tx.institutionMembership.update({
        where: { id: current.id },
        data: {
          status: dto.status,
          ...(ending ? { leftAt: new Date() } : {}),
          // Reinstating a pending request also starts it.
          ...(dto.status === MembershipStatus.ACTIVE && !current.joinedAt ? { joinedAt: new Date() } : {}),
        },
        select: MEMBER_SELECT,
      });
      await this.audit.record(tx, actor, {
        action: 'membership.status_changed',
        targetType: 'membership',
        targetId: current.id,
        institutionId: tenant.institutionId,
        metadata: {
          userId: updated.userId,
          from: current.status,
          to: dto.status,
          actingAs: actingAs(tenant),
        },
      });
      return updated;
    });
  }

  // ---------------------------------------------------------------------------

  private async loadForChange(tx: Tx, tenant: TenantContext, membershipId: string) {
    const membership = await tx.institutionMembership.findFirst({
      where: { id: membershipId, institutionId: tenant.institutionId },
      select: { id: true, role: true, status: true, leftAt: true, joinedAt: true },
    });
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.leftAt || membership.status === MembershipStatus.LEFT) {
      throw new ConflictException(
        'This membership has ended and is kept as history. Add the person again to re-enrol them.',
      );
    }
    return membership;
  }

  /**
   * An institution must always keep at least one ACTIVE administrator.
   * Without one, nobody but platform staff could manage it again.
   *
   * Race-safe by row locking: the institution's active admin rows are locked
   * FOR UPDATE before counting. Two admins demoting each other at the same
   * moment would otherwise each see "one other admin remains" and both
   * succeed, leaving none. With the lock, the second transaction waits for
   * the first to commit and then counts the world as it now is.
   */
  private async assertAdminRemains(
    tx: Tx,
    tenant: TenantContext,
    current: { id: string; role: MembershipRole; status: MembershipStatus },
    change: { role?: MembershipRole; status?: MembershipStatus },
  ): Promise<void> {
    const isActiveAdmin =
      current.role === MembershipRole.INSTITUTION_ADMIN && current.status === MembershipStatus.ACTIVE;
    const remainsActiveAdmin =
      (change.role ?? current.role) === MembershipRole.INSTITUTION_ADMIN &&
      (change.status ?? current.status) === MembershipStatus.ACTIVE;
    if (!isActiveAdmin || remainsActiveAdmin) return;

    await tx.$queryRaw`
      SELECT id FROM institution_memberships
      WHERE institution_id = ${tenant.institutionId}::uuid
        AND role = 'INSTITUTION_ADMIN'
        AND status = 'ACTIVE'
        AND left_at IS NULL
      FOR UPDATE`;

    const others = await tx.institutionMembership.count({
      where: {
        institutionId: tenant.institutionId,
        role: MembershipRole.INSTITUTION_ADMIN,
        status: MembershipStatus.ACTIVE,
        leftAt: null,
        id: { not: current.id },
      },
    });
    if (others === 0) {
      throw new ConflictException(
        'This is the only active administrator. Make someone else an administrator first.',
      );
    }
  }

  /**
   * Interactive transaction for read-check-write changes. Correctness of the
   * admin invariant comes from the row lock in assertAdminRemains, which works
   * at the default READ COMMITTED level: each statement after the lock sees
   * everything committed before it was granted.
   */
  private async inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      throw this.translateConflict(error);
    }
  }

  private translateConflict(error: unknown): unknown {
    if (isPrismaError(error, UNIQUE_VIOLATION)) {
      return new ConflictException(
        'That would duplicate an active membership: this person already holds that role here, or that member ID is in use.',
      );
    }
    if (isPrismaError(error, SERIALIZATION_FAILURE)) {
      return new ConflictException('Another change was made at the same time. Please try again.');
    }
    return error;
  }
}
