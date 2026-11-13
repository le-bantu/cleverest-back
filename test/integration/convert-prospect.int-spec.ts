import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import {
  FILE_STORAGE,
  FileStoragePort,
} from '../../src/shared/application/ports/file-storage.port';
import { ConvertProspectUseCase } from '../../src/modules/apporteurs/application';
import {
  Commission,
  CommissionStatus,
  Prospect,
  ProspectStatus,
} from '../../src/modules/apporteurs/domain';
import {
  PrismaCommissionRepository,
  PrismaProspectRepository,
} from '../../src/modules/apporteurs/infrastructure/persistence/prisma-apporteur.repositories';
import { PrismaMissionRepository } from '../../src/modules/missions/infrastructure/persistence/prisma-mission.repository';
import { getTestPrisma } from '../utils/test-db';
import { seedRbac } from '../fixtures/seed-rbac';
import { createUser, SeededUser } from '../fixtures/quotes';
import { insertMission } from '../fixtures/missions';

const NOW = new Date('2026-09-01T10:00:00.000Z');
const LATER = new Date('2026-09-02T10:00:00.000Z');
const file = (name: string, content = '%PDF-1.4 x') => ({
  buffer: Buffer.from(content),
  originalName: name,
  mimeType: null,
  size: Buffer.byteLength(content),
});

