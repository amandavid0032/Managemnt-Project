import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../database/prisma.service';
import type { Env } from '../config/env.schema';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * How long after a rotation a second use of the old token is treated as a
 * concurrent-tab race rather than theft. Concurrent tabs collide within
 * milliseconds; a few seconds covers slow networks without giving a replay
 * much room to go unnoticed.
 */
export const REUSE_GRACE_MS = 10_000;

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Refresh tokens are opaque random values — only their SHA-256 is stored. */
  private static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private signAccessToken(userId: string, tokenVersion: number): string {
    return this.jwt.sign(
      { sub: userId, ver: tokenVersion },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      },
    );
  }

  async issue(
    userId: string,
    tokenVersion: number,
    client: ClientInfo,
    familyId = uuidv7(),
  ): Promise<IssuedTokens> {
    return this.createToken(this.prisma, uuidv7(), userId, tokenVersion, client, familyId);
  }

  /** Inserts one refresh token row and signs the matching access token. */
  private async createToken(
    db: Prisma.TransactionClient,
    id: string,
    userId: string,
    tokenVersion: number,
    client: ClientInfo,
    familyId: string,
  ): Promise<IssuedTokens> {
    const raw = randomBytes(32).toString('hex');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await db.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: TokenService.hashToken(raw),
        familyId,
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, 512),
        ipAddress: client.ipAddress?.slice(0, 45),
      },
    });

    return {
      accessToken: this.signAccessToken(userId, tokenVersion),
      refreshToken: raw,
      refreshExpiresAt,
    };
  }

  /**
   * Rotation with reuse detection.
   *
   * Consuming a token is a single conditional UPDATE (`... WHERE revoked_at
   * IS NULL`). Postgres row locking makes concurrent requests with the same
   * token queue on that row: exactly one sees it unrevoked and wins; the rest
   * re-check the condition after the winner commits, match nothing, and are
   * refused. The replacement token is inserted in the same transaction, so a
   * token is never consumed without a successor, nor a successor created
   * without consuming its parent.
   *
   * Presenting an already-consumed token normally means it was captured and
   * replayed, and the whole rotation family is revoked. The exception is a
   * token rotated within the last REUSE_GRACE_MS: that is two tabs sharing
   * one cookie and refreshing together. The loser is refused but the family
   * is left alone, otherwise multi-tab users would be signed out at random.
   * A replay inside that window gains an attacker nothing (no tokens are
   * issued); it only fails to raise the alarm.
   */
  async rotate(rawToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const invalid = new UnauthorizedException('Invalid refresh token');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hashToken(rawToken) },
      include: {
        user: { select: { id: true, tokenVersion: true, status: true, deletedAt: true } },
      },
    });

    if (!stored) throw invalid;

    if (stored.revokedAt) {
      if (!TokenService.isRecentRotation(stored)) await this.revokeFamily(stored.familyId);
      throw invalid;
    }

    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (!stored.user || stored.user.deletedAt || stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const successorId = uuidv7();
    const issued = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.refreshToken.updateMany({
        where: { id: stored.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: successorId },
      });
      // Lost the race to a concurrent request with the same token (or to a
      // logout). Nothing is issued and the winner's session is untouched.
      if (consumed.count !== 1) return null;

      return this.createToken(
        tx,
        successorId,
        stored.userId,
        stored.user.tokenVersion,
        client,
        stored.familyId,
      );
    });

    if (!issued) throw invalid;
    return issued;
  }

  private static isRecentRotation(token: { revokedAt: Date | null; replacedById: string | null }): boolean {
    return (
      token.replacedById !== null &&
      token.revokedAt !== null &&
      Date.now() - token.revokedAt.getTime() < REUSE_GRACE_MS
    );
  }

  async revoke(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: TokenService.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
