import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id with the parameters OWASP lists as the low-memory baseline:
 * 19 MiB, two passes, one lane. They are kept here, next to the only code
 * that hashes, because a password hash carries its own parameters in the
 * string: raising them later rehashes new passwords and still verifies the
 * old ones.
 *
 * Argon2id rather than bcrypt because bcrypt costs CPU only, and a GPU has
 * thousands of cores to spend on it. Argon2id also demands memory, which a
 * GPU has far less of per core, so the attacker's advantage shrinks.
 */
/**
 * The `y` parameter of RFC 9106: 0 is Argon2d, 1 is Argon2i, 2 is Argon2id.
 * Written as a number rather than the library's `Algorithm.Argon2id` because
 * that is an ambient `const enum`, and isolatedModules forbids reading one --
 * the compiler would have to inline a value out of a declaration file it
 * never emits.
 */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  /**
   * A hash of a value nobody knows, verified against when the email is
   * unknown. Without it login answers an unknown email in well under a
   * millisecond and a known one in about nine (measured with the parameters
   * above), and that difference alone tells an attacker which addresses are
   * registered -- no matter how identical the two response bodies are.
   */
  private decoyHash = '';

  async onModuleInit(): Promise<void> {
    this.decoyHash = await this.hash(randomBytes(32).toString('base64url'));
  }

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  /**
   * Cost and salt are encoded in `passwordHash`, so no options are passed
   * here: they would override what the stored hash says and verification
   * would start failing the moment the baseline above is raised.
   */
  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  async verifyDecoy(password: string): Promise<void> {
    await this.verify(this.decoyHash, password);
  }
}
