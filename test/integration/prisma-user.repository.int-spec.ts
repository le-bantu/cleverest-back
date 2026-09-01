import { FixedClock } from '../../src/shared/kernel';
import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaUserRepository } from '../../src/modules/identity-access/infrastructure/persistence/prisma-user.repository';
import { Email, PermissionName, RoleName, User } from '../../src/modules/identity-access/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';

const clock = new FixedClock(new Date('2026-01-01T00:00:00.000Z'));

describe('PrismaUserRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaUserRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await seedRbac(getTestPrisma());
  });

  const newConsultant = () =>
    User.createByAdmin(
      {
        id: repo.nextIdentity(),
        email: Email.create('c1@example.com'),
        passwordHash: 'argon:hash',
        roles: [RoleName.CONSULTANT],
      },
      clock,
    );

  it('persists a user with roles + 1-1 profile and reads it back (findById / findByEmail)', async () => {
    const user = newConsultant();
    user.profile?.update({ expertiseDomains: ['tax', 'legal'], validated: true } as never);
    await repo.save(user);

    const byId = await repo.findById(user.id);
    expect(byId?.emailValue).toBe('c1@example.com');
    expect(byId?.roles).toEqual(['consultant']);
    expect(byId?.profile?.toPrimitives()).toMatchObject({
      expertiseDomains: ['tax', 'legal'],
      validated: true,
    });

    const byEmail = await repo.findByEmail('C1@EXAMPLE.COM');
    expect(byEmail?.id).toBe(user.id);
    expect(await repo.existsByEmail('c1@example.com')).toBe(true);
  });

  it('syncs role and direct-permission changes on update', async () => {
    const user = newConsultant();
    await repo.save(user);

    user.setRoles([RoleName.ADMIN]);
    user.setDirectPermissions([PermissionName.VIEW_STATISTICS]);
    await repo.save(user);

    const reloaded = await repo.findById(user.id);
    expect(reloaded?.roles).toEqual(['admin']);
    expect(reloaded?.directPermissions).toEqual(['view-statistics']);
  });

  it('soft delete hides the user from list() and listAll()', async () => {
    const user = newConsultant();
    await repo.save(user);
    user.softDelete(clock);
    await repo.save(user);

    const page = await repo.list({ page: 1, perPage: 10 }, {});
    expect(page.data.find((u) => u.id === user.id)).toBeUndefined();
    expect((await repo.listAll({})).find((u) => u.id === user.id)).toBeUndefined();
  });

  it('list() paginates and filters by role; listAll() filters by expertise', async () => {
    for (let i = 0; i < 3; i++) {
      const u = User.register(
        {
          id: repo.nextIdentity(),
          email: Email.create(`client${i}@example.com`),
          passwordHash: 'argon:h',
          role: RoleName.CLIENT,
        },
        clock,
      );
      await repo.save(u);
    }
    const consultant = newConsultant();
    consultant.profile?.update({ expertiseDomains: ['m&a'] } as never);
    await repo.save(consultant);

    const clientsPage = await repo.list({ page: 1, perPage: 2 }, { role: 'client' });
    expect(clientsPage.data).toHaveLength(2);
    expect(clientsPage.meta.total).toBe(3);

    const byExpertise = await repo.listAll({ expertise: 'm&a' });
    expect(byExpertise.map((u) => u.id)).toEqual([consultant.id]);
  });
});
