import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with OWASP-recommended parameters.
 * Chosen over bcrypt for memory-hardness (resistance to GPU/ASIC attack).
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain, ARGON2_OPTIONS);
    } catch {
      // A malformed stored hash must read as "wrong password", not a 500.
      return false;
    }
  }
}
