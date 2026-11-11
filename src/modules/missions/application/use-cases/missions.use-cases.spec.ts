import { actors, incomingFile } from '@shared/testing/fakes';
import { MissionStatus as S, MissionTaskStatus as T } from '../../domain';
import { aMission, missionsTestContext, NOW } from '../../testing/in-memory';
import { CreateMissionUseCase } from './create-mission.use-case';
import { ListMissionsUseCase } from './list-missions.use-case';
import { GetMissionUseCase } from './get-mission.use-case';
import { AssignMissionConsultantsUseCase } from './assign-mission-consultants.use-case';
import { RespondToAssignmentUseCase } from './respond-to-assignment.use-case';
import { UpdateMissionProgressUseCase } from './update-mission-progress.use-case';
import { DownloadMissionContractUseCase } from './download-mission-contract.use-case';
import {
  AddMissionTaskUseCase,
  DeleteMissionTaskUseCase,
  ListMissionTasksUseCase,
  ReorderMissionTasksUseCase,
  UpdateMissionTaskUseCase,
} from './mission-tasks.use-cases';
import { MissionsFacade } from '../missions.facade';

const manager = () => actors.admin(['manage-quotes']);
const staffer = () => actors.admin(['assign-consultants']);

describe('CreateMissionUseCase', () => {
  const setup = () => {
    const ctx = missionsTestContext();
    const uc = new CreateMissionUseCase(
      ctx.missions,
      ctx.contracts,
      ctx.storage,
      ctx.committer,
      ctx.clock,
    );
    return { ctx, uc };
  };
  const input = (contractId: string) => ({
    actor: manager(),
    contractId,
    title: 'Audit',
    deliveryDate: new Date('2026-06-30'),
    contractFile: incomingFile('mission.docx'),
  });

  it('opens a mission on a signed contract: file stored, audited CREATED, client notified', async () => {
    const { ctx, uc } = setup();
    const contract = ctx.contracts.add();
    const view = await uc.execute(input(contract.id));
    expect(view).toMatchObject({
      contractId: contract.id,
      quoteId: 'quote-1',
      clientId: 'client-1',
      status: S.EN_ATTENTE,
      progress: 0,
      progressMode: 'MANUAL',
      contractFileName: 'mission.docx',
      consultants: [],
      createdAt: NOW,
    });
    expect(ctx.storage.files.has(`missions/${view.id}/contract.docx`)).toBe(true);
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({ entity: 'Mission', action: 'CREATED', toStatus: 'EN_ATTENTE' }),
    ]);
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
    expect(ctx.bus.names()).toEqual(['missions.mission-created']);
  });

  it('unsigned contract → 422, unknown contract → 404, no permission → 403; nothing stored', async () => {
    const { ctx, uc } = setup();
    const unsigned = ctx.contracts.add({ signed: false });
    await expect(uc.execute(input(unsigned.id))).rejects.toMatchObject({
      code: 'CONTRACT_NOT_SIGNED',
    });
    await expect(uc.execute(input('nope'))).rejects.toMatchObject({ code: 'CONTRACT_NOT_FOUND' });
    await expect(
      uc.execute({ ...input(ctx.contracts.add().id), actor: actors.admin() }),
    ).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    expect(ctx.storage.files.size).toBe(0);
  });

  it('removes the stored file when the save fails', async () => {
    const { ctx, uc } = setup();
    ctx.missions.failNextSave = true;
    await expect(uc.execute(input(ctx.contracts.add().id))).rejects.toThrow('db down');
    expect(ctx.storage.files.size).toBe(0);
  });
});

