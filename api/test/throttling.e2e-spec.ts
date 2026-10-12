import type { INestApplication } from '@nestjs/common';
import type { PrismaService } from '../src/database/prisma.service';
import { api, createTestApp, resetDatabase } from './helpers';

/**
 * Rate limiting is disabled for the rest of the suite, so it gets explicit
 * coverage here. Login and registration are the endpoints an attacker
 * hammers — credential stuffing and account enumeration both depend on
 * volume.
 */
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp({ enableThrottling: true }));
    await resetDatabase(prisma);
  });

  afterAll(async () => {
    await resetDatabase(prisma);
    await app.close();
  });

  it('throttles repeated registration attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = await api(app)
        .post('/api/v1/auth/register')
        .send({
          email: `throttle${i}@rate.test`,
          password: 'ValidPass123',
          fullName: `Throttle ${i}`,
        });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
    // The limit must bite well before eight attempts succeed.
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5);
  });

  it('returns a structured error when throttled', async () => {
    let throttled: { body: { success: boolean; error: { code: string } } } | undefined;
    for (let i = 0; i < 15; i += 1) {
      const res = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@rate.test', password: 'WrongPass123' });
      if (res.status === 429) {
        throttled = res;
        break;
      }
    }

    expect(throttled).toBeDefined();
    expect(throttled?.body).toMatchObject({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS' },
    });
  });
});
