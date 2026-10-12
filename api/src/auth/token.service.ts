import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../database/prisma.service';
import type { Env } from '../config/env.schema';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

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
    const raw = randomBytes(32).toString('hex');
    const days = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        id: uuidv7(),
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
   * Presenting an already-consumed token means the token was captured and
   * replayed. The entire rotation family is revoked, forcing re-authentication
   * on every device that chain reached.
   */
  async rotate(rawToken: string, client: ClientInfo): Promise<IssuedTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hashToken(rawToken) },
      include: {
        user: { select: { id: true, tokenVersion: true, status: true, deletedAt: true } },
      },
    });

    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (!stored.user || stored.user.deletedAt || stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active');
    }

    const issued = await this.issue(
      stored.userId,
      stored.user.tokenVersion,
      client,
      stored.familyId,
    );

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return issued;
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
