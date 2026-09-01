import { ConflictException, ForbiddenException, NotFoundException } from '@shared/kernel';
import { GetUserUseCase } from './get-user.use-case';
import { DeleteUserUseCase } from './delete-user.use-case';
import { InMemoryUserRepository } from '../../testing/in-memory-repos';
import { FakeRoleCatalog } from '../../testing/fakes';
import { buildUser, testClock } from '../../testing/builders';
import { ActorInfo } from '../dto/user.dto';

const admin: ActorInfo = {
  userId: 'admin-1',
  roles: ['superadmin'],
  permissions: ['manage-users'],
};

const seed = async () => {
  const users = new InMemoryUserRepository();
  users.store.set('u1', await buildUser({ id: 'u1', email: 'u1@x.com' }));
  return users;
};

describe('GetUserUseCase', () => {
  it('returns a user for self', async () => {
    const users = await seed();
    const uc = new GetUserUseCase(users, new FakeRoleCatalog());
    const view = await uc.execute({
      actor: { userId: 'u1', roles: ['client'], permissions: [] },
      targetUserId: 'u1',
    });
    expect(view.id).toBe('u1');
  });

  it('forbids a stranger', async () => {
    const users = await seed();
    const uc = new GetUserUseCase(users, new FakeRoleCatalog());
    await expect(
      uc.execute({
        actor: { userId: 'u2', roles: ['client'], permissions: [] },
        targetUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404 on unknown', async () => {
    const users = await seed();
    const uc = new GetUserUseCase(users, new FakeRoleCatalog());
    await expect(uc.execute({ actor: admin, targetUserId: 'zzz' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('DeleteUserUseCase', () => {
  it('soft-deletes a user as admin with manage-users', async () => {
    const users = await seed();
    const uc = new DeleteUserUseCase(users, testClock());
    await uc.execute({ actor: admin, targetUserId: 'u1' });
    expect((await users.findById('u1'))?.isDeleted).toBe(true);
  });

  it('forbids without manage-users', async () => {
    const users = await seed();
    const uc = new DeleteUserUseCase(users, testClock());
    await expect(
      uc.execute({
        actor: { userId: 'a', roles: ['admin'], permissions: [] },
        targetUserId: 'u1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to delete self', async () => {
    const users = await seed();
    users.store.set('admin-1', await buildUser({ id: 'admin-1', email: 'admin@x.com' }));
    const uc = new DeleteUserUseCase(users, testClock());
    await expect(uc.execute({ actor: admin, targetUserId: 'admin-1' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
