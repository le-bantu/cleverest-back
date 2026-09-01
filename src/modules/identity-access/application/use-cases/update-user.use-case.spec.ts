import { ForbiddenException, NotFoundException } from '@shared/kernel';
import { UpdateUserUseCase } from './update-user.use-case';
import { InMemoryUserRepository } from '../../testing/in-memory-repos';
import { FakeHasher, FakeRoleCatalog } from '../../testing/fakes';
import { buildUser } from '../../testing/builders';
import { ActorInfo } from '../dto/user.dto';

const setup = async () => {
  const users = new InMemoryUserRepository();
  const target = await buildUser({ id: 'target-1', email: 'target@x.com', role: 'consultant' });
  users.store.set(target.id, target);
  const uc = new UpdateUserUseCase(users, new FakeHasher(), new FakeRoleCatalog());
  return { users, uc, target };
};

const admin: ActorInfo = { userId: 'admin-1', roles: ['admin'], permissions: ['manage-users'] };

describe('UpdateUserUseCase', () => {
  it('lets the owner update their own email/phone', async () => {
    const { uc } = await setup();
    const view = await uc.execute({
      actor: { userId: 'target-1', roles: ['consultant'], permissions: [] },
      targetUserId: 'target-1',
      email: 'renamed@x.com',
      phone: '+33100000000',
    });
    expect(view.email).toBe('renamed@x.com');
    expect(view.phone).toBe('+33100000000');
  });

  it('forbids a stranger from updating someone else', async () => {
    const { uc } = await setup();
    await expect(
      uc.execute({
        actor: { userId: 'other', roles: ['client'], permissions: [] },
        targetUserId: 'target-1',
        phone: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin with manage-users change non-admin roles', async () => {
    const { uc } = await setup();
    const view = await uc.execute({ actor: admin, targetUserId: 'target-1', roles: ['client'] });
    expect(view.roles).toEqual(['client']);
  });

  it('requires create-admin to promote to admin', async () => {
    const { uc } = await setup();
    await expect(
      uc.execute({ actor: admin, targetUserId: 'target-1', roles: ['admin'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404 on an unknown target', async () => {
    const { uc } = await setup();
    await expect(
      uc.execute({ actor: admin, targetUserId: 'nope', phone: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
