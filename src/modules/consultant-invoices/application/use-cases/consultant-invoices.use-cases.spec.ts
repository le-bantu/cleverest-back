import { actors, incomingFile } from '@shared/testing/fakes';
import { aConsultantInvoice, consultantInvoicesTestContext, NOW } from '../../testing/in-memory';
import {
  DownloadConsultantInvoiceUseCase,
  ListConsultantInvoicesUseCase,
  MarkConsultantInvoicePaidUseCase,
  SubmitConsultantInvoiceUseCase,
} from './consultant-invoices.use-cases';

const payer = () => actors.admin(['pay-consultants']);

describe('SubmitConsultantInvoiceUseCase', () => {
  const setup = () => {
    const ctx = consultantInvoicesTestContext();
    const uc = new SubmitConsultantInvoiceUseCase(
      ctx.invoices,
      ctx.missions,
      ctx.commitments,
      ctx.storage,
      ctx.committer,
      ctx.clock,
    );
    const mission = ctx.missions.add();
    return { ctx, uc, mission };
  };

  it('stores the file; amount defaults to the remainder of the signed contract', async () => {
    const { ctx, uc, mission } = setup();
    const first = await uc.execute({
      actor: actors.consultant('c1'),
      missionId: mission.id,
      amount: 600,
      file: incomingFile('Facture.PDF'),
    });
    expect(first).toMatchObject({
      consultantId: 'c1',
      missionId: mission.id,
      quoteId: 'quote-1',
      amount: 600,
      currency: 'EUR',
      fileName: 'Facture.PDF',
      uploadedAt: NOW,
      isPaid: false,
    });
    expect(ctx.storage.files.has(`consultant-invoices/${mission.id}/${first.id}.pdf`)).toBe(true);
    const rest = await uc.execute({
      actor: actors.consultant('c1'),
      missionId: mission.id,
      file: incomingFile(),
    });
    expect(rest.amount).toBe(400);
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: mission.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONTRACT_FULLY_INVOICED', httpStatus: 409 });
    expect(ctx.audit.entries.map((e) => e.toStatus)).toEqual(['UNPAID', 'UNPAID']);
    expect(ctx.bus.names()).toEqual([
      'consultant-invoices.submitted',
      'consultant-invoices.submitted',
    ]);
  });

  it('no signed contract → 403; not assigned / unknown mission → 404; client → 403; failed save cleans', async () => {
    const { ctx, uc, mission } = setup();
    const input = { missionId: mission.id, file: incomingFile() };
    await expect(uc.execute({ ...input, actor: actors.consultant('c2') })).rejects.toMatchObject({
      code: 'CONSULTANT_CONTRACT_NOT_SIGNED',
      httpStatus: 403,
    });
    await expect(uc.execute({ ...input, actor: actors.consultant('c9') })).rejects.toMatchObject({
      code: 'MISSION_NOT_FOUND',
      httpStatus: 404,
    });
    await expect(
      uc.execute({ ...input, missionId: 'nope', actor: actors.consultant('c1') }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(uc.execute({ ...input, actor: actors.client() })).rejects.toMatchObject({
      httpStatus: 403,
    });
    ctx.invoices.failNextSave = true;
    await expect(uc.execute({ ...input, actor: actors.consultant('c1') })).rejects.toThrow(
      'db down',
    );
    expect(ctx.storage.files.size).toBe(0);
  });
});

describe('List / Download / Pay consultant invoices', () => {
  const setup = () => {
    const ctx = consultantInvoicesTestContext();
    const mine = aConsultantInvoice({ consultantId: 'c1' });
    const other = aConsultantInvoice({
      consultantId: 'c2',
      missionId: 'mission-2',
      paidAt: NOW,
      paidById: 'a',
    });
    for (const i of [mine, other]) ctx.invoices.store.set(i.id, i);
    ctx.storage.files.set(mine.file.key, Buffer.from('facture'));
    return { ctx, mine, other };
  };

  it('list: consultant sees theirs; admin filters', async () => {
    const { ctx, mine, other } = setup();
    const uc = new ListConsultantInvoicesUseCase(ctx.invoices);
    const own = await uc.execute({ actor: actors.consultant('c1'), consultantId: 'c2' });
    expect(own.data.map((i) => i.id)).toEqual([mine.id]);
    const ids = async (f: object) =>
      (await uc.execute({ actor: actors.admin(), ...f })).data.map((i) => i.id);
    expect(await ids({})).toHaveLength(2);
    expect(await ids({ consultantId: 'c2' })).toEqual([other.id]);
    expect(await ids({ isPaid: false })).toEqual([mine.id]);
    expect(await ids({ missionId: 'mission-2' })).toEqual([other.id]);
    await expect(uc.execute({ actor: actors.client() })).rejects.toMatchObject({ httpStatus: 403 });
  });

  it('download: author or admin; another consultant 404', async () => {
    const { ctx, mine } = setup();
    const uc = new DownloadConsultantInvoiceUseCase(ctx.invoices, ctx.storage);
    const file = await uc.execute({ actor: actors.consultant('c1'), invoiceId: mine.id });
    expect(file.content.toString()).toBe('facture');
    await uc.execute({ actor: actors.admin(), invoiceId: mine.id });
    await expect(
      uc.execute({ actor: actors.consultant('c2'), invoiceId: mine.id }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_INVOICE_NOT_FOUND', httpStatus: 404 });
  });

  it('pay: pay-consultants required (403 otherwise); notifies the author; twice → 409', async () => {
    const { ctx, mine } = setup();
    const uc = new MarkConsultantInvoicePaidUseCase(ctx.invoices, ctx.committer, ctx.clock);
    await expect(
      uc.execute({ actor: actors.admin(['validate-payments']), invoiceId: mine.id }),
    ).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED', httpStatus: 403 });
    await expect(uc.execute({ actor: payer(), invoiceId: 'nope' })).rejects.toMatchObject({
      httpStatus: 404,
    });
    const view = await uc.execute({ actor: payer(), invoiceId: mine.id });
    expect(view).toMatchObject({ isPaid: true, paidAt: NOW });
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ fromStatus: 'UNPAID', toStatus: 'PAID', actorId: 'admin-1' }),
    ]);
    expect(ctx.notifier.recipients()).toEqual(['c1']);
    expect(ctx.notifier.sent[0].event.body).toContain('400,00 €');
    await expect(uc.execute({ actor: payer(), invoiceId: mine.id })).rejects.toMatchObject({
      code: 'CONSULTANT_INVOICE_ALREADY_PAID',
      httpStatus: 409,
    });
  });
});
