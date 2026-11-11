import { actors, incomingFile } from '@shared/testing/fakes';
import { aDeliverable, deliverablesTestContext, NOW } from '../../testing/in-memory';
import {
  DownloadDeliverableUseCase,
  GetDeliverableUseCase,
  ListDeliverablesUseCase,
  UploadDeliverableUseCase,
  ValidateDeliverableAsAdminUseCase,
  ValidateDeliverableAsClientUseCase,
} from './deliverables.use-cases';

const validator = () => actors.admin(['validate-deliverables']);

describe('UploadDeliverableUseCase', () => {
  const setup = () => {
    const ctx = deliverablesTestContext();
    const uc = new UploadDeliverableUseCase(
      ctx.deliverables,
      ctx.missions,
      ctx.engagement,
      ctx.storage,
      ctx.committer,
      ctx.clock,
    );
    return { ctx, uc };
  };

  it('stores the file under the mission and publishes DeliverableUploaded', async () => {
    const { ctx, uc } = setup();
    const mission = ctx.missions.add();
    const view = await uc.execute({
      actor: actors.consultant('c2'),
      missionId: mission.id,
      file: incomingFile('Rapport final.PDF'),
    });
    expect(view).toMatchObject({
      missionId: mission.id,
      consultantId: 'c2',
      clientId: 'client-1',
      fileName: 'Rapport final.PDF',
      adminValidated: false,
      uploadedAt: NOW,
    });
    expect(ctx.storage.files.has(`deliverables/${mission.id}/${view.id}.pdf`)).toBe(true);
    expect(ctx.bus.names()).toEqual(['deliverables.uploaded']);
    expect(ctx.notifier.sent).toEqual([]); // the client is not told before admin validation
    expect(ctx.engagement.calls).toEqual([{ consultantId: 'c2', quoteId: 'quote-1' }]);
  });

  it('a consultant without a signed consultant contract cannot deliver (403)', async () => {
    const { ctx, uc } = setup();
    const mission = ctx.missions.add();
    ctx.engagement.unsigned.add('c1');
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: mission.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_CONTRACT_NOT_SIGNED', httpStatus: 403 });
    expect(ctx.storage.files.size).toBe(0);
  });

  it('outsider or unknown mission → 404; inactive mission → 409; client → 403', async () => {
    const { ctx, uc } = setup();
    const mission = ctx.missions.add();
    const pending = ctx.missions.add({ active: false, status: 'EN_ATTENTE' });
    await expect(
      uc.execute({ actor: actors.consultant('c9'), missionId: mission.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: 'nope', file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: pending.id, file: incomingFile() }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_ACTIVE' });
    await expect(
      uc.execute({ actor: actors.client(), missionId: mission.id, file: incomingFile() }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    ctx.deliverables.failNextSave = true;
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: mission.id, file: incomingFile() }),
    ).rejects.toThrow('db down');
    expect(ctx.storage.files.size).toBe(0);
  });
});

describe('List / Get / Download — visibility by audience', () => {
  const setup = () => {
    const ctx = deliverablesTestContext();
    const hidden = aDeliverable({ consultantId: 'c1' });
    const released = aDeliverable({
      consultantId: 'c2',
      adminValidated: true,
      adminValidatedAt: NOW,
      clientValidated: true,
      clientValidatedAt: NOW,
    });
    const foreign = aDeliverable({ clientId: 'client-2', missionId: 'mission-2' });
    for (const d of [hidden, released, foreign]) ctx.deliverables.store.set(d.id, d);
    for (const d of [hidden, released]) ctx.storage.files.set(d.file.key, Buffer.from('bin'));
    return { ctx, hidden, released, foreign };
  };

  it('client: only admin-validated deliverables of their missions, without the author', async () => {
    const { ctx, released } = setup();
    const uc = new ListDeliverablesUseCase(ctx.deliverables);
    const page = await uc.execute({ actor: actors.client(), adminValidated: false });
    expect(page.data.map((d) => d.id)).toEqual([released.id]);
    expect(page.data[0]).not.toHaveProperty('consultantId');
    expect(page.data[0]).toMatchObject({ clientValidated: true, validatedAt: NOW });
  });

  it('consultant: own uploads only (consultantId filter ignored); admin: all + filters', async () => {
    const { ctx, hidden, released, foreign } = setup();
    const uc = new ListDeliverablesUseCase(ctx.deliverables);
    const mine = await uc.execute({ actor: actors.consultant('c1'), consultantId: 'c2' });
    expect(mine.data.map((d) => d.id).sort()).toEqual([hidden.id, foreign.id].sort());
    const ids = async (f: object) =>
      (await uc.execute({ actor: actors.admin(), ...f })).data.map((d) => d.id).sort();
    expect(await ids({})).toHaveLength(3);
    expect(await ids({ consultantId: 'c2' })).toEqual([released.id]);
    expect(await ids({ validated: true })).toEqual([released.id]);
    expect(await ids({ adminValidated: false })).toEqual([hidden.id, foreign.id].sort());
    expect(await ids({ missionId: 'mission-2' })).toEqual([foreign.id]);
    expect(
      await ids({ uploadedFrom: new Date('2027-01-01'), uploadedTo: new Date('2028-01-01') }),
    ).toEqual([]);
    await expect(uc.execute({ actor: actors.apporteur() })).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('get / download apply the same rule (404 for the client before release)', async () => {
    const { ctx, hidden, released } = setup();
    const get = new GetDeliverableUseCase(ctx.deliverables);
    const dl = new DownloadDeliverableUseCase(ctx.deliverables, ctx.storage);
    for (const uc of [get, dl]) {
      await expect(
        uc.execute({ actor: actors.client(), deliverableId: hidden.id }),
      ).rejects.toMatchObject({ code: 'DELIVERABLE_NOT_FOUND' });
      await expect(
        uc.execute({ actor: actors.consultant('c2'), deliverableId: hidden.id }),
      ).rejects.toMatchObject({ code: 'DELIVERABLE_NOT_FOUND' });
      await expect(
        uc.execute({ actor: actors.admin(), deliverableId: 'nope' }),
      ).rejects.toMatchObject({ code: 'DELIVERABLE_NOT_FOUND' });
    }
    expect(
      await get.execute({ actor: actors.client(), deliverableId: released.id }),
    ).not.toHaveProperty('consultantId');
    expect(
      await get.execute({ actor: actors.consultant('c1'), deliverableId: hidden.id }),
    ).toHaveProperty('consultantId', 'c1');
    const file = await dl.execute({ actor: actors.client(), deliverableId: released.id });
    expect(file).toEqual({
      content: Buffer.from('bin'),
      fileName: 'rapport.pdf',
      mimeType: 'application/pdf',
    });
    expect((await dl.execute({ actor: actors.admin(), deliverableId: hidden.id })).fileName).toBe(
      'rapport.pdf',
    );
  });
});

describe('validations', () => {
  const setup = () => {
    const ctx = deliverablesTestContext();
    const d = aDeliverable();
    ctx.deliverables.store.set(d.id, d);
    return { ctx, d };
  };

  it('admin (validate-deliverables) releases it and the client is notified', async () => {
    const { ctx, d } = setup();
    const uc = new ValidateDeliverableAsAdminUseCase(ctx.deliverables, ctx.committer, ctx.clock);
    await expect(uc.execute({ actor: actors.admin(), deliverableId: d.id })).rejects.toMatchObject({
      code: 'PERMISSION_REQUIRED',
    });
    const view = await uc.execute({ actor: validator(), deliverableId: d.id });
    expect(view).toMatchObject({ adminValidated: true, adminValidatedAt: NOW });
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
    expect(ctx.bus.names()).toEqual(['deliverables.validated-by-admin']);
    await expect(uc.execute({ actor: validator(), deliverableId: 'x' })).rejects.toMatchObject({
      code: 'DELIVERABLE_NOT_FOUND',
    });
  });

  it('client validates only once released; the author is notified', async () => {
    const { ctx, d } = setup();
    const uc = new ValidateDeliverableAsClientUseCase(ctx.deliverables, ctx.committer, ctx.clock);
    await expect(uc.execute({ actor: actors.client(), deliverableId: d.id })).rejects.toMatchObject(
      { code: 'DELIVERABLE_NOT_FOUND' },
    );
    d.validateByAdmin('admin-1', NOW);
    d.pullDomainEvents();
    const view = await uc.execute({ actor: actors.client(), deliverableId: d.id });
    expect(view).toMatchObject({ clientValidated: true, validatedAt: NOW });
    expect(ctx.notifier.recipients()).toEqual(['c1']);
    await expect(
      uc.execute({ actor: actors.consultant('c1'), deliverableId: d.id }),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });
});
