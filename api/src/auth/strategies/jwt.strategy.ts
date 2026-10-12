import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../database/prisma.service';
import type { AuthUser } from '../../common/types/auth-user';
import type { Env } from '../../config/env.schema';

export interface AccessTokenPayload {
  sub: string;
  ver: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  /**
   * The token is re-checked against the database on every request.
   *
   * This is a deliberate trade of a single indexed lookup for correctness:
   * a suspended or deleted user, or one whose tokenVersion was bumped, loses
   * access immediately rather than when their token happens to expire.
   * The platform role is read from the DB, never from the token body.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: { id: true, platformRole: true, status: true, tokenVersion: true },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== UserStatus.ACTIVE) throw new UnauthorizedException('Account is not active');
    if (user.tokenVersion !== payload.ver) throw new UnauthorizedException('Session expired');

    return { id: user.id, platformRole: user.platformRole };
  }
}
