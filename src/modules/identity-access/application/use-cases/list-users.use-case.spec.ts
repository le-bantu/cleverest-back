import { ListUsersUseCase } from './list-users.use-case';
import { ListAllUsersUseCase } from './list-all-users.use-case';
import { InMemoryUserRepository } from '../../testing/in-memory-repos';
import { FakeRoleCatalog } from '../../testing/fakes';
import { buildUser } from '../../testing/builders';

const seed = async () => {
  const users = new InMemoryUserRepository();
  for (let i = 0; i < 5; i++) {
    users.store.set(
      `c${i}`,
      await buildUser({ id: `c${i}`, email: `c${i}@x.com`, role: 'client' }),
    );
  }
  users.store.set('k1', await buildUser({ id: 'k1', email: 'k1@x.com', role: 'consultant' }));
  return users;
};

describe('ListUsersUseCase', () => {
  it('paginates and reports meta', async () => {
    const users = await seed();
    const uc = new ListUsersUseCase(users, new FakeRoleCatalog({ client: ['view-dashboard'] }));
    const page = await uc.execute({ page: 1, perPage: 3 });
    expect(page.data).toHaveLength(3);
    expect(page.meta).toMatchObject({ total: 6, totalPages: 2 });
    expect(page.data[0].permissions).toBeDefined();
  });

  it('filters by role', async () => {
    const users = await seed();
    const uc = new ListUsersUseCase(users, new FakeRoleCatalog());
    const page = await uc.execute({ page: 1, perPage: 20, role: 'consultant' });
    expect(page.data).toHaveLength(1);
    expect(page.data[0].roles).toEqual(['consultant']);
  });
});

describe('ListAllUsersUseCase', () => {
  it('returns every non-deleted user, filtered by role', async () => {
    const users = await seed();
    const uc = new ListAllUsersUseCase(users, new FakeRoleCatalog());
    expect(await uc.execute({})).toHaveLength(6);
    expect(await uc.execute({ role: 'client' })).toHaveLength(5);
  });
});
