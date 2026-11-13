import { PrismaService } from '../../src/shared/infrastructure/database/prisma.service';
import { PrismaUnitOfWork } from '../../src/shared/infrastructure/database/prisma-unit-of-work';
import { PrismaMissionRepository } from '../../src/modules/missions/infrastructure/persistence/prisma-mission.repository';
import { PrismaConsultantWorkloadAdapter } from '../../src/modules/quotes/infrastructure/adapters/prisma-consultant-workload.adapter';
import { Mission, MissionStatus, MissionTaskStatus } from '../../src/modules/missions/domain';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';

const NOW = new Date('2026-05-01T08:00:00.000Z');

describe('PrismaMissionRepository (integration)', () => {
  const prisma = new PrismaService();
  const repo = new PrismaMissionRepository(prisma);
  const uow = new PrismaUnitOfWork(prisma);
  let client: SeededUser;
  let c1: SeededUser;
  let c2: SeededUser;
  let contract: { id: string; quoteId: string };
  let seq = 0;

  beforeAll(() => prisma.$connect());
  afterAll(() => prisma.$disconnect());

  /** a signed contract on a signed quote, inserted directly */
  const signedContract = async (clientId: string) => {
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
    return db.contract.create({
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
  };

  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    client = await createUser(db, 'client@int.test', 'client');
    c1 = await createUser(db, 'c1@int.test', 'consultant');
    c2 = await createUser(db, 'c2@int.test', 'consultant');
    seq = 0;
    contract = await signedContract(client.id);
  });

  const make = (title = 'Audit', deliveryDate: Date | null = null, c = contract) =>
    Mission.create(
      {
        id: repo.nextIdentity(),
        contract: { id: c.id, quoteId: c.quoteId, clientId: client.id, signed: true },
        title,
        deliveryDate,
        contractFile: { key: 'missions/x.pdf', originalName: 'm.pdf', mimeType: null, size: 3 },
        createdById: c1.id,
      },
      NOW,
    );

  it('persists the whole aggregate (accented status, team with lead, ordered tasks)', async () => {
    const m = make();
    m.assignConsultants(
      [
        { consultantId: c1.id, isLead: true },
        { consultantId: c2.id, isLead: false },
      ],
      null,
      c1.id,
      NOW,
    );
    m.respondToAssignment(c1.id, true, NOW);
    const ids = ['a', 'b', 'c'].map(() => repo.nextIdentity());
    ids.forEach((id, i) =>
      m.addTask(c1.id, { id, title: `T${i}`, assigneeConsultantId: c2.id }, NOW),
    );
    m.updateTask(c2.id, ids[0], { status: MissionTaskStatus.FAITE }, NOW);
    m.updateTask(c2.id, ids[1], { status: MissionTaskStatus.FAITE }, NOW);
    m.updateProgress(c1.id, { status: MissionStatus.EN_VALIDATION }, NOW);
    await repo.save(m);
    expect(await repo.idsForConsultant(c2.id)).toEqual([m.id]);

    const raw = await getTestPrisma().$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM missions`;
    expect(raw[0].status).toBe('EN_VALIDATION');

    const back = await repo.findById(m.id);
    expect(back).toMatchObject({
      status: MissionStatus.EN_VALIDATION,
      progress: 67,
      leadConsultantId: c1.id,
      quoteId: contract.quoteId,
      clientId: client.id,
    });
    expect(back!.contractFile).toEqual(m.contractFile);
    expect(back!.tasks.map((t) => [t.id, t.order, t.status])).toEqual([
      [ids[0], 1, 'FAITE'],
      [ids[1], 2, 'FAITE'],
      [ids[2], 3, 'A_FAIRE'],
    ]);

    // TERMINÉE round-trips with its accent
    back!.updateTask(c1.id, ids[2], { status: MissionTaskStatus.FAITE }, NOW);
    back!.updateProgress(c1.id, { status: MissionStatus.TERMINEE }, NOW);
    await repo.save(back!);
    expect((await repo.findById(m.id))!.status).toBe(MissionStatus.TERMINEE);
    expect(await repo.findById('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('reorder, delete and lead switch are synced (orders stay contiguous)', async () => {
    const m = make();
    m.assignConsultants([{ consultantId: c1.id, isLead: true }], null, c1.id, NOW);
    const [a, b, c] = ['A', 'B', 'C'].map((title) =>
      m.addTask(c1.id, { id: repo.nextIdentity(), title }, NOW),
    );
    await repo.save(m);

    m.reorderTasks(c1.id, [c.id, a.id, b.id], NOW);
    m.deleteTask(c1.id, a.id, NOW);
    m.assignConsultants(
      [
        { consultantId: c1.id, isLead: false },
        { consultantId: c2.id, isLead: true },
      ],
      null,
      c1.id,
      NOW,
    );
    await repo.save(m);
    const back = await repo.findById(m.id);
    expect(back!.tasks.map((t) => [t.title, t.order])).toEqual([
      ['C', 1],
      ['B', 2],
    ]);
    expect(back!.leadConsultantId).toBe(c2.id);
    expect(await getTestPrisma().missionTask.count()).toBe(2);
  });

  it('the database enforces one lead per mission and 0-100 progress', async () => {
    const m = make();
    await repo.save(m);
    const db = getTestPrisma();
    await db.missionConsultant.create({
      data: { missionId: m.id, consultantId: c1.id, isLead: true },
    });
    await expect(
      db.missionConsultant.create({ data: { missionId: m.id, consultantId: c2.id, isLead: true } }),
    ).rejects.toThrow();
    await expect(
      db.mission.update({ where: { id: m.id }, data: { progress: 120 } }),
    ).rejects.toThrow();
  });

  it('rolls back with the unit of work', async () => {
    const m = make();
    await expect(
      uow.run(async (tx) => {
        await repo.save(m, tx);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await repo.findById(m.id)).toBeNull();
  });

  it('list() filters and paginates; workload counts open missions', async () => {
    const other = await signedContract(client.id);
    const a = make('Audit fiscal', new Date('2026-06-01'));
    a.assignConsultants([{ consultantId: c1.id, isLead: true }], null, c1.id, NOW);
    const b = make('Paie', new Date('2026-09-01'), other);
    b.assignConsultants([{ consultantId: c2.id, isLead: true }], null, c1.id, NOW);
    b.respondToAssignment(c2.id, false, NOW); // REJETÉE: not open
    const c = make('Audit social');
    for (const m of [a, b, c]) await repo.save(m);

    const ids = async (f: Parameters<typeof repo.list>[1]) =>
      (await repo.list({ page: 1, perPage: 50 }, f)).data.map((m) => m.id).sort();
    expect(await ids({})).toHaveLength(3);
    expect(await ids({ clientId: client.id })).toHaveLength(3);
    expect(await ids({ consultantId: c1.id })).toEqual([a.id]);
    expect(await ids({ status: MissionStatus.REJETEE })).toEqual([b.id]);
    expect(await ids({ title: 'AUDIT' })).toEqual([a.id, c.id].sort());
    expect(await ids({ contractId: other.id })).toEqual([b.id]);
    expect(await ids({ deliveryDateFrom: new Date('2026-07-01') })).toEqual([b.id]);
    expect(await ids({ deliveryDateTo: new Date('2026-07-01') })).toEqual([a.id]);
    const page = await repo.list({ page: 2, perPage: 2, sort: 'title:asc' }, {});
    expect(page.meta.total).toBe(3);
    expect(page.data.map((m) => m.title)).toEqual(['Paie']);
    expect((await repo.list({ page: 1, perPage: 5, sort: 'x:asc' }, {})).data).toHaveLength(3);

    const load = await new PrismaConsultantWorkloadAdapter(prisma).currentLoad([c1.id, c2.id]);
    expect(load.get(c1.id)).toBe(1);
    expect(load.has(c2.id)).toBe(false);
  });
});
