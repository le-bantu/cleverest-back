import { FakeEventBus } from '@shared/testing/fakes';
import { RoleName } from '../domain';
import { buildUser, testClock } from '../testing/builders';
import { FakeHasher } from '../testing/fakes';
import { InMemoryUserRepository } from '../testing/in-memory-repos';
import { IdentityFacade } from './identity.facade';

describe('IdentityFacade.prepareClientAccount', () => {
  const setup = () => {
    const users = new InMemoryUserRepository();
    const bus = new FakeEventBus();
    const facade = new IdentityFacade(users, new FakeHasher(), bus, testClock());
    return { users, bus, facade };
  };

  it('prepares a new client (temporary password, profile name) written only on persist', async () => {
    const { users, bus, facade } = setup();
    const prepared = await facade.prepareClientAccount({
      email: 'Contact@ACME.test',
      name: 'ACME SAS',
      phone: '0600',
    });
    expect(prepared).toMatchObject({ created: true, email: 'contact@acme.test' });
    expect(prepared.temporaryPassword).toMatch(/^[\w-]{16}$/);
    expect(users.store.size).toBe(0);

    await prepared.persist({ tx: true });
    const user = users.store.get(prepared.clientId)!;
    expect(user.roles).toEqual([RoleName.CLIENT]);
    expect(user.passwordHash).toBe(`argon:${prepared.temporaryPassword}`);
    expect(user.phone).toBe('0600');
    expect((user.profile?.toPrimitives() as { name: string }).name).toBe('ACME SAS');
    await prepared.finalize();
    expect(bus.names()).toEqual(['identity.user-registered']);
  });

  it('reuses an existing client account; refuses an email held by a non-client (409)', async () => {
    const { users, facade } = setup();
    const client = await buildUser({ email: 'client@acme.test', role: RoleName.CLIENT });
    const consultant = await buildUser({ email: 'c@acme.test', role: RoleName.CONSULTANT });
    for (const u of [client, consultant]) users.store.set(u.id, u);

    const reused = await facade.prepareClientAccount({ email: 'client@acme.test', name: 'x' });
    expect(reused).toMatchObject({ clientId: client.id, created: false, temporaryPassword: null });
    await reused.persist(undefined);
    await reused.finalize();

    await expect(
      facade.prepareClientAccount({ email: 'c@acme.test', name: 'x' }),
    ).rejects.toMatchObject({ code: 'EMAIL_USED_BY_NON_CLIENT', httpStatus: 409 });
    await expect(
      facade.prepareClientAccount({ email: 'not-an-email', name: 'x' }),
    ).rejects.toMatchObject({ httpStatus: 422 });
  });
});