describe('List / Get missions — scoped by audience', () => {
  const setup = () => {
    const ctx = missionsTestContext();
    const mine = aMission({ title: 'Audit fiscal', deliveryDate: new Date('2026-06-01') });
    const other = aMission({
      clientId: 'client-2',
      title: 'Paie',
      contractId: 'contract-2',
      status: S.EN_ATTENTE,
      consultants: [{ consultantId: 'c3', isLead: true }],
    });
    ctx.missions.store.set(mine.id, mine);
    ctx.missions.store.set(other.id, other);
    return { ctx, mine, other };
  };

  it('consultant: assigned missions with isLead; client: own, without consultants; admin: all', async () => {
    const { ctx, mine, other } = setup();
    const uc = new ListMissionsUseCase(ctx.missions);
    const c1 = await uc.execute({ actor: actors.consultant('c1') });
    expect(c1.data).toEqual([expect.objectContaining({ id: mine.id, isLead: true })]);
    const c2 = await uc.execute({ actor: actors.consultant('c2') });
    expect(c2.data[0]).toMatchObject({ isLead: false });
    const client = await uc.execute({ actor: actors.client() });
    expect(client.data.map((m) => m.id)).toEqual([mine.id]);
    expect(client.data[0]).not.toHaveProperty('consultants');
    const all = await uc.execute({ actor: actors.admin() });
    expect(all.meta.total).toBe(2);
    expect(all.data[0]).not.toHaveProperty('isLead');

    const ids = async (f: object) =>
      (await uc.execute({ actor: actors.admin(), ...f })).data.map((m) => m.id);
    expect(await ids({ status: 'EN_ATTENTE' })).toEqual([other.id]);
    expect(await ids({ title: ' fisc ' })).toEqual([mine.id]);
    expect(await ids({ contractId: 'contract-2' })).toEqual([other.id]);
    expect(
      await ids({
        deliveryDateFrom: new Date('2026-05-01'),
        deliveryDateTo: new Date('2026-07-01'),
      }),
    ).toEqual([mine.id]);
    await expect(uc.execute({ actor: actors.admin(), status: 'DONE' })).rejects.toMatchObject({
      code: 'INVALID_MISSION_STATUS',
    });
    await expect(uc.execute({ actor: actors.apporteur() })).rejects.toMatchObject({
      httpStatus: 403,
    });
  });

  it('get: 404 for a non-assigned consultant or another client', async () => {
    const { ctx, mine } = setup();
    const uc = new GetMissionUseCase(ctx.missions);
    expect(await uc.execute({ actor: actors.client(), missionId: mine.id })).toMatchObject({
      id: mine.id,
    });
    expect(await uc.execute({ actor: actors.admin(), missionId: mine.id })).toHaveProperty(
      'consultants',
    );
    for (const actor of [actors.consultant('c3'), actors.client('client-2')]) {
      await expect(uc.execute({ actor, missionId: mine.id })).rejects.toMatchObject({
        code: 'MISSION_NOT_FOUND',
      });
    }
    await expect(uc.execute({ actor: actors.admin(), missionId: 'x' })).rejects.toMatchObject({
      code: 'MISSION_NOT_FOUND',
    });
    const tasked = aMission({ tasks: [T.FAITE, T.A_FAIRE], progress: 50 });
    ctx.missions.store.set(tasked.id, tasked);
    expect(await uc.execute({ actor: actors.admin(), missionId: tasked.id })).toMatchObject({
      progressMode: 'TASKS',
      taskCount: 2,
      tasksDone: 1,
      progress: 50,
    });
  });

  it('the facade exposes a summary for deliverables', async () => {
    const { ctx, mine, other } = setup();
    const facade = new MissionsFacade(ctx.missions);
    expect(await facade.findSummary(mine.id)).toEqual({
      id: mine.id,
      clientId: 'client-1',
      consultantIds: ['c1', 'c2'],
      status: S.EN_COURS,
      active: true,
    });
    expect((await facade.findSummary(other.id))?.active).toBe(false);
    expect(await facade.findSummary('x')).toBeNull();
  });
});

