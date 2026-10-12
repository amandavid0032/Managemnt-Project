import type { INestApplication } from '@nestjs/common';
import { InstitutionCategory, InstitutionStatus, PlatformRole } from '@prisma/client';
import { uuidv7 } from 'uuidv7';
import type { PrismaService } from '../src/database/prisma.service';
import { api, createTestApp, registerAndLogin, resetDatabase } from './helpers';

describe('Institutions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await resetDatabase(prisma);

    const admin = await registerAndLogin(app, 'admin@inst.test', 'Admin');
    const user = await registerAndLogin(app, 'user@inst.test', 'User');
    userToken = user.accessToken;

    await prisma.user.update({
      where: { id: admin.userId },
      data: { platformRole: PlatformRole.PLATFORM_ADMIN },
    });
    const relogin = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@inst.test', password: 'ValidPass123' })
      .expect(200);
    adminToken = relogin.body.data.accessToken;

    await prisma.institution.createMany({
      data: Array.from({ length: 25 }, (_, i) => ({
        id: uuidv7(),
        name: `Test Institution ${String(i).padStart(2, '0')}`,
        slug: `test-institution-${String(i).padStart(2, '0')}`,
        category: i % 2 === 0 ? InstitutionCategory.SCHOOL : InstitutionCategory.COLLEGE,
        countryCode: i % 3 === 0 ? 'GB' : 'IN',
        city: i % 3 === 0 ? 'London' : 'Mumbai',
        status: InstitutionStatus.PUBLISHED,
      })),
    });

    await prisma.institution.create({
      data: {
        id: uuidv7(),
        name: 'Hidden Draft School',
        slug: 'hidden-draft-school',
        category: InstitutionCategory.SCHOOL,
        countryCode: 'GB',
        status: InstitutionStatus.DRAFT,
      },
    });
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  describe('response envelope (frontend compatibility)', () => {
    it('preserves the legacy { success, count, data } shape', async () => {
      const res = await api(app).get('/api/v1/institutions').expect(200);
      expect(res.body).toMatchObject({ success: true, count: expect.any(Number) });
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.count).toBe(res.body.data.length);
    });

    it('extends it with pagination metadata', async () => {
      const res = await api(app).get('/api/v1/institutions?page=1&limit=10').expect(200);
      expect(res.body.meta.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNext: true,
        hasPrevious: false,
      });
    });
  });

  describe('pagination', () => {
    it('returns distinct, non-overlapping pages', async () => {
      const [p1, p2] = await Promise.all([
        api(app).get('/api/v1/institutions?page=1&limit=10&sortBy=name').expect(200),
        api(app).get('/api/v1/institutions?page=2&limit=10&sortBy=name').expect(200),
      ]);
      const ids1 = p1.body.data.map((i: { id: string }) => i.id);
      const ids2 = p2.body.data.map((i: { id: string }) => i.id);
      expect(ids1).toHaveLength(10);
      expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
    });

    it('reports the final page correctly', async () => {
      const res = await api(app).get('/api/v1/institutions?page=3&limit=10').expect(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta.pagination).toMatchObject({ hasNext: false, hasPrevious: true });
    });

    it('caps limit so a client cannot request the whole table', () =>
      api(app).get('/api/v1/institutions?limit=1000').expect(400));

    it.each([['page=0'], ['page=-1'], ['limit=0'], ['page=abc']])('rejects %s', (q) =>
      api(app).get(`/api/v1/institutions?${q}`).expect(400));
  });

  describe('filtering and search', () => {
    it.each([['SCHOOL'], ['School'], ['school']])(
      'treats category=%s identically (capitalisation independence)',
      async (category) => {
        const res = await api(app).get(`/api/v1/institutions?category=${category}`).expect(200);
        expect(res.body.meta.pagination.total).toBe(13);
      },
    );

    it('normalises multi-word categories', async () => {
      const [underscore, spaced] = await Promise.all([
        api(app).get('/api/v1/institutions?category=training_center').expect(200),
        api(app).get('/api/v1/institutions?category=TRAINING%20CENTER').expect(200),
      ]);
      expect(underscore.body.meta.pagination.total).toBe(spaced.body.meta.pagination.total);
    });

    it('filters by country code', async () => {
      const res = await api(app).get('/api/v1/institutions?countryCode=GB').expect(200);
      expect(res.body.data.every((i: { countryCode: string }) => i.countryCode === 'GB')).toBe(true);
    });

    it('searches case-insensitively by name', async () => {
      const res = await api(app).get('/api/v1/institutions?search=test institution 01').expect(200);
      expect(res.body.meta.pagination.total).toBe(1);
    });

    it('rejects an unknown query parameter instead of ignoring it', () =>
      api(app).get('/api/v1/institutions?sneaky=1').expect(400));

    it('rejects an arbitrary sort field', () =>
      api(app).get('/api/v1/institutions?sortBy=passwordHash').expect(400));

    it('sorts ascending and descending', async () => {
      const [asc, desc] = await Promise.all([
        api(app).get('/api/v1/institutions?sortBy=name&sortOrder=asc&limit=1').expect(200),
        api(app).get('/api/v1/institutions?sortBy=name&sortOrder=desc&limit=1').expect(200),
      ]);
      expect(asc.body.data[0].name).not.toBe(desc.body.data[0].name);
    });
  });

  describe('visibility', () => {
    it('hides non-PUBLISHED institutions from anonymous callers', async () => {
      const res = await api(app).get('/api/v1/institutions?search=Hidden Draft').expect(200);
      expect(res.body.meta.pagination.total).toBe(0);
    });

    it('BREACH IF FAILING: a client cannot reveal drafts via ?status=DRAFT', async () => {
      const res = await api(app).get('/api/v1/institutions?status=DRAFT').expect(200);
      expect(res.body.data.every((i: { status: string }) => i.status === 'PUBLISHED')).toBe(true);
    });

    it('shows drafts to a platform admin', async () => {
      const res = await api(app)
        .get('/api/v1/institutions?status=DRAFT')
        .set(bearer(adminToken))
        .expect(200);
      expect(res.body.meta.pagination.total).toBe(1);
    });
  });

  describe('authorization on writes', () => {
    const payload = { name: 'New School', category: 'SCHOOL', countryCode: 'GB' };

    it('rejects an unauthenticated create', () =>
      api(app).post('/api/v1/institutions').send(payload).expect(401));

    it('rejects an ordinary user', () =>
      api(app).post('/api/v1/institutions').set(bearer(userToken)).send(payload).expect(403));

    it('allows a platform admin', () =>
      api(app).post('/api/v1/institutions').set(bearer(adminToken)).send(payload).expect(201));
  });

  describe('server-owned fields', () => {
    it.each([
      ['status', { status: 'PUBLISHED' }],
      ['source', { source: 'GOOGLE_PLACES' }],
      ['slug', { slug: 'chosen-by-client' }],
      ['verifiedAt', { verifiedAt: '2026-01-01T00:00:00Z' }],
      ['rating', { rating: 5 }],
      ['createdByUserId', { createdByUserId: '00000000-0000-7000-8000-000000000000' }],
    ])('rejects a client-supplied %s', (_l, extra) =>
      api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'X School', category: 'SCHOOL', countryCode: 'GB', ...extra })
        .expect(400),
    );

    it('creates as DRAFT, never PUBLISHED', async () => {
      const res = await api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'Draft Default School', category: 'SCHOOL', countryCode: 'GB' })
        .expect(201);
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('generates a slug and records provenance', async () => {
      const res = await api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'Lycee Saint-Michel Deux', category: 'school', countryCode: 'fr' })
        .expect(201);
      expect(res.body.data.slug).toBe('lycee-saint-michel-deux');
      expect(res.body.data.source).toBe('MANUAL');
      expect(res.body.data.countryCode).toBe('FR');
    });

    it('has no rating column at all', async () => {
      const res = await api(app).get('/api/v1/institutions?limit=1').expect(200);
      expect(res.body.data[0]).not.toHaveProperty('rating');
    });
  });

  describe('validation of input', () => {
    it.each([
      ['bad country code', { countryCode: 'GBR' }],
      ['bad category', { category: 'NOT_A_CATEGORY' }],
      ['latitude out of range', { latitude: 91, longitude: 0 }],
      ['longitude out of range', { latitude: 0, longitude: 181 }],
      ['website without protocol', { website: 'example.com' }],
    ])('rejects %s', (_l, extra) =>
      api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'Bad Input School', category: 'SCHOOL', countryCode: 'GB', ...extra })
        .expect(400),
    );
  });

  describe('lookup and soft delete', () => {
    it('resolves by slug as well as id', async () => {
      const bySlug = await api(app).get('/api/v1/institutions/test-institution-00').expect(200);
      const byId = await api(app).get(`/api/v1/institutions/${bySlug.body.data.id}`).expect(200);
      expect(byId.body.data.id).toBe(bySlug.body.data.id);
    });

    it('returns 404 for an unknown institution', () =>
      api(app).get(`/api/v1/institutions/${uuidv7()}`).expect(404));

    it('soft-deletes, retaining the row for audit', async () => {
      const created = await api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'Doomed Academy', category: 'SCHOOL', countryCode: 'GB' })
        .expect(201);
      const { id } = created.body.data;

      await api(app).delete(`/api/v1/institutions/${id}`).set(bearer(adminToken)).expect(200);
      await api(app).get(`/api/v1/institutions/${id}`).expect(404);

      const row = await prisma.institution.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(row?.deletedAt).not.toBeNull();
    });

    it('frees the slug for reuse after a soft delete', async () => {
      const first = await api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'Reusable Slug College', category: 'COLLEGE', countryCode: 'GB' })
        .expect(201);

      await api(app)
        .delete(`/api/v1/institutions/${first.body.data.id}`)
        .set(bearer(adminToken))
        .expect(200);

      // The partial unique index excludes soft-deleted rows.
      const second = await api(app)
        .post('/api/v1/institutions')
        .set(bearer(adminToken))
        .send({ name: 'Reusable Slug College', category: 'COLLEGE', countryCode: 'GB' })
        .expect(201);

      expect(second.body.data.slug).toBe('reusable-slug-college');
    });
  });

  describe('error contract', () => {
    it('returns a structured error without leaking internals', async () => {
      const res = await api(app).get('/api/v1/institutions?page=0').expect(400);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
      expect(res.body.meta.timestamp).toEqual(expect.any(String));
      expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts:\d+|node_modules|prisma\./i);
    });
  });
});
