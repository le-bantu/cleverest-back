export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

/**
 * PORT. Implemented in infrastructure with argon2, with transparent support
 * for verifying legacy bcrypt hashes migrated from Laravel.
 */
export abstract class PasswordHasher {
  abstract hash(plain: string): Promise<string>;
  abstract verify(plain: string, hash: string): Promise<boolean>;
  /** True when `hash` is not in the current preferred format (e.g. bcrypt) → rehash on next login. */
  abstract needsRehash(hash: string): boolean;
}
