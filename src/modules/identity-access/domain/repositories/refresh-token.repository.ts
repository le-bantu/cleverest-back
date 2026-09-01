import { RefreshToken } from '../entities/refresh-token.entity';

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');

export abstract class RefreshTokenRepository {
  abstract nextIdentity(): string;
  abstract save(token: RefreshToken): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;
  abstract revokeAllForUser(userId: string): Promise<void>;
}
