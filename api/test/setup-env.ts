/**
 * Points the e2e suite at the dedicated test database so a test run can never
 * touch development data.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '..', '.env.test'), override: true });
process.env.NODE_ENV = 'test';
