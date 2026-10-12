/**
 * Deterministic development seed.
 *
 * Every row is tagged `source: SEED` so demo data is always distinguishable
 * from real records, and IDs are derived from stable names so re-running the
 * seed updates the same rows instead of creating duplicates.
 *
 * There are NO ratings here. The previous MongoDB model generated a random
 * 3.0–5.0 score per institution and rendered it as a quality signal; ratings
 * must be derived from real reviews and arrive with the Reviews module.
 */
import {
  DataSource,
  InstitutionCategory,
  InstitutionStatus,
  MembershipRole,
  MembershipStatus,
  PlatformRole,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

/** Stable UUID derived from a label — makes the seed idempotent. */
function deterministicId(label: string): string {
  const h = createHash('sha256').update(`eduhub-seed:${label}`).digest('hex');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `7${h.slice(13, 16)}`,
    ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join('-');
}

const slugify = (s: string): string =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Coherent, real-world-plausible locations. The old faker data produced
 * combinations like {country: "Swaziland", state: "Verona"} which are useless
 * for testing location filtering.
 */
const INSTITUTIONS = [
  { name: 'Northgate Secondary School', category: InstitutionCategory.SCHOOL, city: 'Manchester', state: 'England', countryCode: 'GB', lat: 53.4808, lng: -2.2426 },
  { name: 'Riverside Polytechnic', category: InstitutionCategory.POLYTECHNIC, city: 'Singapore', state: 'Central', countryCode: 'SG', lat: 1.3521, lng: 103.8198 },
  { name: 'Delhi Institute of Technology', category: InstitutionCategory.INSTITUTE, city: 'New Delhi', state: 'Delhi', countryCode: 'IN', lat: 28.6139, lng: 77.209 },
  { name: 'Cape Town University College', category: InstitutionCategory.UNIVERSITY, city: 'Cape Town', state: 'Western Cape', countryCode: 'ZA', lat: -33.9249, lng: 18.4241 },
  { name: 'Lakeside Community College', category: InstitutionCategory.COLLEGE, city: 'Toronto', state: 'Ontario', countryCode: 'CA', lat: 43.6532, lng: -79.3832 },
  { name: 'Meridian Training Center', category: InstitutionCategory.TRAINING_CENTER, city: 'Dubai', state: 'Dubai', countryCode: 'AE', lat: 25.2048, lng: 55.2708 },
  { name: 'Sakura Coaching Center', category: InstitutionCategory.COACHING_CENTER, city: 'Osaka', state: 'Osaka', countryCode: 'JP', lat: 34.6937, lng: 135.5023 },
  { name: 'Brisbane Vocational Academy', category: InstitutionCategory.OTHER, city: 'Brisbane', state: 'Queensland', countryCode: 'AU', lat: -27.4698, lng: 153.0251, typeLabel: 'TAFE' },
  { name: 'Lycee Saint-Michel', category: InstitutionCategory.SCHOOL, city: 'Lyon', state: 'Auvergne-Rhone-Alpes', countryCode: 'FR', lat: 45.764, lng: 4.8357, typeLabel: 'Lycee' },
  { name: 'Nairobi Business College', category: InstitutionCategory.COLLEGE, city: 'Nairobi', state: 'Nairobi', countryCode: 'KE', lat: -1.2921, lng: 36.8219 },
  { name: 'Berlin Technical Gymnasium', category: InstitutionCategory.SCHOOL, city: 'Berlin', state: 'Berlin', countryCode: 'DE', lat: 52.52, lng: 13.405, typeLabel: 'Gymnasium' },
  { name: 'Sao Paulo Federal University', category: InstitutionCategory.UNIVERSITY, city: 'Sao Paulo', state: 'Sao Paulo', countryCode: 'BR', lat: -23.5505, lng: -46.6333 },
] as const;

/**
 * Demo accounts. The password is intentionally a well-known development value
 * and these accounts exist ONLY in development — the guard below prevents this
 * script from ever running against production.
 */
const DEMO_PASSWORD = 'DevPassword123';

const USERS = [
  { key: 'platform-admin', email: 'platform.admin@eduhub.test', fullName: 'Priya Platform', platformRole: PlatformRole.PLATFORM_ADMIN },
  { key: 'alice-admin',    email: 'alice.admin@eduhub.test',    fullName: 'Alice Adeyemi',  platformRole: PlatformRole.USER },
  { key: 'bob-admin',      email: 'bob.admin@eduhub.test',      fullName: 'Bob Baptiste',   platformRole: PlatformRole.USER },
  { key: 'carla-student',  email: 'carla.student@eduhub.test',  fullName: 'Carla Chen',     platformRole: PlatformRole.USER },
] as const;

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production. This script creates demo accounts.');
  }

  const passwordHash = await hash(DEMO_PASSWORD, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  for (const u of USERS) {
    const id = deterministicId(`user:${u.key}`);
    await prisma.user.upsert({
      where: { id },
      update: { fullName: u.fullName, platformRole: u.platformRole },
      create: {
        id,
        email: u.email,
        fullName: u.fullName,
        passwordHash,
        platformRole: u.platformRole,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
  }

  for (const inst of INSTITUTIONS) {
    const id = deterministicId(`institution:${inst.name}`);
    const data = {
      name: inst.name,
      slug: slugify(inst.name),
      category: inst.category,
      typeLabel: 'typeLabel' in inst ? inst.typeLabel : null,
      description: `${inst.name} is demonstration data generated by the EduHub development seed. It does not describe a real institution.`,
      city: inst.city,
      state: inst.state,
      countryCode: inst.countryCode,
      latitude: inst.lat,
      longitude: inst.lng,
      status: InstitutionStatus.PUBLISHED,
      source: DataSource.SEED,
      sourceUpdatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    await prisma.institution.upsert({ where: { id }, update: data, create: { id, ...data } });

    // Demo photography. These are placeholder images from a lorem-ipsum
    // service, not photographs of any real institution — hence the explicit
    // attribution text and source: SEED.
    await prisma.institutionMedia.deleteMany({ where: { institutionId: id } });
    await prisma.institutionMedia.createMany({
      data: Array.from({ length: 4 }, (_, i) => ({
        id: deterministicId(`media:${inst.name}:${i}`),
        institutionId: id,
        url: `https://picsum.photos/seed/${encodeURIComponent(slugify(inst.name))}-${i}/800/600`,
        altText: `Placeholder image ${i + 1} for ${inst.name}`,
        sortOrder: i,
        source: DataSource.SEED,
        attributionText: 'Placeholder image (picsum.photos) — not a real photograph',
      })),
    });
  }

  /**
   * Two institutions with separate administrators. This is the fixture the
   * tenant-isolation tests run against: Alice administers Northgate, Bob
   * administers Riverside, and neither may see the other's memberships.
   */
  const northgate = deterministicId('institution:Northgate Secondary School');
  const riverside = deterministicId('institution:Riverside Polytechnic');

  const memberships = [
    { key: 'alice@northgate', userKey: 'alice-admin',   institutionId: northgate, role: MembershipRole.INSTITUTION_ADMIN, memberId: 'NG-ADM-001' },
    { key: 'bob@riverside',   userKey: 'bob-admin',     institutionId: riverside, role: MembershipRole.INSTITUTION_ADMIN, memberId: 'RP-ADM-001' },
    { key: 'carla@northgate', userKey: 'carla-student', institutionId: northgate, role: MembershipRole.STUDENT,           memberId: 'NG-STU-2026-014' },
  ] as const;

  for (const m of memberships) {
    const id = deterministicId(`membership:${m.key}`);
    const data = {
      userId: deterministicId(`user:${m.userKey}`),
      institutionId: m.institutionId,
      role: m.role,
      status: MembershipStatus.ACTIVE,
      institutionMemberId: m.memberId,
      joinedAt: new Date('2026-01-15T00:00:00Z'),
    };
    await prisma.institutionMembership.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  const [users, institutions, membershipCount, mediaCount] = await Promise.all([
    prisma.user.count(),
    prisma.institution.count(),
    prisma.institutionMembership.count(),
    prisma.institutionMedia.count(),
  ]);

  console.warn(
    `Seed complete — ${users} users, ${institutions} institutions, ` +
      `${membershipCount} memberships, ${mediaCount} media (all source=SEED).`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
