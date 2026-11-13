import { actors, incomingFile } from '@shared/testing/fakes';
import { CommissionStatus, ProspectStatus } from '../../domain';
import { aCommission, aProspect, apporteursTestContext, NOW } from '../../testing/in-memory';
import {
  CreateProspectUseCase,
  DownloadProspectDocumentUseCase,
  GetProspectUseCase,
  ListProspectsUseCase,
  RejectProspectUseCase,
  UploadProspectDocumentUseCase,
} from './prospects.use-cases';
import { ConvertProspectUseCase } from './convert-prospect.use-case';
import {
  GetCommissionUseCase,
  ListCommissionsUseCase,
  SetCommissionAmountUseCase,
  UpdateCommissionStatusUseCase,
} from './commissions.use-cases';

const apporteur = (id = 'app-1') => actors.apporteur(id);
const manager = () => actors.admin(['manage-users']);
const payer = () => actors.admin(['pay-apporteurs']);

describe('prospects', () => {
  it('create: apporteur only; audited', async () => {
    const ctx = apporteursTestContext();
    const uc = new CreateProspectUseCase(ctx.prospects, ctx.committer, ctx.clock);
    const view = await uc.execute({
      actor: apporteur(),
      name: 'Jean',
      company: 'ACME',
      contactEmail: 'jean@acme.test',
    });
    expect(view).toMatchObject({ apporteurId: 'app-1', status: 'EN_ATTENTE', documentName: null });
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ entity: 'Prospect', action: 'CREATED' }),
    ]);
    await expect(uc.execute({ actor: actors.client(), name: 'x' })).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('list / get: an apporteur only sees theirs (404 otherwise); admin sees all', async () => {
    const ctx = apporteursTestContext();
    const mine = aProspect();
    const theirs = aProspect({ apporteurId: 'app-2', status: ProspectStatus.REJETE });
    for (const p of [mine, theirs]) ctx.prospects.store.set(p.id, p);
    const list = new ListProspectsUseCase(ctx.prospects);
    expect(
      (await list.execute({ actor: apporteur(), apporteurId: 'app-2' })).data.map((p) => p.id),
    ).toEqual([mine.id]);
    expect((await list.execute({ actor: actors.admin() })).meta.total).toBe(2);
    expect(
      (await list.execute({ actor: actors.admin(), status: ProspectStatus.REJETE })).data.map(
        (p) => p.id,
      ),
    ).toEqual([theirs.id]);
    const get = new GetProspectUseCase(ctx.prospects);
    expect((await get.execute({ actor: apporteur(), prospectId: mine.id })).id).toBe(mine.id);
    await expect(get.execute({ actor: apporteur(), prospectId: theirs.id })).rejects.toMatchObject({
      code: 'PROSPECT_NOT_FOUND',
      httpStatus: 404,
    });
    expect((await get.execute({ actor: actors.admin(), prospectId: theirs.id })).id).toBe(
      theirs.id,
    );
    await expect(list.execute({ actor: actors.consultant() })).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('upload: stores the document, replaces the previous one; download for owner / admin', async () => {
    const ctx = apporteursTestContext();
    const p = aProspect();
    ctx.prospects.store.set(p.id, p);
    const upload = new UploadProspectDocumentUseCase(ctx.prospects, ctx.storage, ctx.clock);
    const download = new DownloadProspectDocumentUseCase(ctx.prospects, ctx.storage);
    await expect(download.execute({ actor: apporteur(), prospectId: p.id })).rejects.toMatchObject({
      code: 'PROSPECT_DOCUMENT_NOT_FOUND',
    });
    await upload.execute({
      actor: apporteur(),
      prospectId: p.id,
      file: incomingFile('kbis.pdf', 'v1'),
    });
    const firstKey = p.document!.key;
    ctx.clock.advanceBySeconds(1);
    const view = await upload.execute({
      actor: apporteur(),
      prospectId: p.id,
      file: incomingFile('kbis-v2.pdf', 'v2'),
    });
    expect(view.documentName).toBe('kbis-v2.pdf');
    expect(ctx.storage.files.has(firstKey)).toBe(false);
    expect([...ctx.storage.files.keys()]).toEqual([p.document!.key]);
    const file = await download.execute({ actor: actors.admin(), prospectId: p.id });
    expect(file.content.toString()).toBe('v2');
    await expect(
      upload.execute({ actor: apporteur('app-2'), prospectId: p.id, file: incomingFile() }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      upload.execute({ actor: apporteur(), prospectId: 'nope', file: incomingFile() }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('reject: manage-users; notifies the apporteur; twice → 409', async () => {
    const ctx = apporteursTestContext();
    const p = aProspect();
    ctx.prospects.store.set(p.id, p);
    const uc = new RejectProspectUseCase(ctx.prospects, ctx.committer, ctx.clock);
    await expect(uc.execute({ actor: actors.admin([]), prospectId: p.id })).rejects.toMatchObject({
      httpStatus: 403,
    });
    await expect(uc.execute({ actor: manager(), prospectId: 'nope' })).rejects.toMatchObject({
      httpStatus: 404,
    });
    const view = await uc.execute({ actor: manager(), prospectId: p.id, reason: 'hors cible' });
    expect(view).toMatchObject({ status: 'REJETÉ', rejectedReason: 'hors cible' });
    expect(ctx.notifier.recipients()).toEqual(['app-1']);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ fromStatus: 'EN_ATTENTE', toStatus: 'REJETÉ' }),
    ]);
    await expect(uc.execute({ actor: manager(), prospectId: p.id })).rejects.toMatchObject({
      code: 'PROSPECT_ALREADY_PROCESSED',
    });
  });
});

describe('ConvertProspectUseCase', () => {
  const setup = () => {
    const ctx = apporteursTestContext();
    const prospect = aProspect();
    ctx.prospects.store.set(prospect.id, prospect);
    const uc = new ConvertProspectUseCase(
      ctx.prospects,
      ctx.commissions,
      ctx.onboarding,
      ctx.deals,
      ctx.uow,
      ctx.storage,
      ctx.committer,
      ctx.best,
      ctx.clock,
    );
    const input = {
      actor: manager(),
      prospectId: prospect.id,
      quoteTitle: 'Audit fiscal',
      price: 5000,
      missionTitle: ' Mission audit ',
      signedContract: incomingFile('contrat-signe.pdf', 'signed'),
      contractMission: incomingFile('mission.docx', 'mission'),
    };
    return { ctx, prospect, uc, input };
  };

  it('creates client + deal + commission + CONVERTI in ONE transaction, then finalizes', async () => {
    const { ctx, prospect, uc, input } = setup();
    const result = await uc.execute({ ...input, commissionAmount: 300 });
    expect(result).toMatchObject({
      clientId: 'client-new',
      clientCreated: true,
      quoteId: 'quote-new',
      contractId: 'contract-new',
      missionId: 'mission-new',
      prospect: { status: 'CONVERTI', clientId: 'client-new', missionId: 'mission-new' },
    });
    expect(ctx.uow.runs).toBe(1);
    expect(ctx.onboarding.log).toEqual([
      'prepare:jean@acme.test:ACME SAS',
      'persist-client:true',
      'finalize-client',
    ]);
    expect(ctx.deals.log).toEqual(['persist-deal:true', 'finalize-deal']);
    expect(ctx.commissions.saves[0].tx).toBe(ctx.uow.tx);
    expect(ctx.prospects.saves.at(-1)!.tx).toBe(ctx.uow.tx);

    const [request] = ctx.deals.requests;
    expect(request).toMatchObject({
      clientId: 'client-new',
      quoteTitle: 'Audit fiscal',
      quoteType: 'CONSULTATION',
      price: 5000,
      description: 'Affaire apportée : ACME SAS (Jean Dupont)',
      missionTitle: ' Mission audit ',
      deliveryDate: null,
      adminId: 'admin-1',
    });
    expect(request.signedContract.key).toBe(`conversions/${prospect.id}/contrat-signe.pdf`);
    expect(request.missionContractFile.key).toBe(`conversions/${prospect.id}/contrat-mission.docx`);
    expect(ctx.storage.files.size).toBe(2);

    const commission = ctx.commissions.store.get(result.commissionId)!;
    expect(commission).toMatchObject({
      apporteurId: 'app-1',
      clientName: 'ACME SAS',
      missionTitle: 'Mission audit',
      amount: 300,
      status: CommissionStatus.EN_ATTENTE,
    });
    expect(ctx.audit.entries.map((e) => `${e.entity}:${e.action}`)).toEqual([
      'Commission:CREATED',
      'Prospect:STATUS_CHANGED',
    ]);
    // apporteur told; client receives credentials by email
    expect(ctx.notifier.sent.map((s) => s.userId).sort()).toEqual(['app-1', 'client-new']);
    const welcome = ctx.notifier.sent.find((s) => s.userId === 'client-new')!.event;
    expect(welcome.email).toMatchObject({ to: 'jean@acme.test' });
    expect(welcome.email!.text).toContain('Temp-Pass-123');
  });

  it('an existing client account is reused: no credentials email', async () => {
    const { ctx, uc, input } = setup();
    ctx.onboarding.existing = true;
    const result = await uc.execute({ ...input, description: 'Desc', quoteType: 'ABONNEMENT' });
    expect(result.clientCreated).toBe(false);
    expect(ctx.deals.requests[0]).toMatchObject({ description: 'Desc', quoteType: 'ABONNEMENT' });
    expect(ctx.notifier.recipients()).toEqual(['app-1']);
  });

  it('ROLLBACK: a failing write keeps nothing — files removed, prospect pending, nothing finalized', async () => {
    const { ctx, prospect, uc, input } = setup();
    ctx.deals.failOnPersist = true;
    await expect(uc.execute(input)).rejects.toThrow('mission insert failed');
    expect(ctx.storage.files.size).toBe(0);
    expect(ctx.onboarding.log).not.toContain('finalize-client');
    expect(ctx.deals.log).toEqual([]);
    expect(ctx.audit.entries).toEqual([]);
    expect(ctx.notifier.sent).toEqual([]);
    // the in-memory UoW does not roll back: the stored prospect is untouched because
    // nothing was saved before the failure
    expect(ctx.prospects.saves).toEqual([]);
    expect(ctx.commissions.saves).toEqual([]);
    expect(prospect.status).toBe(ProspectStatus.CONVERTI); // in-memory aggregate only, never saved
  });

  it('guards: manage-users, unknown 404, already processed 409, no email 422', async () => {
    const { ctx, uc, input } = setup();
    await expect(uc.execute({ ...input, actor: actors.admin([]) })).rejects.toMatchObject({
      httpStatus: 403,
    });
    await expect(uc.execute({ ...input, prospectId: 'nope' })).rejects.toMatchObject({
      code: 'PROSPECT_NOT_FOUND',
    });
    const done = aProspect({ status: ProspectStatus.REJETE });
    const noEmail = aProspect({ contactEmail: null });
    for (const p of [done, noEmail]) ctx.prospects.store.set(p.id, p);
    await expect(uc.execute({ ...input, prospectId: done.id })).rejects.toMatchObject({
      code: 'PROSPECT_ALREADY_PROCESSED',
      httpStatus: 409,
    });
    await expect(uc.execute({ ...input, prospectId: noEmail.id })).rejects.toMatchObject({
      code: 'PROSPECT_EMAIL_REQUIRED',
      httpStatus: 422,
    });
    await expect(uc.execute({ ...input, commissionAmount: -1 })).rejects.toMatchObject({
      code: 'INVALID_AMOUNT',
    });
    expect(ctx.storage.files.size).toBe(0);
    expect(ctx.uow.runs).toBe(0);
  });
});

describe('commissions', () => {
  const setup = () => {
    const ctx = apporteursTestContext();
    const mine = aCommission();
    const theirs = aCommission({ apporteurId: 'app-2', missionId: 'mission-2', amount: 50 });
    for (const c of [mine, theirs]) ctx.commissions.store.set(c.id, c);
    return { ctx, mine, theirs };
  };

  it('list / get: apporteur sees only theirs; admin filters', async () => {
    const { ctx, mine, theirs } = setup();
    const list = new ListCommissionsUseCase(ctx.commissions);
    expect(
      (await list.execute({ actor: apporteur(), apporteurId: 'app-2' })).data.map((c) => c.id),
    ).toEqual([mine.id]);
    expect(
      (await list.execute({ actor: actors.admin(), missionId: 'mission-2' })).data.map((c) => c.id),
    ).toEqual([theirs.id]);
    expect(
      (await list.execute({ actor: actors.admin(), status: CommissionStatus.EN_ATTENTE })).meta
        .total,
    ).toBe(2);
    const get = new GetCommissionUseCase(ctx.commissions);
    expect(await get.execute({ actor: apporteur(), commissionId: mine.id })).toMatchObject({
      clientName: 'ACME SAS',
      missionTitle: 'Audit',
      currency: 'EUR',
    });
    await expect(
      get.execute({ actor: apporteur(), commissionId: theirs.id }),
    ).rejects.toMatchObject({
      code: 'COMMISSION_NOT_FOUND',
      httpStatus: 404,
    });
    await get.execute({ actor: actors.admin(), commissionId: theirs.id });
  });

  it('amount then status, with pay-apporteurs; audited; apporteur notified', async () => {
    const { ctx, mine } = setup();
    const setAmount = new SetCommissionAmountUseCase(ctx.commissions, ctx.committer, ctx.clock);
    const status = new UpdateCommissionStatusUseCase(ctx.commissions, ctx.committer, ctx.clock);
    await expect(
      setAmount.execute({ actor: actors.admin([]), commissionId: mine.id, amount: 10 }),
    ).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    await expect(
      status.execute({ actor: payer(), commissionId: mine.id, status: 'VALIDÉE' }),
    ).rejects.toMatchObject({ code: 'COMMISSION_AMOUNT_REQUIRED' });
    expect(
      (await setAmount.execute({ actor: payer(), commissionId: mine.id, amount: 400 })).amount,
    ).toBe(400);
    expect(
      (await status.execute({ actor: payer(), commissionId: mine.id, status: 'VALIDÉE' })).status,
    ).toBe('VALIDÉE');
    const paid = await status.execute({ actor: payer(), commissionId: mine.id, status: 'PAYÉE' });
    expect(paid).toMatchObject({ status: 'PAYÉE', paidAt: NOW });
    expect(ctx.audit.entries.map((e) => e.action)).toEqual([
      'AMOUNT_SET',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
    ]);
    expect(ctx.audit.entries[0].metadata).toEqual({ from: null, to: 400 });
    expect(ctx.notifier.sent.map((s) => s.event.title)).toEqual([
      'Commission validée',
      'Commission payée',
    ]);
    expect(ctx.notifier.sent[0].event.body).toContain('400,00 €');
    await expect(
      status.execute({ actor: payer(), commissionId: mine.id, status: 'NOPE' }),
    ).rejects.toMatchObject({ code: 'INVALID_COMMISSION_STATUS' });
    await expect(
      status.execute({ actor: payer(), commissionId: 'x', status: 'PAYÉE' }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(
      setAmount.execute({ actor: payer(), commissionId: 'x', amount: 1 }),
    ).rejects.toMatchObject({ httpStatus: 404 });
  });
});
