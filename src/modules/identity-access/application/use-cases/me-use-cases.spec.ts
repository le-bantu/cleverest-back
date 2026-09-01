import { NotFoundException } from '@shared/kernel';
import { GetCurrentUserUseCase } from './get-current-user.use-case';
import { UpdateOwnProfileUseCase } from './update-own-profile.use-case';
import { DeactivateOwnAccountUseCase } from './deactivate-own-account.use-case';
import { ToggleTwoFactorUseCase } from './toggle-two-factor.use-case';
import {
  InMemoryUserRepository,
  InMemoryRefreshTokenRepository,
} from '../../testing/in-memory-repos';
import { FakeHasher, FakeRoleCatalog, fakeEventBus } from '../../testing/fakes';
import { buildUser } from '../../testing/builders';
import { RefreshToken } from '../../domain';

const seed = async () => {
  const users = new InMemoryUserRepository();
  const user = await buildUser({ id: 'me-1', email: 'me@x.com', role: 'consultant' });
  users.store.set(user.id, user);
  return { users, user };
};

describe('GetCurrentUserUseCase', () => {
  it('returns the user view with expanded permissions', async () => {
    const { users } = await seed();
    const uc = new GetCurrentUserUseCase(
      users,
      new FakeRoleCatalog({ consultant: ['view-dashboard'] }),
    );
    const view = await uc.execute({ userId: 'me-1' });
    expect(view.permissions).toEqual(['view-dashboard']);
    expect(view.profile?.kind).toBe('consultant');
  });

  it('404 when the user is gone', async () => {
    const { users } = await seed();
    const uc = new GetCurrentUserUseCase(users, new FakeRoleCatalog());
    await expect(uc.execute({ userId: 'ghost' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UpdateOwnProfileUseCase', () => {
  it('updates email, password and profile fields', async () => {
    const { users } = await seed();
    const uc = new UpdateOwnProfileUseCase(users, new FakeHasher(), new FakeRoleCatalog());
    const view = await uc.execute({
      userId: 'me-1',
      email: 'renamed@x.com',
      password: 'newpass12',
      profile: { firstName: 'Ada' },
    });
    expect(view.email).toBe('renamed@x.com');
    expect((await users.findById('me-1'))?.passwordHash).toBe('argon:newpass12');
    expect(view.profile?.data).toMatchObject({ firstName: 'Ada' });
  });

  it('rejects taking another user’s email', async () => {
    const { users } = await seed();
    users.store.set('other', await buildUser({ id: 'other', email: 'taken@x.com' }));
    const uc = new UpdateOwnProfileUseCase(users, new FakeHasher(), new FakeRoleCatalog());
    await expect(uc.execute({ userId: 'me-1', email: 'taken@x.com' })).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_USED',
    });
  });
});

describe('DeactivateOwnAccountUseCase', () => {
  it('deactivates and revokes all refresh tokens', async () => {
    const { users, user } = await seed();
    const refresh = new InMemoryRefreshTokenRepository();
    await refresh.save(
      RefreshToken.issue({
        id: 'r1',
        userId: user.id,
        tokenHash: 'h',
        expiresAt: new Date(Date.now() + 1000),
        clock: { now: () => new Date() },
      }),
    );
    const uc = new DeactivateOwnAccountUseCase(users, refresh);
    await uc.execute({ userId: 'me-1' });
    expect((await users.findById('me-1'))?.isActive).toBe(false);
    expect((await refresh.findByTokenHash('h'))?.isRevoked()).toBe(true);
  });
});

describe('ToggleTwoFactorUseCase', () => {
  it('enables 2FA and publishes the event', async () => {
    const { users } = await seed();
    const bus = fakeEventBus();
    const uc = new ToggleTwoFactorUseCase(users, bus as never);
    const res = await uc.execute({ userId: 'me-1', enabled: true });
    expect(res.twoFactorEnabled).toBe(true);
    expect(bus.published).toHaveLength(1);
  });

  it('is a no-op (no event) when the value does not change', async () => {
    const { users } = await seed();
    const bus = fakeEventBus();
    const uc = new ToggleTwoFactorUseCase(users, bus as never);
    await uc.execute({ userId: 'me-1', enabled: false });
    expect(bus.published).toHaveLength(0);
  });
});
