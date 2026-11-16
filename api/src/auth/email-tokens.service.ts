import { Injectable } from '@nestjs/common';
import { EmailTokenPurpose, type Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../database/prisma.service';

export const TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  // Short: a reset link sitting in an inbox is a standing key to the account.
  [EmailTokenPurpose.PASSWORD_RESET]: 30 * 60 * 1000,
  // Longer: people verify when they next open their mail, not instantly.
  [EmailTokenPurpose.EMAIL_VERIFICATION]: 24 * 60 * 60 * 1000,
};

/**
 * How many tokens of one purpose an account may be sent per window.
 *
 * The IP-based throttle alone does not stop someone with many IPs from
 * flooding one victim's inbox, so issuance is also capped per account.
 */
export const ISSUE_LIMIT = { count: 3, windowMs: 15 * 60 * 1000 } as const;

const hash = (raw: string): string => createHash('sha256').update(raw).digest('hex');

export interface ConsumedToken {
  userId: string;
  email: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Single-use, expiring, hashed-at-rest tokens delivered by email.
 *
 *  - 32 random bytes: unguessable, so no rate limit is load-bearing for
 *    secrecy (the throttles exist against inbox flooding, not guessing).
 *  - Only the SHA-256 is stored. A leaked database backup cannot be used to
 *    reset anyone's password.
 *  - Issuing a new token kills every earlier unused one of the same purpose,
 *    so only the most recent email works.
 *  - Consumption is a conditional UPDATE, so two simultaneous requests with
 *    the same token cannot both succeed.
 */
@Injectable()
export class EmailTokensService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when the account may be sent another token of this purpose now. */
  async canIssue(userId: string, purpose: EmailTokenPurpose): Promise<boolean> {
    const recent = await this.prisma.emailToken.count({
      where: {
        userId,
        purpose,
        createdAt: { gt: new Date(Date.now() - ISSUE_LIMIT.windowMs) },
      },
    });
    return recent < ISSUE_LIMIT.count;
  }

  /** Returns the RAW token. It exists only in this return value and the email. */
  async issue(
    userId: string,
    email: string,
    purpose: EmailTokenPurpose,
    requestIp?: string,
  ): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.emailToken.create({
        data: {
          id: uuidv7(),
          userId,
          purpose,
          tokenHash: hash(raw),
          email,
          expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
          requestIp: requestIp?.slice(0, 45),
          createdAt: now,
        },
      }),
    ]);

    return raw;
  }

  /**
   * Atomically marks the token used and returns who it belongs to, or null if
   * it is unknown, expired, already used, superseded, or for another purpose.
   *
   * Every failure returns the same null on purpose: telling "expired" apart
   * from "never existed" helps nobody but an attacker probing tokens.
   *
   * Runs inside the caller's transaction so that consuming the token and
   * acting on it (changing the password, marking the address verified)
   * either both happen or neither does.
   */
  async consume(tx: Tx, raw: string, purpose: EmailTokenPurpose): Promise<ConsumedToken | null> {
    if (typeof raw !== 'string' || raw.length === 0) return null;

    const tokenHash = hash(raw);
    const now = new Date();

    const claimed = await tx.emailToken.updateMany({
      where: { tokenHash, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (claimed.count !== 1) return null;

    const token = await tx.emailToken.findUnique({
      where: { tokenHash },
      select: { userId: true, email: true },
    });
    return token;
  }

  /** Kills every outstanding token of a purpose — e.g. all resets after a reset. */
  async revokeAll(tx: Tx, userId: string, purpose: EmailTokenPurpose): Promise<void> {
    await tx.emailToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
  }
}
