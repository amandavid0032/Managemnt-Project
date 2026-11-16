/**
 * Points the e2e suite at the dedicated test database so a test run can never
 * touch development data.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '..', '.env.test'), override: true });
process.env.NODE_ENV = 'test';

// Emails are captured in-process so tests can read links exactly as a
// recipient would. Set here rather than in .env.test so CI (which has no
// .env.test) behaves identically.
process.env.MAIL_PROVIDER = 'memory';
