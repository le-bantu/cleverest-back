import { ConflictException, ForbiddenException } from '@shared/kernel';
import { RegisterUserUseCase } from './register-user.use-case';
import { InMemoryUserRepository } from '../../testing/in-memory-repos';
import { FakeHasher, fakeEventBus } from '../../testing/fakes';
import { testClock, buildUser } from '../../testing/builders';

const setup = () => {
  const users = new InMemoryUserRepository();
  const bus = fakeEventBus();
  const uc = new RegisterUserUseCase(users, new FakeHasher(), bus as never, testClock());
  return { users, bus, uc };
};

describe('RegisterUserUseCase', () => {
  it('registers a client, hashes the password and emits UserRegistered', async () => {
    const { users, bus, uc } = setup();
    const { userId } = await uc.execute({ email: 'a@x.com', password: 'secret12', role: 'client' });

    const saved = await users.findById(userId);
    expect(saved?.roles).toEqual(['client']);
    expect(saved?.passwordHash).toBe('argon:secret12');
    expect(bus.published).toHaveLength(1);
  });

  it('refuses a non self-assignable role (admin)', async () => {
    const { uc } = setup();
    await expect(
      uc.execute({ email: 'a@x.com', password: 'secret12', role: 'admin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a weak password', async () => {
    const { uc } = setup();
    await expect(
      uc.execute({ email: 'a@x.com', password: 'short', role: 'client' }),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' });
  });

  it('rejects a duplicate email', async () => {
    const { users, uc } = setup();
    users.store.set('x', await buildUser({ id: 'x', email: 'dup@x.com' }));
    await expect(
      uc.execute({ email: 'dup@x.com', password: 'secret12', role: 'client' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
