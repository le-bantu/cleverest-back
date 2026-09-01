import { UnauthorizedException } from '@shared/kernel';
import { RefreshAccessTokenUseCase } from './refresh-access-token.use-case';
import { LogoutUseCase } from './logout.use-case';
import { SessionIssuerService } from '../services/session-issuer.service';
import {
  InMemoryUserRepository,
  InMemoryRefreshTokenRepository,
} from '../../testing/in-memory-repos';
import { FakeRoleCatalog, FakeTokenIssuer } from '../../testing/fakes';
import { buildUser, testClock } from '../../testing/builders';
import { RefreshToken } from '../../domain';

const setup = async () => {
  const users = new InMemoryUserRepository();
  const refresh = new InMemoryRefreshTokenRepository();
  const clock = testClock();
  const issuer = new FakeTokenIssuer();
  const user = await buildUser({ email: 'a@x.com' });
  users.store.set(user.id, user);
  const session = new SessionIssuerService(issuer, new FakeRoleCatalog(), refresh, clock);

  const stored = RefreshToken.issue({
    id: 'rt-1',
    userId: user.id,
    tokenHash: issuer.hashRefreshToken('rawtoken'),
    expiresAt: new Date(clock.now().getTime() + 3600_000),
    clock,
  });
  await refresh.save(stored);

  return { users, refresh, clock, issuer, session, user };
};

describe('RefreshAccessTokenUseCase', () => {
  it('rotates the presented token and issues a new pair', async () => {
    const d = await setup();
    const uc = new RefreshAccessTokenUseCase(d.refresh, d.users, d.issuer, d.clock, d.session);
    const res = await uc.execute({ refreshToken: 'rawtoken' });
    expect(res.accessToken).toContain('access:');
    expect(
      (await d.refresh.findByTokenHash(d.issuer.hashRefreshToken('rawtoken')))?.isRevoked(),
    ).toBe(true);
    expect(d.refresh.store.size).toBe(2);
  });

  it('rejects an unknown refresh token', async () => {
    const d = await setup();
    const uc = new RefreshAccessTokenUseCase(d.refresh, d.users, d.issuer, d.clock, d.session);
    await expect(uc.execute({ refreshToken: 'bogus' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token that was already rotated (reuse)', async () => {
    const d = await setup();
    const uc = new RefreshAccessTokenUseCase(d.refresh, d.users, d.issuer, d.clock, d.session);
    await uc.execute({ refreshToken: 'rawtoken' });
    await expect(uc.execute({ refreshToken: 'rawtoken' })).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
  });
});

describe('LogoutUseCase', () => {
  it('revokes the caller’s refresh token', async () => {
    const d = await setup();
    const uc = new LogoutUseCase(d.refresh, d.issuer, d.clock);
    await uc.execute({ actorUserId: d.user.id, refreshToken: 'rawtoken' });
    expect(
      (await d.refresh.findByTokenHash(d.issuer.hashRefreshToken('rawtoken')))?.isRevoked(),
    ).toBe(true);
  });

  it('is a no-op for an unknown token', async () => {
    const d = await setup();
    const uc = new LogoutUseCase(d.refresh, d.issuer, d.clock);
    await expect(
      uc.execute({ actorUserId: d.user.id, refreshToken: 'nope' }),
    ).resolves.toBeUndefined();
  });

  it('does not revoke a token owned by someone else', async () => {
    const d = await setup();
    const uc = new LogoutUseCase(d.refresh, d.issuer, d.clock);
    await uc.execute({ actorUserId: 'someone-else', refreshToken: 'rawtoken' });
    expect(
      (await d.refresh.findByTokenHash(d.issuer.hashRefreshToken('rawtoken')))?.isRevoked(),
    ).toBe(false);
  });
});
