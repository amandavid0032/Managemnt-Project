import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EmailTokenPurpose,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  UserStatus,
} from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../database/prisma.service';
import { MailService } from '../mail/mail.service';
import { EmailTokensService, TOKEN_TTL_MS } from './email-tokens.service';
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
  /** Null until the owner clicks the link sent to `email`. */
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  platformRole: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * One institution the caller actually belongs to.
 *
 * The frontend needs this to decide which dashboard to offer — it cannot
 * derive it from platformRole, because a school administrator is platform-wide
 * just a USER. Only ACTIVE memberships are returned: a PENDING request is not
 * yet access, and surfacing it would let the UI render a dashboard the API
 * would then refuse with 404.
 */
export interface MembershipSummary {
  institutionId: string;
  slug: string;
  name: string;
  role: MembershipRole;
}

export interface MeResponse {
  user: PublicUser;
  memberships: MembershipSummary[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly emailTokens: EmailTokensService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto, client: ClientInfo = {}): Promise<PublicUser> {
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });
    if (existing) throw new ConflictException('An account with this email already exists');

    const user = await this.prisma.user.create({
      data: {
        id: uuidv7(),
        email: dto.email, // already lowercased by the DTO transform
        fullName: dto.fullName,
        passwordHash: await this.passwords.hash(dto.password),

        // SECURITY: both values are hardcoded server-side. They are not
        // present on RegisterDto and cannot be influenced by the request.
        platformRole: PlatformRole.USER,

        // Accounts start ACTIVE with emailVerifiedAt null. Login is NOT gated
        // on verification: doing so would lock out every existing account
        // and change working Phase 1 behaviour. Instead, the actions that a
        // stolen address could abuse require a verified one — most
        // importantly being added to an institution (see MembershipsService).
        status: UserStatus.ACTIVE,
      },
      select: PUBLIC_USER_SELECT,
    });

    await this.sendVerification(user.id, user.email, user.fullName, client.ipAddress);
    return user;
  }

  // ---------------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------------

  private async sendVerification(
    userId: string,
    email: string,
    fullName: string,
    ip?: string,
  ): Promise<void> {
    const token = await this.emailTokens.issue(userId, email, EmailTokenPurpose.EMAIL_VERIFICATION, ip);
    this.mail.sendEmailVerification(
      email,
      fullName,
      token,
      TOKEN_TTL_MS[EmailTokenPurpose.EMAIL_VERIFICATION] / 3_600_000,
    );
  }

  /** Authenticated: the caller asks for a new link for their own address. */
  async resendVerification(userId: string, ip?: string): Promise<{ sent: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, fullName: true, emailVerifiedAt: true },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.emailVerifiedAt) throw new BadRequestException('Your email address is already verified');

    if (!(await this.emailTokens.canIssue(user.id, EmailTokenPurpose.EMAIL_VERIFICATION))) {
      throw new HttpException(
        'Too many verification emails requested. Please wait 15 minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.sendVerification(user.id, user.email, user.fullName, ip);
    return { sent: true };
  }

  /**
   * Public: possession of the token is the proof. It must match the address
   * the account holds NOW — a link sent to a previous address proves nothing
   * about the current one.
   */
  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const invalid = new BadRequestException('This link is invalid or has expired');

    await this.prisma.$transaction(async (tx) => {
      const token = await this.emailTokens.consume(tx, rawToken, EmailTokenPurpose.EMAIL_VERIFICATION);
      if (!token) throw invalid;

      const user = await tx.user.findFirst({
        where: { id: token.userId, deletedAt: null },
        select: { id: true, email: true, status: true, emailVerifiedAt: true },
      });
      if (!user || user.email !== token.email) throw invalid;

      await tx.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          // Only lifts the verification hold. A SUSPENDED account stays
          // suspended — verifying an address is not an appeal.
          ...(user.status === UserStatus.PENDING_VERIFICATION ? { status: UserStatus.ACTIVE } : {}),
        },
      });
    });

    return { verified: true };
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  /**
   * Always returns the same answer, whether or not the address is registered,
   * so this endpoint cannot be used to discover who has an account. The email
   * is sent in the background for the same reason (see MailService).
   */
  async requestPasswordReset(email: string, ip?: string): Promise<{ requested: true }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true, fullName: true, passwordHash: true },
    });

    // No password means an OAuth-only account (reserved for later): there is
    // nothing to reset. Over the per-account cap, silently send nothing —
    // an error here would reveal that the address exists.
    if (
      user?.passwordHash &&
      (await this.emailTokens.canIssue(user.id, EmailTokenPurpose.PASSWORD_RESET))
    ) {
      const token = await this.emailTokens.issue(user.id, user.email, EmailTokenPurpose.PASSWORD_RESET, ip);
      this.mail.sendPasswordReset(
        user.email,
        user.fullName,
        token,
        TOKEN_TTL_MS[EmailTokenPurpose.PASSWORD_RESET] / 60_000,
      );
    }

    return { requested: true };
  }

  /**
   * Sets a new password from a reset link. In ONE transaction:
   *   - consume this token (fails if used, expired or superseded),
   *   - store the new Argon2id hash,
   *   - bump tokenVersion  → every outstanding access token dies now,
   *   - revoke every refresh token → no device can mint a new one,
   *   - kill any other outstanding reset links.
   *
   * A reset that left existing sessions alive would not evict the attacker
   * the owner is usually resetting to get rid of.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<{ reset: true }> {
    const invalid = new BadRequestException('This link is invalid or has expired');
    // Hash BEFORE opening the transaction: Argon2 is deliberately slow and
    // must not hold a database transaction open while it runs.
    const passwordHash = await this.passwords.hash(newPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const token = await this.emailTokens.consume(tx, rawToken, EmailTokenPurpose.PASSWORD_RESET);
      if (!token) throw invalid;

      const owner = await tx.user.findFirst({
        where: { id: token.userId, deletedAt: null },
        select: { id: true, email: true, fullName: true, emailVerifiedAt: true },
      });
      if (!owner || owner.email !== token.email) throw invalid;

      await tx.user.update({
        where: { id: owner.id },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          // The link reached this inbox and was used: that proves ownership
          // of the address as well as any verification email would.
          emailVerifiedAt: owner.emailVerifiedAt ?? new Date(),
        },
      });
      await tx.refreshToken.updateMany({
        where: { userId: owner.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.emailTokens.revokeAll(tx, owner.id, EmailTokenPurpose.PASSWORD_RESET);

      return owner;
    });

    this.mail.sendPasswordChanged(user.email, user.fullName);
    return { reset: true };
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

  /**
   * Ends every session on every device.
   *
   * Two steps are required and neither is sufficient alone:
   *  - incrementing tokenVersion invalidates outstanding ACCESS tokens
   *    immediately, because JwtStrategy compares the token's `ver` claim
   *    against the stored value on every request;
   *  - revoking the refresh rows stops new access tokens being minted.
   *
   * Both run in one transaction, so a failure cannot leave the account in the
   * state where refresh tokens are dead but old access tokens still work.
   */
  async logoutAll(userId: string): Promise<{ loggedOut: true; sessionsRevoked: number }> {
    const [, revoked] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { loggedOut: true, sessionsRevoked: revoked.count };
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const memberships = await this.prisma.institutionMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
        leftAt: null,
        institution: { deletedAt: null },
      },
      select: {
        role: true,
        institution: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      user,
      memberships: memberships.map((m) => ({
        institutionId: m.institution.id,
        slug: m.institution.slug,
        name: m.institution.name,
        role: m.role,
      })),
    };
  }
}
