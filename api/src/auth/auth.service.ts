import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PlatformRole, UserStatus } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../database/prisma.service';
import { PasswordService } from './password.service';
import { TokenService, type IssuedTokens } from './token.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  status: UserStatus;
  createdAt: Date;
}

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  platformRole: true,
  status: true,
  createdAt: true,
} as const;

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('An account with this email already exists');

    return this.prisma.user.create({
      data: {
        id: uuidv7(),
        email: dto.email, // already lowercased by the DTO transform
        fullName: dto.fullName,
        passwordHash: await this.passwords.hash(dto.password),

        // SECURITY: both values are hardcoded server-side. They are not
        // present on RegisterDto and cannot be influenced by the request.
        platformRole: PlatformRole.USER,

        // Email verification ships in Phase 2. Until a verification email can
        // actually be sent, gating login on it would be fake functionality —
        // so accounts start ACTIVE with emailVerifiedAt left null.
        status: UserStatus.ACTIVE,
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  async login(dto: LoginDto, client: ClientInfo): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { ...PUBLIC_USER_SELECT, passwordHash: true, tokenVersion: true },
    });

    // Uniform failure: never reveal whether the address is registered.
    const genericFailure = new UnauthorizedException('Invalid email or password');
    if (!user?.passwordHash) throw genericFailure;

    const valid = await this.passwords.verify(user.passwordHash, dto.password);
    if (!valid) throw genericFailure;

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const tokens = await this.tokens.issue(user.id, user.tokenVersion, client);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Strip the credential material before the object can reach a response.
    const { passwordHash, tokenVersion, ...publicUser } = user;
    return { user: publicUser, tokens };
  }

  refresh(rawToken: string, client: ClientInfo): Promise<IssuedTokens> {
    return this.tokens.rotate(rawToken, client);
  }

  async logout(rawToken: string | undefined): Promise<{ loggedOut: true }> {
    if (rawToken) await this.tokens.revoke(rawToken);
    return { loggedOut: true };
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}
