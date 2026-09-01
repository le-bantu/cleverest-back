import { PasswordHasher } from '../domain/services/password-hasher';
import {
  AccessTokenClaims,
  IssuedAccessToken,
  IssuedRefreshToken,
  TokenIssuer,
} from '../domain/services/token-issuer';
import { RoleCatalogPort } from '../domain/services/role-catalog.port';

/**
 * Deterministic hasher for unit tests. `argon:<plain>` is the preferred format;
 * `bcrypt:<plain>` simulates a legacy hash that needs a rehash on login.
 */
export class FakeHasher extends PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`argon:${plain}`);
  }
  verify(plain: string, hash: string): Promise<boolean> {
    return Promise.resolve(hash === `argon:${plain}` || hash === `bcrypt:${plain}`);
  }
  needsRehash(hash: string): boolean {
    return hash.startsWith('bcrypt:');
  }
}

export class FakeTokenIssuer extends TokenIssuer {
  public issued: AccessTokenClaims[] = [];

  issueAccessToken(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    this.issued.push(claims);
    return Promise.resolve({
      token: `access:${claims.userId}:${claims.permissions.join('+')}`,
      expiresInSeconds: 900,
    });
  }

  issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
    const token = `refresh:${userId}:${this.issued.length}`;
    return Promise.resolve({
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    });
  }

  hashRefreshToken(token: string): string {
    return `sha:${token}`;
  }
}

export class FakeOtpSender {
  readonly sent: Array<{ email: string; code: string; purpose: string }> = [];
  send(message: {
    email: string;
    code: string;
    purpose: string;
    ttlSeconds: number;
  }): Promise<void> {
    this.sent.push({ email: message.email, code: message.code, purpose: message.purpose });
    return Promise.resolve();
  }
}

export const fakeEventBus = () => ({
  published: [] as unknown[],
  publish(events: unknown[]) {
    this.published.push(...events);
    return Promise.resolve();
  },
  subscribe() {
    /* noop */
  },
});

export class FakeRoleCatalog extends RoleCatalogPort {
  constructor(private readonly map: Record<string, string[]> = {}) {
    super();
  }
  roleExists(name: string): Promise<boolean> {
    return Promise.resolve(
      name in this.map ||
        ['client', 'consultant', 'apporteur', 'admin', 'superadmin'].includes(name),
    );
  }
  permissionsForRoles(roleNames: string[]): Promise<string[]> {
    const out = new Set<string>();
    for (const r of roleNames) for (const p of this.map[r] ?? []) out.add(p);
    return Promise.resolve([...out]);
  }
}