describe('apporteurs persistence + ConvertProspect transaction (integration)', () => {
  let app: INestApplication;
  let prospects: PrismaProspectRepository;
  let commissions: PrismaCommissionRepository;
  let convert: ConvertProspectUseCase;
  let storage: FileStoragePort;
  let apporteur: SeededUser;
  let admin: SeededUser;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prospects = app.get(PrismaProspectRepository);
    commissions = app.get(PrismaCommissionRepository);
    convert = app.get(ConvertProspectUseCase);
    storage = app.get(FILE_STORAGE);
  });
  afterAll(() => app.close());
  beforeEach(async () => {
    const db = getTestPrisma();
    await seedRbac(db);
    apporteur = await createUser(db, 'app@int.test', 'apporteur');
    admin = await createUser(db, 'admin@int.test', 'superadmin');
  });

  const pending = async (email: string | null = 'jean@acme.test') => {
    const p = Prospect.create(
      {
        id: prospects.nextIdentity(),
        apporteurId: apporteur.id,
        name: 'Jean Dupont',
        company: 'ACME SAS',
        contactEmail: email,
      },
      NOW,
    );
    await prospects.save(p);
    return p;
  };

  const input = (prospectId: string) => ({
    actor: { userId: admin.id, roles: ['superadmin'], permissions: ['manage-users'] },
    prospectId,
    quoteTitle: 'Audit fiscal',
    price: 5000,
    missionTitle: 'Mission audit',
    commissionAmount: 250,
    signedContract: file('contrat-signe.pdf'),
    contractMission: file('mission.pdf'),
  });

  it('prospect repository: round-trip, accented status, filters', async () => {
    const a = await pending();
    const b = await pending(null);
    b.reject(admin.id, 'hors cible', LATER);
    await prospects.save(b);
    const raw = await getTestPrisma().$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM prospects WHERE id = ${b.id}::uuid`;
    expect(raw[0].status).toBe('REJETÉ');
    expect(await prospects.findById(b.id)).toMatchObject({
      status: ProspectStatus.REJETE,
      rejectedReason: 'hors cible',
      processedById: admin.id,
    });
    a.attachDocument(
      apporteur.id,
      { key: 'k', originalName: 'kbis.pdf', mimeType: null, size: 2 },
      LATER,
    );
    await prospects.save(a);
    expect((await prospects.findById(a.id))!.document?.originalName).toBe('kbis.pdf');
    const ids = async (f: Parameters<typeof prospects.list>[1], sort?: string) =>
      (await prospects.list({ page: 1, perPage: 10, sort }, f)).data.map((p) => p.id);
    expect(await ids({ status: ProspectStatus.REJETE })).toEqual([b.id]);
    expect((await ids({ apporteurId: apporteur.id })).sort()).toEqual([a.id, b.id].sort());
    expect(await ids({}, 'hack:asc')).toHaveLength(2);
    expect(await prospects.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('commission repository: round-trip with null amount, status mapping, filters; DB CHECKs', async () => {
    const db = getTestPrisma();
    const client = await createUser(db, 'client@int.test', 'client');
    const mission = await insertMission(db, client.id);
    const p = await pending();
    p.convert(admin.id, { clientId: client.id, missionId: mission.id }, NOW);
    await prospects.save(p);
    const c = Commission.createForConversion(
      {
        id: commissions.nextIdentity(),
        apporteurId: apporteur.id,
        prospectId: p.id,
        clientId: client.id,
        missionId: mission.id,
        clientName: 'ACME',
        missionTitle: 'M',
        actorId: admin.id,
      },
      NOW,
    );
    await commissions.save(c);
    expect(await commissions.findById(c.id)).toMatchObject({
      amount: null,
      status: CommissionStatus.EN_ATTENTE,
    });
    c.setAmount(120.5, LATER);
    c.updateStatus(CommissionStatus.VALIDEE, admin.id, LATER);
    await commissions.save(c);
    expect(await commissions.findById(c.id)).toMatchObject({
      amount: 120.5,
      status: CommissionStatus.VALIDEE,
      validatedAt: LATER,
    });
    const ids = async (f: Parameters<typeof commissions.list>[1]) =>
      (await commissions.list({ page: 1, perPage: 10, sort: 'amount:asc' }, f)).data.map(
        (x) => x.id,
      );
    expect(await ids({ status: CommissionStatus.VALIDEE })).toEqual([c.id]);
    expect(await ids({ status: CommissionStatus.PAYEE })).toEqual([]);
    expect(await ids({ apporteurId: apporteur.id, missionId: mission.id })).toEqual([c.id]);
    expect(await commissions.findById('00000000-0000-0000-0000-000000000000')).toBeNull();

    // VALIDÉE without amount / CONVERTI without client are refused by the database
    await expect(
      db.$executeRaw`UPDATE commissions SET amount = NULL WHERE id = ${c.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE prospects SET "clientId" = NULL WHERE id = ${p.id}::uuid`,
    ).rejects.toThrow();
  });

  it('converts in one transaction with the real modules: user, quote, contract, mission, commission', async () => {
    const p = await pending();
    const result = await convert.execute(input(p.id));
    const db = getTestPrisma();
    const user = await db.user.findUniqueOrThrow({
      where: { id: result.clientId },
      include: { roles: { include: { role: true } }, clientProfile: true },
    });
    expect(user.email).toBe('jean@acme.test');
    expect(user.roles.map((r) => r.role.name)).toEqual(['client']);
    expect(user.clientProfile?.name).toBe('ACME SAS');
    const quote = await db.quote.findUniqueOrThrow({ where: { id: result.quoteId } });
    expect(quote).toMatchObject({
      clientId: result.clientId,
      status: 'SIGNE_CLIENT',
      title: 'Audit fiscal',
    });
    expect(quote.price?.toNumber()).toBe(5000);
    const contract = await db.contract.findUniqueOrThrow({ where: { id: result.contractId } });
    expect(contract).toMatchObject({ quoteId: quote.id, clientId: result.clientId, signed: true });
    const mission = await db.mission.findUniqueOrThrow({ where: { id: result.missionId } });
    expect(mission).toMatchObject({
      contractId: contract.id,
      quoteId: quote.id,
      title: 'Mission audit',
    });
    expect(await commissions.findById(result.commissionId)).toMatchObject({
      amount: 250,
      missionId: mission.id,
      status: CommissionStatus.EN_ATTENTE,
    });
    expect(await prospects.findById(p.id)).toMatchObject({
      status: ProspectStatus.CONVERTI,
      clientId: result.clientId,
      missionId: mission.id,
    });
    expect(await storage.exists(contract.signedFileKey!)).toBe(true);
    // audit rows written after commit, by each context
    const entities = (await db.auditLog.findMany({ select: { entity: true } })).map(
      (r) => r.entity,
    );
    expect(new Set(entities)).toEqual(
      new Set(['Quote', 'Contract', 'Mission', 'Commission', 'Prospect']),
    );

    // a second prospect with the same email reuses the client account
    const again = await convert.execute(input((await pending()).id));
    expect(again).toMatchObject({ clientId: result.clientId, clientCreated: false });
  });

  it('ROLLBACK: if the mission insert fails, nothing exists — no user, quote, contract, commission, files', async () => {
    const p = await pending('rollback@acme.test');
    const missions = app.get(PrismaMissionRepository);
    const spy = jest
      .spyOn(missions, 'save')
      .mockRejectedValueOnce(new Error('mission insert failed'));
    await expect(convert.execute(input(p.id))).rejects.toThrow('mission insert failed');
    spy.mockRestore();

    const db = getTestPrisma();
    expect(await db.user.count({ where: { email: 'rollback@acme.test' } })).toBe(0);
    expect(await db.quote.count()).toBe(0);
    expect(await db.contract.count()).toBe(0);
    expect(await db.mission.count()).toBe(0);
    expect(await db.commission.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
    expect((await prospects.findById(p.id))!.status).toBe(ProspectStatus.EN_ATTENTE);
    expect(await storage.exists(`conversions/${p.id}/contrat-signe.pdf`)).toBe(false);
    expect(await storage.exists(`conversions/${p.id}/contrat-mission.pdf`)).toBe(false);

    // and the conversion can then be retried successfully
    const ok = await convert.execute(input(p.id));
    expect(ok.prospect.status).toBe('CONVERTI');
  });

  it('refuses an email that belongs to a non-client account (409) without writing anything', async () => {
    await createUser(getTestPrisma(), 'jean@acme.test', 'consultant');
    const p = await pending();
    await expect(convert.execute(input(p.id))).rejects.toMatchObject({
      code: 'EMAIL_USED_BY_NON_CLIENT',
      httpStatus: 409,
    });
    expect(await getTestPrisma().quote.count()).toBe(0);
  });
});
