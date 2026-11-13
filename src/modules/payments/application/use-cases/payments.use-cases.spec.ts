import { actors, incomingFile } from '@shared/testing/fakes';
import { aPayment, aValidatedPayment, NOW, paymentsTestContext } from '../../testing/in-memory';
import {
  DownloadPaymentProofUseCase,
  GetPaymentUseCase,
  ListPaymentsUseCase,
  SubmitPaymentUseCase,
  ValidatePaymentUseCase,
} from './payments.use-cases';

const validator = () => actors.admin(['validate-payments']);

describe('SubmitPaymentUseCase', () => {
  const setup = () => {
    const ctx = paymentsTestContext();
    const uc = new SubmitPaymentUseCase(
      ctx.payments,
      ctx.missions,
      ctx.storage,
      ctx.committer,
      ctx.clock,
    );
    return { ctx, uc };
  };

  it('stores the proof, saves a pending payment and audits CREATED', async () => {
    const { ctx, uc } = setup();
    const mission = ctx.missions.add();
    const view = await uc.execute({
      actor: actors.client('client-1'),
      missionId: mission.id,
      amount: 1500,
      file: incomingFile('Virement.PDF'),
    });
    expect(view).toMatchObject({
      missionId: mission.id,
      clientId: 'client-1',
      amount: 1500,
      currency: 'EUR',
      isValidated: false,
      proofFileName: 'Virement.PDF',
      createdAt: NOW,
    });
    expect(ctx.storage.files.has(`payments/${mission.id}/${view.id}.pdf`)).toBe(true);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ entity: 'Payment', action: 'CREATED', toStatus: 'PENDING' }),
    ]);
    expect(ctx.bus.names()).toEqual(['payments.payment-submitted']);
  });

  it("unknown or someone else's mission → 404; consultant → 403; failed save cleans the file", async () => {
    const { ctx, uc } = setup();
    const mission = ctx.missions.add({ clientId: 'client-2' });
    const input = { missionId: mission.id, amount: 10, file: incomingFile() };
    await expect(uc.execute({ ...input, actor: actors.client('client-1') })).rejects.toMatchObject({
      code: 'MISSION_NOT_FOUND',
      httpStatus: 404,
    });
    await expect(
      uc.execute({ ...input, missionId: 'nope', actor: actors.client('client-2') }),
    ).rejects.toMatchObject({ httpStatus: 404 });
    await expect(uc.execute({ ...input, actor: actors.consultant() })).rejects.toMatchObject({
      httpStatus: 403,
    });
    ctx.payments.failNextSave = true;
    await expect(uc.execute({ ...input, actor: actors.client('client-2') })).rejects.toThrow(
      'db down',
    );
    expect(ctx.storage.files.size).toBe(0);
  });
});

describe('ListPaymentsUseCase', () => {
  const setup = () => {
    const ctx = paymentsTestContext();
    const m1 = ctx.missions.add({ consultantIds: ['c1'] });
    const m2 = ctx.missions.add({ clientId: 'client-2', consultantIds: ['c2'] });
    const a = aPayment({ missionId: m1.id });
    const b = aValidatedPayment({ missionId: m2.id, clientId: 'client-2' });
    for (const p of [a, b]) ctx.payments.store.set(p.id, p);
    return { ctx, a, b, uc: new ListPaymentsUseCase(ctx.payments, ctx.missions) };
  };

  it('client: own payments; consultant: payments of their missions, reduced view', async () => {
    const { a, b, uc } = setup();
    const mine = await uc.execute({ actor: actors.client('client-1'), clientId: 'client-2' });
    expect(mine.data.map((p) => p.id)).toEqual([a.id]);
    const consultant = await uc.execute({ actor: actors.consultant('c2'), consultantId: 'c1' });
    expect(consultant.data.map((p) => p.id)).toEqual([b.id]);
    expect(consultant.data[0]).not.toHaveProperty('clientId');
    expect(consultant.data[0]).not.toHaveProperty('proofFileName');
  });

  it('admin: all, filtered by client, consultant, validation, mission', async () => {
    const { a, b, uc } = setup();
    const ids = async (f: object) =>
      (await uc.execute({ actor: actors.admin(), ...f })).data.map((p) => p.id);
    expect(await ids({})).toHaveLength(2);
    expect(await ids({ clientId: 'client-2' })).toEqual([b.id]);
    expect(await ids({ consultantId: 'c1' })).toEqual([a.id]);
    expect(await ids({ isValidated: true })).toEqual([b.id]);
    expect(await ids({ missionId: a.missionId })).toEqual([a.id]);
    expect((await uc.execute({ actor: actors.admin() })).data[0]).toHaveProperty('proofFileName');
  });
});

describe('Get / Download / Validate payment', () => {
  const setup = () => {
    const ctx = paymentsTestContext();
    const p = aPayment();
    ctx.payments.store.set(p.id, p);
    ctx.storage.files.set(p.proofFile.key, Buffer.from('proof'));
    return { ctx, p };
  };

  it('get + download: owning client or admin; others 404; consultant 403', async () => {
    const { ctx, p } = setup();
    const get = new GetPaymentUseCase(ctx.payments);
    const dl = new DownloadPaymentProofUseCase(ctx.payments, ctx.storage);
    expect((await get.execute({ actor: actors.client('client-1'), paymentId: p.id })).id).toBe(
      p.id,
    );
    expect((await get.execute({ actor: actors.admin(), paymentId: p.id })).amount).toBe(1500);
    await expect(
      get.execute({ actor: actors.client('client-2'), paymentId: p.id }),
    ).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND', httpStatus: 404 });
    await expect(
      get.execute({ actor: actors.consultant(), paymentId: p.id }),
    ).rejects.toMatchObject({
      httpStatus: 403,
    });
    const file = await dl.execute({ actor: actors.client('client-1'), paymentId: p.id });
    expect(file).toMatchObject({ fileName: 'virement.pdf', mimeType: 'application/pdf' });
    expect(file.content.toString()).toBe('proof');
  });

  it('validate: validate-payments required; audits, notifies the client; twice → 409', async () => {
    const { ctx, p } = setup();
    const uc = new ValidatePaymentUseCase(ctx.payments, ctx.committer, ctx.clock);
    await expect(uc.execute({ actor: actors.admin([]), paymentId: p.id })).rejects.toMatchObject({
      code: 'PERMISSION_REQUIRED',
      httpStatus: 403,
    });
    await expect(uc.execute({ actor: validator(), paymentId: 'nope' })).rejects.toMatchObject({
      httpStatus: 404,
    });
    const view = await uc.execute({ actor: validator(), paymentId: p.id });
    expect(view).toMatchObject({ isValidated: true, validatedAt: NOW });
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ fromStatus: 'PENDING', toStatus: 'VALIDATED', actorId: 'admin-1' }),
    ]);
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
    expect(ctx.notifier.sent[0].event.body).toContain('1 500,00 €');
    expect(ctx.bus.names()).toEqual(['payments.payment-validated']);
    await expect(uc.execute({ actor: validator(), paymentId: p.id })).rejects.toMatchObject({
      code: 'PAYMENT_ALREADY_VALIDATED',
      httpStatus: 409,
    });
  });
});
