export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');

export interface AccessTokenClaims {
  userId: string;
  email: string | null;
  roles: string[];
  permissions: string[];
}

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

export interface IssuedRefreshToken {
  /** opaque token handed to the client */
  token: string;
  /** deterministic hash persisted server-side for lookup */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * PORT. Implemented in infrastructure with @nestjs/jwt for the access token
 * and an opaque random string (+ sha256 hash) for the refresh token.
 */
export abstract class TokenIssuer {
  abstract issueAccessToken(claims: AccessTokenClaims): Promise<IssuedAccessToken>;
  abstract issueRefreshToken(userId: string): Promise<IssuedRefreshToken>;
  abstract hashRefreshToken(token: string): string;
}
