/**
 * Creates (or promotes) the platform's SUPER_ADMIN account.
 *
 *   SUPER_ADMIN_EMAIL=you@example.com \
 *   SUPER_ADMIN_PASSWORD='<strong password>' \
 *   npm run create:superadmin
 *
 * Unlike prisma/seed.ts this script is SAFE TO RUN IN PRODUCTION: it creates
 * exactly one account, invents no password of its own, and prints no secret.
 * The seed's super.admin@eduhub.test is a demo credential with a password
 * committed to git — it must never be the way a real deployment is bootstrapped.
 *
 * Idempotent. Running it twice is harmless: the second run finds the account
 * and reports that nothing changed.
 *
 * There is deliberately no API endpoint that grants SUPER_ADMIN. The first
 * super admin can only be created by someone holding the database credentials,
 * so a bug in request validation can never escalate anyone to platform owner.
 */
import { PlatformRole, PrismaClient, UserStatus } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { uuidv7 } from 'uuidv7';

const prisma = new PrismaClient();

/** Must match PasswordService exactly, or the account cannot log in. */
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

/** Mirrors RegisterDto, so a password accepted here is one the API accepts. */
function validatePassword(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push('must be at least 12 characters');
  if (password.length > 128) errors.push('must be at most 128 characters');
  if (!/[a-z]/.test(password)) errors.push('must contain a lowercase letter');
  if (!/[A-Z]/.test(password)) errors.push('must contain an uppercase letter');
  if (!/[0-9]/.test(password)) errors.push('must contain a digit');
  return errors;
}

async function main(): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const fullName = process.env.SUPER_ADMIN_NAME?.trim() || 'Platform Owner';

  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must both be set.\n' +
        "Generate one with: openssl rand -base64 24 | tr -d '\\n'",
    );
  }

  // A basic shape check only — deliverability is not this script's business.
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) {
    throw new Error(`SUPER_ADMIN_EMAIL is not a valid email address: ${email}`);
  }

  const problems = validatePassword(password);
  if (problems.length > 0) {
    // The password itself is never echoed, only what is wrong with it.
    throw new Error(`SUPER_ADMIN_PASSWORD ${problems.join(', ')}`);
  }

  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, platformRole: true },
  });

  if (existing) {
    if (existing.platformRole === PlatformRole.SUPER_ADMIN) {
      console.warn(`Already a SUPER_ADMIN: ${email} — nothing to do.`);
      return;
    }

    // Promote, but leave the password alone. Silently overwriting the
    // credential of an existing account would turn a typo in SUPER_ADMIN_EMAIL
    // into an account takeover.
    await prisma.user.update({
      where: { id: existing.id },
      data: { platformRole: PlatformRole.SUPER_ADMIN },
    });
    console.warn(
      `Promoted existing account to SUPER_ADMIN: ${email}\n` +
        'Its password was NOT changed — sign in with the password that account already had.',
    );
    return;
  }

  await prisma.user.create({
    data: {
      id: uuidv7(),
      email,
      fullName,
      passwordHash: await hash(password, ARGON2_OPTIONS),
      platformRole: PlatformRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      // Self-provisioned from the server, so there is no address to verify
      // against — the operator already proved control by holding the DB.
      emailVerifiedAt: new Date(),
    },
  });

  console.warn(`Created SUPER_ADMIN: ${email}`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
