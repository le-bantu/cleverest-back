import { actors } from '@shared/testing/fakes';
import { aPayment, aValidatedPayment, NOW, paymentsTestContext } from '../../testing/in-memory';
import {
  DownloadClientInvoiceUseCase,
  GenerateClientInvoiceUseCase,
  INVOICE_NUMBER_ATTEMPTS,
  ListClientInvoicesUseCase,
  SendClientInvoiceUseCase,
} from './client-invoices.use-cases';

const validator = () => actors.admin(['validate-payments']);

const setup = () => {
  const ctx = paymentsTestContext();
  const mission = ctx.missions.add({ title: 'Audit fiscal 2026' });
  const payment = aValidatedPayment({ missionId: mission.id, amount: 2400.5 });
  ctx.payments.store.set(payment.id, payment);
  const generate = new GenerateClientInvoiceUseCase(
    ctx.payments,
    ctx.invoices,
    ctx.missions,
    ctx.directory,
    ctx.pdf,
    ctx.storage,
    ctx.committer,
    ctx.clock,
  );
  return { ctx, mission, payment, generate };
};

describe('GenerateClientInvoiceUseCase', () => {
  it('numbers the invoice, renders the PDF, stores it and audits GENERATED', async () => {
    const { ctx, payment, generate } = setup();
    const view = await generate.execute({ actor: validator(), paymentId: payment.id });
    expect(view).toMatchObject({
      invoiceNumber: 'FAC-2026-0001',
      paymentId: payment.id,
      clientId: 'client-1',
      amount: 2400.5,
      currency: 'EUR',
      generatedAt: NOW,
      sentAt: null,
    });
    const stored = ctx.storage.files.get(`client-invoices/${view.id}.pdf`);
    expect(stored?.toString()).toBe('%PDF Facture FAC-2026-0001');
    expect(ctx.invoices.store.get(view.id)!.pdfFile.size).toBe(stored!.length);
    const text = ctx.pdf.documents[0].blocks.map((b) => b.text).join('\n');
    expect(text).toContain('Facture N° FAC-2026-0001');
    expect(text).toContain('ACME SAS');
    expect(text).toContain('compta@acme.test');
    expect(text).toContain('Mission : Audit fiscal 2026');
    expect(text).toContain('2 400,50 €');
    expect(text).toContain('01/07/2026');
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ entity: 'ClientInvoice', action: 'GENERATED' }),
    ]);
    expect(ctx.bus.names()).toEqual(['payments.client-invoice-generated']);
  });

  it('continues the yearly sequence', async () => {
    const { ctx, mission, generate } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = aValidatedPayment({ missionId: mission.id });
      ctx.payments.store.set(p.id, p);
      ids.push((await generate.execute({ actor: validator(), paymentId: p.id })).invoiceNumber);
    }
    expect(ids).toEqual(['FAC-2026-0001', 'FAC-2026-0002', 'FAC-2026-0003']);
  });

  it('IMPOSSIBLE while the payment is not validated (422) — nothing stored', async () => {
    const { ctx, mission, generate } = setup();
    const pending = aPayment({ missionId: mission.id });
    ctx.payments.store.set(pending.id, pending);
    await expect(
      generate.execute({ actor: validator(), paymentId: pending.id }),
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_VALIDATED', httpStatus: 422 });
    expect(ctx.storage.files.size).toBe(0);
    expect(ctx.pdf.documents).toEqual([]);
  });

  it('one invoice per payment (409); permission; unknown payment / mission → 404', async () => {
    const { ctx, payment, generate } = setup();
    await generate.execute({ actor: validator(), paymentId: payment.id });
    await expect(
      generate.execute({ actor: validator(), paymentId: payment.id }),
    ).rejects.toMatchObject({ code: 'CLIENT_INVOICE_ALREADY_EXISTS', httpStatus: 409 });
    await expect(
      generate.execute({ actor: actors.admin([]), paymentId: payment.id }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    await expect(generate.execute({ actor: validator(), paymentId: 'nope' })).rejects.toMatchObject(
      {
        code: 'PAYMENT_NOT_FOUND',
      },
    );
    const orphan = aValidatedPayment({ missionId: 'gone' });
    ctx.payments.store.set(orphan.id, orphan);
    await expect(
      generate.execute({ actor: validator(), paymentId: orphan.id }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
  });

  it('retries with the next number when a concurrent invoice took it', async () => {
    const { ctx, payment, generate } = setup();
    ctx.invoices.stolenNumbers.add('FAC-2026-0001');
    const view = await generate.execute({ actor: validator(), paymentId: payment.id });
    expect(view.invoiceNumber).toBe('FAC-2026-0002');
    expect([...ctx.storage.files.keys()]).toEqual([`client-invoices/${view.id}.pdf`]);
  });

  it(`gives up after ${INVOICE_NUMBER_ATTEMPTS} collisions; other failures are not retried`, async () => {
    const { ctx, payment, generate } = setup();
    for (let n = 1; n <= INVOICE_NUMBER_ATTEMPTS; n++) {
      ctx.invoices.stolenNumbers.add(`FAC-2026-000${n}`);
    }
    await expect(
      generate.execute({ actor: validator(), paymentId: payment.id }),
    ).rejects.toMatchObject({ code: 'INVOICE_NUMBER_TAKEN', httpStatus: 409 });
    ctx.invoices.failNextSave = true;
    await expect(generate.execute({ actor: validator(), paymentId: payment.id })).rejects.toThrow(
      'db down',
    );
    expect([...ctx.storage.files.keys()]).toEqual([]);
  });

  it('falls back to the client id when the directory has no entry', async () => {
    const { ctx, mission, generate } = setup();
    const p = aValidatedPayment({ clientId: 'ghost', missionId: mission.id });
    ctx.payments.store.set(p.id, p);
    await generate.execute({ actor: validator(), paymentId: p.id });
    const text = ctx.pdf.documents[0].blocks.map((b) => b.text);
    expect(text).toContain('ghost');
  });
});

describe('Send / List / Download client invoices', () => {
  const withInvoice = async () => {
    const s = setup();
    const view = await s.generate.execute({ actor: validator(), paymentId: s.payment.id });
    s.ctx.audit.entries.length = 0;
    s.ctx.bus.published.length = 0;
    return { ...s, invoiceId: view.id };
  };

  it('send: emails the client, sets sentAt, audits SENT', async () => {
    const { ctx, invoiceId } = await withInvoice();
    const uc = new SendClientInvoiceUseCase(
      ctx.invoices,
      ctx.directory,
      ctx.notifier,
      ctx.committer,
      ctx.clock,
    );
    const view = await uc.execute({ actor: validator(), invoiceId });
    expect(view.sentAt).toEqual(NOW);
    expect(ctx.notifier.sent).toEqual([
      {
        userId: 'client-1',
        event: expect.objectContaining({
          type: 'client-invoice',
          email: expect.objectContaining({
            to: 'compta@acme.test',
            subject: 'The Cleverest — facture FAC-2026-0001',
          }),
        }),
      },
    ]);
    expect(ctx.audit.entries).toEqual([expect.objectContaining({ action: 'SENT' })]);
    expect(ctx.bus.names()).toEqual(['payments.client-invoice-sent']);
  });

  it('send: no email → 422; delivery failure surfaces and sentAt stays empty; permission', async () => {
    const { ctx, invoiceId } = await withInvoice();
    const uc = new SendClientInvoiceUseCase(
      ctx.invoices,
      ctx.directory,
      ctx.notifier,
      ctx.committer,
      ctx.clock,
    );
    ctx.notifier.failFor.add('client-1');
    await expect(uc.execute({ actor: validator(), invoiceId })).rejects.toThrow('smtp down');
    expect(ctx.invoices.store.get(invoiceId)!.sentAt).toBeNull();
    ctx.directory.clients.set('client-1', { clientId: 'client-1', name: 'ACME', email: null });
    await expect(uc.execute({ actor: validator(), invoiceId })).rejects.toMatchObject({
      code: 'CLIENT_EMAIL_MISSING',
      httpStatus: 422,
    });
    await expect(uc.execute({ actor: actors.admin([]), invoiceId })).rejects.toMatchObject({
      httpStatus: 403,
    });
    await expect(uc.execute({ actor: validator(), invoiceId: 'nope' })).rejects.toMatchObject({
      code: 'CLIENT_INVOICE_NOT_FOUND',
    });
  });

  it('list: client sees theirs, admin filters; download: owner or admin, others 404', async () => {
    const { ctx, invoiceId, mission } = await withInvoice();
    const list = new ListClientInvoicesUseCase(ctx.invoices);
    expect((await list.execute({ actor: actors.client('client-1') })).meta.total).toBe(1);
    expect((await list.execute({ actor: actors.client('client-2') })).meta.total).toBe(0);
    expect((await list.execute({ actor: actors.admin(), clientId: 'client-2' })).meta.total).toBe(
      0,
    );
    expect((await list.execute({ actor: actors.admin(), missionId: mission.id })).meta.total).toBe(
      1,
    );
    expect((await list.execute({ actor: actors.admin(), sent: true })).meta.total).toBe(0);
    await expect(list.execute({ actor: actors.consultant() })).rejects.toMatchObject({
      httpStatus: 403,
    });

    const dl = new DownloadClientInvoiceUseCase(ctx.invoices, ctx.storage);
    const file = await dl.execute({ actor: actors.client('client-1'), invoiceId });
    expect(file).toMatchObject({ fileName: 'FAC-2026-0001.pdf', mimeType: 'application/pdf' });
    await dl.execute({ actor: actors.admin(), invoiceId });
    await expect(dl.execute({ actor: actors.client('client-2'), invoiceId })).rejects.toMatchObject(
      { httpStatus: 404 },
    );
  });
});
