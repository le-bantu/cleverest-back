import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import {
  OtpChallenge,
  OtpChallengeRepository,
  RefreshToken,
  RefreshTokenRepository,
  User,
  UserListFilter,
  UserRepository,
} from '../domain';

export class InMemoryUserRepository extends UserRepository {
  readonly store = new Map<string, User>();

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  findByEmail(email: string): Promise<User | null> {
    const found = [...this.store.values()].find(
      (u) => u.emailValue?.toLowerCase() === email.toLowerCase(),
    );
    return Promise.resolve(found ?? null);
  }
  existsByEmail(email: string): Promise<boolean> {
    return this.findByEmail(email).then((u) => u !== null);
  }
  save(user: User): Promise<void> {
    this.store.set(user.id, user);
    return Promise.resolve();
  }
  list(query: PageQuery, filter: UserListFilter): Promise<Page<User>> {
    const { page, perPage } = normalizePageQuery(query);
    let items = [...this.store.values()].filter((u) => !u.isDeleted);
    if (filter.role) items = items.filter((u) => u.roles.includes(filter.role as never));
    if (filter.search)
      items = items.filter((u) => (u.emailValue ?? '').includes(filter.search as string));
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
  listAll(filter: UserListFilter): Promise<User[]> {
    let items = [...this.store.values()].filter((u) => !u.isDeleted);
    if (filter.role) items = items.filter((u) => u.roles.includes(filter.role as never));
    return Promise.resolve(items);
  }
}

export class InMemoryOtpChallengeRepository extends OtpChallengeRepository {
  readonly store = new Map<string, OtpChallenge>();

  nextIdentity(): string {
    return generateUuid();
  }
  save(challenge: OtpChallenge): Promise<void> {
    this.store.set(challenge.id, challenge);
    return Promise.resolve();
  }
  findById(id: string): Promise<OtpChallenge | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  findLatestPending(userId: string, purpose: string): Promise<OtpChallenge | null> {
    const found = [...this.store.values()]
      .filter((c) => c.userId === userId && c.purpose === purpose && !c.isConsumed())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return Promise.resolve(found ?? null);
  }
}

export class InMemoryRefreshTokenRepository extends RefreshTokenRepository {
  readonly store = new Map<string, RefreshToken>();

  nextIdentity(): string {
    return generateUuid();
  }
  save(token: RefreshToken): Promise<void> {
    this.store.set(token.id, token);
    return Promise.resolve();
  }
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const found = [...this.store.values()].find((t) => t.tokenHash === tokenHash);
    return Promise.resolve(found ?? null);
  }
  revokeAllForUser(userId: string): Promise<void> {
    for (const token of this.store.values()) {
      if (token.userId === userId && !token.isRevoked()) {
        token.revoke({ now: () => new Date() });
      }
    }
    return Promise.resolve();
  }
}

export const fakeConfig = (
  values: Record<string, unknown> = {},
): { get: (key: string) => unknown } => ({
  get: (key: string) =>
    ({
      OTP_TTL_SECONDS: 300,
      OTP_MAX_ATTEMPTS: 5,
      OTP_RESEND_COOLDOWN_SECONDS: 60,
      ...values,
    })[key],
});
