import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaDeliverableRepository } from '../../src/modules/deliverables/infrastructure/persistence/prisma-deliverable.repository';
import { Deliverable } from '../../src/modules/deliverables/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';

const NOW = new Date('2026-06-01T10:00:00.000Z');

describe('PrismaDeliverableRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaDeliverableRepository(prisma);
  let client: SeededUser;
  let client2: SeededUser;
  let c1: SeededUser;
  let c2: SeededUser;
  let seq = 0;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    client2 = await createUser(db, 'client2@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant');
    c2 = await createUser(db, 'c2@int.test', 'consultant');
    seq = 0;
  });

  /** an EN_COURS mission for `clientId`, inserted directly */
  const missionFor = async (clientId: string) => {
    const db = getTestPrisma();
    const quote = await db.quote.create({
      data: {
        clientId,
        requestNumber: `req-${String(++seq).padStart(3, '0')}`,
        type: 'CONSULTATION',
        description: 'x',
        status: 'SIGNE_CLIENT',
      },
    });
    const contract = await db.contract.create({
      data: {
        quoteId: quote.id,
        clientId,
        originalFileKey: 'k',
        originalFileName: 'c.pdf',
        originalSize: 1,
        signed: true,
        signedAt: NOW,
        signedFileKey: 's',
        signedFileName: 's.pdf',
        signedSize: 1,
      },
    });
    return db.mission.create({
      data: {
        contractId: contract.id,
        quoteId: quote.id,
        clientId,
        title: 'M',
        status: 'EN_COURS',
      },
    });
  };

  const upload = (mission: { id: string; clientId: string }, consultantId: string, at = NOW) =>
    Deliverable.upload(
      {
        id: repo.nextIdentity(),
        mission: {
          id: mission.id,
          quoteId: 'unused',
          clientId: mission.clientId,
          consultantIds: [consultantId],
          status: 'EN_COURS',
          active: true,
        },
        consultantId,
        engaged: true,
        file: { key: `d/${seq}`, originalName: 'r.pdf', mimeType: 'application/pdf', size: 7 },
      },
      at,
    );

  it('round-trips both validations', async () => {
    const m = await missionFor(client.id);
    const d = upload(m, c1.id);
    await repo.save(d);
    const back = await repo.findById(d.id);
    expect(back).toMatchObject({
      adminValidated: false,
      clientValidated: false,
      clientId: client.id,
    });
    expect(back!.file).toEqual(d.file);

    back!.validateByAdmin(c2.id, NOW);
    back!.validateByClient(client.id, NOW);
    await repo.save(back!);
    expect(await repo.findById(d.id)).toMatchObject({
      adminValidated: true,
      adminValidatedAt: NOW,
      adminValidatedById: c2.id,
      clientValidated: true,
      clientValidatedAt: NOW,
    });
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('the CHECK constraint ties validation flags to their dates', async () => {
    const m = await missionFor(client.id);
    const d = upload(m, c1.id);
    await repo.save(d);
    await expect(
      getTestPrisma().deliverable.update({ where: { id: d.id }, data: { adminValidated: true } }),
    ).rejects.toThrow();
  });

  it('list() filters by role scope (client sees released only), mission, validations, dates', async () => {
    const m1 = await missionFor(client.id);
    const m2 = await missionFor(client2.id);
    const hidden = upload(m1, c1.id, new Date('2026-01-01T00:00:00Z'));
    const released = upload(m1, c2.id);
    released.validateByAdmin(c1.id, NOW);
    const foreign = upload(m2, c1.id);
    for (const d of [hidden, released, foreign]) await repo.save(d);

    const ids = async (f: Parameters<typeof repo.list>[1]) =>
      (await repo.list({ page: 1, perPage: 50 }, f)).data.map((d) => d.id).sort();
    expect(await ids({ clientId: client.id, adminValidated: true })).toEqual([released.id]);
    expect(await ids({ consultantId: c1.id })).toEqual([hidden.id, foreign.id].sort());
    expect(await ids({ missionId: m2.id })).toEqual([foreign.id]);
    expect(await ids({ clientValidated: false })).toHaveLength(3);
    expect(await ids({ uploadedTo: new Date('2026-02-01') })).toEqual([hidden.id]);
    expect(await ids({ uploadedFrom: new Date('2026-02-01') })).toEqual(
      [released.id, foreign.id].sort(),
    );
    const page = await repo.list({ page: 2, perPage: 2, sort: 'uploadedAt:asc' }, {});
    expect(page.meta).toEqual({ page: 2, perPage: 2, total: 3, totalPages: 2 });
    expect((await repo.list({ page: 1, perPage: 5, sort: 'x:asc' }, {})).data).toHaveLength(3);
  });
});
