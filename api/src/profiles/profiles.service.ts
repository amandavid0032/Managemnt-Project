import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformRole, ProfileVisibility, UserStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { AuthUser } from '../common/types/auth-user';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { EducationService } from './education.service';

const PROFILE_SELECT = {
  headline: true,
  bio: true,
  location: true,
  visibility: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** What a user without a profile row looks like. No backfill needed. */
const EMPTY_PROFILE = {
  headline: null,
  bio: null,
  location: null,
  visibility: ProfileVisibility.PRIVATE,
  createdAt: null,
  updatedAt: null,
};

const isPlatformStaff = (user?: AuthUser): boolean =>
  user?.platformRole === PlatformRole.PLATFORM_ADMIN || user?.platformRole === PlatformRole.SUPER_ADMIN;

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly education: EducationService,
  ) {}

  /** The owner's own view: everything, including private fields. */
  async getMine(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        emailVerifiedAt: true,
        createdAt: true,
        profile: { select: PROFILE_SELECT },
      },
    });
    if (!user) throw new NotFoundException('Profile not found');

    const { profile, ...account } = user;
    return {
      user: account,
      profile: profile ?? EMPTY_PROFILE,
      education: await this.education.forUser(userId, 'self'),
    };
  }

  /**
   * fullName lives on `users`, the rest on `user_profiles`. One transaction
   * so a half-saved edit is impossible.
   */
  async updateMine(userId: string, dto: UpdateProfileDto) {
    const profileFields = {
      ...(dto.headline !== undefined ? { headline: dto.headline } : {}),
      ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      if (dto.fullName !== undefined) {
        await tx.user.update({ where: { id: userId }, data: { fullName: dto.fullName } });
      }
      if (Object.keys(profileFields).length > 0) {
        await tx.userProfile.upsert({
          where: { userId },
          create: { userId, ...profileFields },
          update: profileFields,
        });
      }
    });

    return this.getMine(userId);
  }

  async setVisibility(userId: string, visibility: ProfileVisibility) {
    await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, visibility },
      update: { visibility },
    });
    return this.getMine(userId);
  }

  /**
   * Somebody else's profile.
   *
   * Every refusal is the same 404 — "no such user", "suspended" and "private"
   * are indistinguishable, so this endpoint cannot be used to test whether a
   * given id belongs to a real account.
   *
   * Never returns email: a profile is for showing, and an address on it would
   * turn every PUBLIC profile into a harvesting target.
   */
  async getPublic(targetId: string, viewer?: AuthUser) {
    const notFound = new NotFoundException('Profile not found');

    const user = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: {
        id: true,
        fullName: true,
        status: true,
        createdAt: true,
        profile: { select: { headline: true, bio: true, location: true, visibility: true } },
      },
    });
    if (!user) throw notFound;

    const isOwner = viewer?.id === user.id;
    const staff = isPlatformStaff(viewer);
    const visibility = user.profile?.visibility ?? ProfileVisibility.PRIVATE;

    if (!isOwner && !staff) {
      if (user.status !== UserStatus.ACTIVE) throw notFound;
      if (visibility === ProfileVisibility.PRIVATE) throw notFound;
      if (visibility === ProfileVisibility.MEMBERS && !viewer) throw notFound;
    }

    return {
      id: user.id,
      fullName: user.fullName,
      headline: user.profile?.headline ?? null,
      bio: user.profile?.bio ?? null,
      location: user.profile?.location ?? null,
      visibility,
      memberSince: user.createdAt,
      isOwner,
      education: await this.education.forUser(user.id, 'public'),
    };
  }
}
