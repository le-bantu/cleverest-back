import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcryptjs';
import { PasswordHasher } from '../../domain';

const BCRYPT_RE = /^\$2[aby]?\$/;

/**
 * argon2id hasher. Transparently verifies legacy bcrypt hashes migrated from
 * Laravel; `needsRehash` returns true for those so the login use case upgrades
 * them to argon2 on the next successful sign-in.
 */
@Injectable()
export class Argon2PasswordHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    if (BCRYPT_RE.test(hash)) {
      // Laravel stores $2y$; bcryptjs understands it directly.
      return bcrypt.compare(plain, hash);
    }
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return !hash.startsWith('$argon2');
  }
}
