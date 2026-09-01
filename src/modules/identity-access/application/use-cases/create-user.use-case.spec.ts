import { ConflictException, ForbiddenException } from '@shared/kernel';
import { CreateUserUseCase } from './create-user.use-case';
import { InMemoryUserRepository } from '../../testing/in-memory-repos';
import { FakeHasher, fakeEventBus } from '../../testing/fakes';
import { testClock } from '../../testing/builders';
import { ActorInfo } from '../dto/user.dto';

const setup = () => {
  const users = new InMemoryUserRepository();
  const bus = fakeEventBus();
  const uc = new CreateUserUseCase(users, new FakeHasher(), bus as never, testClock());
  return { users, uc };
};

const actor = (over: Partial<ActorInfo> = {}): ActorInfo => ({
  userId: 'admin-1',
  roles: ['admin'],
  permissions: ['manage-users', 'create-user'],
  ...over,
});

describe('CreateUserUseCase', () => {
  it('creates a consultant when the actor has manage-users/create-user', async () => {
    const { users, uc } = setup();
    const { userId } = await uc.execute({
      actor: actor(),
      email: 'c@x.com',
      password: 'secret12',
      roles: ['consultant'],
      profile: { expertiseDomains: ['tax'] },
    });
    const saved = await users.findById(userId);
    expect(saved?.roles).toEqual(['consultant']);
    expect(saved?.profile?.toPrimitives()).toMatchObject({ expertiseDomains: ['tax'] });
  });

  it('forbids a non-admin actor', async () => {
    const { uc } = setup();
    await expect(
      uc.execute({
        actor: actor({ roles: ['client'], permissions: [] }),
        email: 'c@x.com',
        password: 'secret12',
        roles: ['consultant'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires create-admin to create an admin user', async () => {
    const { uc } = setup();
    await expect(
      uc.execute({
        actor: actor({ permissions: ['manage-users', 'create-user'] }),
        email: 'a@x.com',
        password: 'secret12',
        roles: ['admin'],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('create-admin') });
  });

  it('allows a superadmin with create-admin to create an admin', async () => {
    const { users, uc } = setup();
    const { userId } = await uc.execute({
      actor: actor({ roles: ['superadmin'], permissions: ['manage-users', 'create-admin'] }),
      email: 'a@x.com',
      password: 'secret12',
      roles: ['admin'],
    });
    expect((await users.findById(userId))?.roles).toEqual(['admin']);
  });

  it('rejects a duplicate email', async () => {
    const { uc } = setup();
    await uc.execute({ actor: actor(), email: 'c@x.com', password: 'secret12', roles: ['client'] });
    await expect(
      uc.execute({ actor: actor(), email: 'c@x.com', password: 'secret12', roles: ['client'] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