describe('AssignMissionConsultantsUseCase', () => {
  const setup = () => {
    const ctx = missionsTestContext();
    const m = aMission({ status: S.EN_ATTENTE, consultants: [] });
    ctx.missions.store.set(m.id, m);
    ctx.team.leads.set('quote-1', 'c2');
    const uc = new AssignMissionConsultantsUseCase(
      ctx.missions,
      ctx.team,
      ctx.committer,
      ctx.clock,
    );
    return { ctx, m, uc };
  };

  it('lead pre-filled from the quote lead; newly assigned consultants notified', async () => {
    const { ctx, m, uc } = setup();
    const view = await uc.execute({
      actor: staffer(),
      missionId: m.id,
      consultants: [{ id: 'c1' }, { id: 'c2' }],
    });
    expect(view.leadConsultantId).toBe('c2');
    expect(ctx.notifier.recipients().sort()).toEqual(['c1', 'c2']);
    expect(ctx.missions.saves).toBe(1);
  });

  it('unknown consultant → 422; missing permission → 403; unknown mission → 404', async () => {
    const { ctx, m, uc } = setup();
    await expect(
      uc.execute({ actor: staffer(), missionId: m.id, consultants: [{ id: 'ghost' }] }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_CONSULTANT', details: { ids: ['ghost'] } });
    await expect(
      uc.execute({ actor: manager(), missionId: m.id, consultants: [{ id: 'c1' }] }),
    ).rejects.toMatchObject({ code: 'PERMISSION_REQUIRED' });
    await expect(
      uc.execute({ actor: staffer(), missionId: 'x', consultants: [{ id: 'c1' }] }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
    expect(ctx.missions.saves).toBe(0);
  });
});

describe('RespondToAssignment / UpdateMissionProgress', () => {
  const setup = (status = S.EN_ATTENTE) => {
    const ctx = missionsTestContext();
    const m = aMission({ status });
    ctx.missions.store.set(m.id, m);
    return { ctx, m };
  };

  it('lead accepts → EN_COURS (audited, client notified); non-lead 403; outsider 404', async () => {
    const { ctx, m } = setup();
    const uc = new RespondToAssignmentUseCase(ctx.missions, ctx.committer, ctx.clock);
    await expect(
      uc.execute({ actor: actors.consultant('c2'), missionId: m.id, action: 'accept' }),
    ).rejects.toMatchObject({ code: 'MISSION_LEAD_REQUIRED', httpStatus: 403 });
    await expect(
      uc.execute({ actor: actors.consultant('c9'), missionId: m.id, action: 'accept' }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: m.id, action: 'maybe' as never }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });

    const view = await uc.execute({
      actor: actors.consultant('c1'),
      missionId: m.id,
      action: 'accept',
    });
    expect(view).toMatchObject({ status: S.EN_COURS, isLead: true });
    expect(ctx.audit.entries).toEqual([
      expect.objectContaining({
        action: 'STATUS_CHANGED',
        fromStatus: 'EN_ATTENTE',
        toStatus: 'EN_COURS',
      }),
    ]);
    expect(ctx.notifier.recipients()).toEqual(['client-1']);
  });

  it('lead refuses → REJETÉE', async () => {
    const { ctx, m } = setup();
    const uc = new RespondToAssignmentUseCase(ctx.missions, ctx.committer, ctx.clock);
    const view = await uc.execute({
      actor: actors.consultant('c1'),
      missionId: m.id,
      action: 'refuse',
    });
    expect(view.status).toBe(S.REJETEE);
  });

  it('progress: manual without tasks; 409 with tasks; admins cannot use it', async () => {
    const { ctx, m } = setup(S.EN_COURS);
    const uc = new UpdateMissionProgressUseCase(ctx.missions, ctx.committer, ctx.clock);
    const view = await uc.execute({
      actor: actors.consultant('c2'),
      missionId: m.id,
      progress: 55,
      status: 'EN_VALIDATION',
    });
    expect(view).toMatchObject({ progress: 55, status: S.EN_VALIDATION });

    const withTasks = aMission({ tasks: [T.A_FAIRE] });
    ctx.missions.store.set(withTasks.id, withTasks);
    await expect(
      uc.execute({ actor: actors.consultant('c1'), missionId: withTasks.id, progress: 10 }),
    ).rejects.toMatchObject({ code: 'PROGRESS_COMPUTED_FROM_TASKS', httpStatus: 409 });
    const statusOnly = await uc
      .execute({
        actor: actors.consultant('c1'),
        missionId: withTasks.id,
        progress: null,
      })
      .catch((e: { code: string }) => e.code);
    expect(statusOnly).toBe('NOTHING_TO_UPDATE');
    await expect(
      uc.execute({ actor: actors.superadmin(), missionId: m.id, progress: 1 }),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });
});

describe('DownloadMissionContractUseCase', () => {
  it('assigned consultant or admin; client refused; missing file → 404', async () => {
    const ctx = missionsTestContext();
    const m = aMission();
    ctx.missions.store.set(m.id, m);
    ctx.storage.files.set(m.contractFile!.key, Buffer.from('doc'));
    const uc = new DownloadMissionContractUseCase(ctx.missions, ctx.storage);
    expect((await uc.execute({ actor: actors.consultant('c2'), missionId: m.id })).fileName).toBe(
      'mission.pdf',
    );
    expect((await uc.execute({ actor: actors.admin(), missionId: m.id })).content.toString()).toBe(
      'doc',
    );
    await expect(uc.execute({ actor: actors.client(), missionId: m.id })).rejects.toMatchObject({
      httpStatus: 403,
    });
    const bare = aMission({ contractFile: null });
    ctx.missions.store.set(bare.id, bare);
    await expect(uc.execute({ actor: actors.admin(), missionId: bare.id })).rejects.toMatchObject({
      code: 'MISSION_CONTRACT_NOT_FOUND',
    });
  });
});

describe('mission tasks use cases', () => {
  const setup = () => {
    const ctx = missionsTestContext();
    const m = aMission();
    ctx.missions.store.set(m.id, m);
    const deps = [ctx.missions, ctx.committer, ctx.clock] as const;
    return {
      ctx,
      m,
      add: new AddMissionTaskUseCase(...deps),
      update: new UpdateMissionTaskUseCase(...deps),
      remove: new DeleteMissionTaskUseCase(...deps),
      reorder: new ReorderMissionTasksUseCase(...deps),
      list: new ListMissionTasksUseCase(ctx.missions),
    };
  };

  it('lead creates 3 tasks, consultant completes 2 → progress 67; ordered list for every audience', async () => {
    const { ctx, m, add, update, list } = setup();
    const lead = actors.consultant('c1');
    const tasks = [];
    for (const title of ['Collecte', 'Analyse', 'Rapport']) {
      tasks.push(
        await add.execute({ actor: lead, missionId: m.id, title, assigneeConsultantId: 'c2' }),
      );
    }
    expect(tasks.map((t) => t.order)).toEqual([1, 2, 3]);
    for (const t of tasks.slice(0, 2)) {
      await update.execute({
        actor: actors.consultant('c2'),
        missionId: m.id,
        taskId: t.id,
        status: 'FAITE',
      });
    }
    expect(ctx.missions.store.get(m.id)?.progress).toBe(67);
    for (const actor of [actors.client(), actors.admin(), actors.consultant('c2')]) {
      expect((await list.execute({ actor, missionId: m.id })).map((t) => t.title)).toEqual([
        'Collecte',
        'Analyse',
        'Rapport',
      ]);
    }
    await expect(
      list.execute({ actor: actors.client('client-2'), missionId: m.id }),
    ).rejects.toMatchObject({ code: 'MISSION_NOT_FOUND' });
  });

  it('reorder and delete are lead-only; a bad status is 422', async () => {
    const { m, add, update, remove, reorder } = setup();
    const lead = actors.consultant('c1');
    const a = await add.execute({ actor: lead, missionId: m.id, title: 'A' });
    const b = await add.execute({ actor: lead, missionId: m.id, title: 'B', order: 1 });
    expect(
      (await reorder.execute({ actor: lead, missionId: m.id, orderedTaskIds: [a.id, b.id] })).map(
        (t) => t.title,
      ),
    ).toEqual(['A', 'B']);
    await expect(
      remove.execute({ actor: actors.consultant('c2'), missionId: m.id, taskId: a.id }),
    ).rejects.toMatchObject({ code: 'MISSION_LEAD_REQUIRED' });
    await remove.execute({ actor: lead, missionId: m.id, taskId: a.id });
    await expect(
      update.execute({ actor: lead, missionId: m.id, taskId: b.id, status: 'DONE' }),
    ).rejects.toMatchObject({ code: 'INVALID_TASK_STATUS' });
    const renamed = await update.execute({
      actor: lead,
      missionId: m.id,
      taskId: b.id,
      title: 'B2',
    });
    expect(renamed).toMatchObject({ title: 'B2', order: 1 });
    await expect(
      add.execute({ actor: actors.admin(), missionId: m.id, title: 'x' }),
    ).rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });
});
