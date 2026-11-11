import { aMission, NOW } from '../../testing/in-memory';
import { Mission } from './mission.entity';
import { MissionTask } from './mission-task.entity';
import {
  ALL_MISSION_STATUSES,
  MISSION_TRANSITIONS,
  MissionStatus as S,
  MissionTaskStatus as T,
  parseMissionStatus,
  parseTaskStatus,
} from '../value-objects/mission-status.vo';
import {
  ConsultantsAssignedToMission,
  MissionCreated,
  MissionStatusChanged,
} from '../events/mission.events';

const LATER = new Date(NOW.getTime() + 60_000);
const contract = (signed = true) => ({ id: 'k1', quoteId: 'q1', clientId: 'cl1', signed });
const file = (originalName = 'mission.docx') => ({
  key: 'k',
  originalName,
  mimeType: null,
  size: 5,
});

describe('Mission — creation', () => {
  it('is opened from a signed contract, EN_ATTENTE at 0 %, owned by the contract client', () => {
    const m = Mission.create(
      {
        id: 'm1',
        contract: contract(),
        title: '  Audit  ',
        description: ' ',
        deliveryDate: LATER,
        contractFile: file(),
        createdById: 'admin-1',
      },
      NOW,
    );
    expect(m).toMatchObject({
      contractId: 'k1',
      quoteId: 'q1',
      clientId: 'cl1',
      title: 'Audit',
      description: null,
      status: S.EN_ATTENTE,
      progress: 0,
      progressMode: 'MANUAL',
      deliveryDate: LATER,
      leadConsultantId: null,
      createdById: 'admin-1',
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(m.contractFile?.originalName).toBe('mission.docx');
    expect(m.pullDomainEvents()).toEqual([expect.any(MissionCreated)]);
  });

  it('refuses an unsigned contract (422 CONTRACT_NOT_SIGNED), a bad title or file type', () => {
    const base = {
      id: 'm1',
      contract: contract(),
      title: 'x',
      contractFile: null,
      createdById: 'a',
    };
    expect(() => Mission.create({ ...base, contract: contract(false) }, NOW)).toThrow(
      expect.objectContaining({ code: 'CONTRACT_NOT_SIGNED', httpStatus: 422 }),
    );
    expect(() => Mission.create({ ...base, title: '  ' }, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_TITLE_REQUIRED' }),
    );
    expect(() => Mission.create({ ...base, title: 'x'.repeat(256) }, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_TITLE_TOO_LONG' }),
    );
    expect(() => Mission.create({ ...base, contractFile: file('a.exe') }, NOW)).toThrow(
      expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
    );
    expect(Mission.create(base, NOW).contractFile).toBeNull();
  });
});

describe('Mission — staffing', () => {
  const fresh = () => aMission({ status: S.EN_ATTENTE, consultants: [] });

  it('lead pre-filled from the quote lead when no explicit lead', () => {
    const m = fresh();
    m.assignConsultants(
      [
        { consultantId: 'c1', isLead: false },
        { consultantId: 'c2', isLead: false },
      ],
      'c2',
      'admin-1',
      LATER,
    );
    expect(m.leadConsultantId).toBe('c2');
    const [event] = m.pullDomainEvents();
    expect(event).toBeInstanceOf(ConsultantsAssignedToMission);
    expect((event as ConsultantsAssignedToMission).data).toEqual({
      consultantIds: ['c1', 'c2'],
      newlyAssignedIds: ['c1', 'c2'],
      leadId: 'c2',
      actorId: 'admin-1',
    });
    expect(m.updatedAt).toEqual(LATER);
  });

  it('lead priority: explicit > current lead still on team > quote lead > first', () => {
    const m = fresh();
    m.assignConsultants([{ consultantId: 'c1', isLead: false }], 'ghost', 'a', NOW);
    expect(m.leadConsultantId).toBe('c1'); // first
    m.assignConsultants(
      [
        { consultantId: 'c3', isLead: false },
        { consultantId: 'c1', isLead: false },
      ],
      'c3',
      'a',
      NOW,
    );
    expect(m.leadConsultantId).toBe('c1'); // current kept
    m.assignConsultants(
      [
        { consultantId: 'c3', isLead: false },
        { consultantId: 'c1', isLead: true },
      ],
      'c3',
      'a',
      NOW,
    );
    expect(m.leadConsultantId).toBe('c1');
    m.assignConsultants(
      [
        { consultantId: 'c3', isLead: true },
        { consultantId: 'c1', isLead: false },
      ],
      null,
      'a',
      NOW,
    );
    expect(m.leadConsultantId).toBe('c3'); // explicit
    const events = m.pullDomainEvents() as ConsultantsAssignedToMission[];
    expect(events[1].data.newlyAssignedIds).toEqual(['c3']);
  });

  it('validates the team', () => {
    const m = fresh();
    expect(() => m.assignConsultants([], null, 'a', NOW)).toThrow(
      expect.objectContaining({ code: 'CONSULTANTS_REQUIRED' }),
    );
    expect(() =>
      m.assignConsultants(
        [
          { consultantId: 'c1', isLead: false },
          { consultantId: 'c1', isLead: false },
        ],
        null,
        'a',
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_CONSULTANT' }));
    expect(() =>
      m.assignConsultants(
        [
          { consultantId: 'c1', isLead: true },
          { consultantId: 'c2', isLead: true },
        ],
        null,
        'a',
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'MULTIPLE_LEADS' }));
  });

  it('re-staffing a REJETÉE mission re-opens it; a TERMINÉE one is closed (409)', () => {
    const rejected = aMission({ status: S.REJETEE });
    rejected.assignConsultants([{ consultantId: 'c3', isLead: false }], null, 'a', NOW);
    expect(rejected.status).toBe(S.EN_ATTENTE);
    expect(rejected.pullDomainEvents()[0]).toBeInstanceOf(MissionStatusChanged);

    const done = aMission({ status: S.TERMINEE });
    expect(() =>
      done.assignConsultants([{ consultantId: 'c1', isLead: false }], null, 'a', NOW),
    ).toThrow(expect.objectContaining({ code: 'MISSION_CLOSED', httpStatus: 409 }));
  });

  it('removing a consultant un-assigns their tasks', () => {
    const m = aMission({ tasks: [T.A_FAIRE], taskAssignee: 'c2' });
    m.assignConsultants([{ consultantId: 'c1', isLead: false }], null, 'a', LATER);
    expect(m.tasks[0].assigneeConsultantId).toBeNull();
  });
});

describe('Mission — respondToAssignment', () => {
  it('lead accepts → EN_COURS, refuses → REJETÉE (with a status event)', () => {
    const accepted = aMission({ status: S.EN_ATTENTE });
    accepted.respondToAssignment('c1', true, LATER);
    expect(accepted.status).toBe(S.EN_COURS);
    const [event] = accepted.pullDomainEvents() as MissionStatusChanged[];
    expect(event.data).toEqual({
      from: S.EN_ATTENTE,
      to: S.EN_COURS,
      actorId: 'c1',
      clientId: 'client-1',
    });

    const refused = aMission({ status: S.EN_ATTENTE });
    refused.respondToAssignment('c1', false, LATER);
    expect(refused.status).toBe(S.REJETEE);
  });

  it('non-lead → 403, not assigned → 403, already answered → 409', () => {
    const m = aMission({ status: S.EN_ATTENTE });
    expect(() => m.respondToAssignment('c2', true, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_LEAD_REQUIRED', httpStatus: 403 }),
    );
    expect(() => m.respondToAssignment('ghost', true, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_ASSIGNED', httpStatus: 403 }),
    );
    const started = aMission();
    expect(() => started.respondToAssignment('c1', true, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_TRANSITION_NOT_ALLOWED', httpStatus: 409 }),
    );
  });
});

describe('Mission — progress', () => {
  it('manual progress + status for an assigned consultant when there is no task', () => {
    const m = aMission();
    m.updateProgress('c2', { progress: 40 }, LATER);
    expect(m.progress).toBe(40);
    m.updateProgress('c2', { progress: 80, status: S.EN_VALIDATION }, LATER);
    expect(m).toMatchObject({ progress: 80, status: S.EN_VALIDATION });
    m.updateProgress('c2', { status: S.EN_VALIDATION }, LATER); // same status: no-op
    m.updateProgress('c2', { status: S.TERMINEE }, LATER);
    expect(m).toMatchObject({ status: S.TERMINEE, progress: 100 });
  });

  it('manual progress is refused (409) once the mission has tasks', () => {
    const m = aMission({ tasks: [T.A_FAIRE] });
    expect(() => m.updateProgress('c1', { progress: 50 }, NOW)).toThrow(
      expect.objectContaining({ code: 'PROGRESS_COMPUTED_FROM_TASKS', httpStatus: 409 }),
    );
    // a status change alone is still possible
    m.updateProgress('c1', { status: S.EN_VALIDATION }, NOW);
    expect(m.status).toBe(S.EN_VALIDATION);
  });

  it('TERMINÉE needs every task done', () => {
    const m = aMission({ tasks: [T.FAITE, T.EN_COURS] });
    expect(() => m.updateProgress('c1', { status: S.TERMINEE }, NOW)).toThrow(
      expect.objectContaining({ code: 'TASKS_NOT_DONE' }),
    );
    const done = aMission({ tasks: [T.FAITE, T.FAITE], progress: 100 });
    done.updateProgress('c1', { status: S.TERMINEE }, NOW);
    expect(done.status).toBe(S.TERMINEE);
  });

  it.each([
    [{ progress: 101 }, 'INVALID_PROGRESS'],
    [{ progress: -1 }, 'INVALID_PROGRESS'],
    [{ progress: 1.5 }, 'INVALID_PROGRESS'],
    [{}, 'NOTHING_TO_UPDATE'],
    [{ progress: null, status: null }, 'NOTHING_TO_UPDATE'],
    [{ status: S.EN_ATTENTE }, 'MISSION_TRANSITION_NOT_ALLOWED'],
  ])('refuses %o with %s', (update, code) => {
    expect(() => aMission().updateProgress('c1', update, NOW)).toThrow(
      expect.objectContaining({ code }),
    );
  });

  it('only on a mission in progress, by an assigned consultant', () => {
    expect(() =>
      aMission({ status: S.EN_ATTENTE }).updateProgress('c1', { progress: 5 }, NOW),
    ).toThrow(expect.objectContaining({ code: 'MISSION_NOT_IN_PROGRESS', httpStatus: 409 }));
    expect(() => aMission().updateProgress('ghost', { progress: 5 }, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_ASSIGNED' }),
    );
  });
});

describe('Mission — tasks', () => {
  it('progress = round(100 × done / total), recomputed on every change', () => {
    const m = aMission({ progress: 10 });
    const t1 = m.addTask('c1', { id: 'a', title: 'Collecte' }, LATER);
    expect(m.progressMode).toBe('TASKS');
    expect(m.progress).toBe(0);
    const t2 = m.addTask('c1', { id: 'b', title: 'Analyse', assigneeConsultantId: 'c2' }, LATER);
    m.addTask('c1', { id: 'c', title: 'Rapport' }, LATER);
    m.updateTask('c1', t1.id, { status: T.FAITE }, LATER);
    expect(m.progress).toBe(33);
    m.updateTask('c2', t2.id, { status: T.FAITE }, LATER); // assignee: status of own task
    expect(m.progress).toBe(67);
    m.deleteTask('c1', 'c', LATER);
    expect(m.progress).toBe(100);
    expect(m.tasks.map((t) => [t.id, t.order])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('inserts at a given order and moves / reorders contiguously', () => {
    const m = aMission({ tasks: [T.A_FAIRE, T.A_FAIRE, T.A_FAIRE] });
    m.addTask('c1', { id: 'first', title: 'Kick-off', order: 1 }, LATER);
    expect(m.tasks.map((t) => t.id)).toEqual(['first', 't1', 't2', 't3']);
    m.addTask('c1', { id: 'last', title: 'Fin', order: 99 }, LATER);
    expect(m.tasks.at(-1)?.order).toBe(5);
    m.updateTask('c1', 't3', { order: 2, title: 'Synthèse', description: ' d ' }, LATER);
    expect(m.tasks.map((t) => t.id)).toEqual(['first', 't3', 't1', 't2', 'last']);
    expect(m.tasks[1]).toMatchObject({ title: 'Synthèse', description: 'd', updatedAt: LATER });
    m.reorderTasks('c1', ['last', 't2', 't1', 't3', 'first'], LATER);
    expect(m.tasks.map((t) => [t.id, t.order])).toEqual([
      ['last', 1],
      ['t2', 2],
      ['t1', 3],
      ['t3', 4],
      ['first', 5],
    ]);
  });

  it('reorder must list every task exactly once; order must be positive', () => {
    const m = aMission({ tasks: [T.A_FAIRE, T.A_FAIRE] });
    for (const ids of [['t1'], ['t1', 't1'], ['t1', 'x']]) {
      expect(() => m.reorderTasks('c1', ids, NOW)).toThrow(
        expect.objectContaining({ code: 'INVALID_TASK_ORDER' }),
      );
    }
    expect(() => m.updateTask('c1', 't1', { order: 0 }, NOW)).toThrow(
      expect.objectContaining({ code: 'INVALID_TASK_ORDER' }),
    );
  });

  it('lead-only operations; assignee may only change the status of their own task', () => {
    const m = aMission({ tasks: [T.A_FAIRE], taskAssignee: 'c2' });
    expect(() => m.addTask('c2', { id: 'x', title: 'x' }, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_LEAD_REQUIRED' }),
    );
    expect(() => m.deleteTask('c2', 't1', NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_LEAD_REQUIRED' }),
    );
    expect(() => m.reorderTasks('c2', ['t1'], NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_LEAD_REQUIRED' }),
    );
    expect(() => m.updateTask('c2', 't1', { title: 'hack' }, NOW)).toThrow(
      expect.objectContaining({ code: 'TASK_UPDATE_FORBIDDEN', httpStatus: 403 }),
    );
    const other = aMission({ tasks: [T.A_FAIRE], taskAssignee: 'c1' });
    expect(() => other.updateTask('c2', 't1', { status: T.FAITE }, NOW)).toThrow(
      expect.objectContaining({ code: 'TASK_UPDATE_FORBIDDEN' }),
    );
    expect(() => m.updateTask('ghost', 't1', { status: T.FAITE }, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_ASSIGNED' }),
    );
  });

  it('assignee must be on the mission; unknown task 404; closed missions refuse edits', () => {
    const m = aMission({ tasks: [T.A_FAIRE] });
    expect(() =>
      m.addTask('c1', { id: 'x', title: 'x', assigneeConsultantId: 'ghost' }, NOW),
    ).toThrow(expect.objectContaining({ code: 'ASSIGNEE_NOT_ON_MISSION' }));
    expect(() => m.updateTask('c1', 't1', { assigneeConsultantId: 'ghost' }, NOW)).toThrow(
      expect.objectContaining({ code: 'ASSIGNEE_NOT_ON_MISSION' }),
    );
    m.updateTask('c1', 't1', { assigneeConsultantId: null }, NOW);
    expect(() => m.updateTask('c1', 'nope', { status: T.FAITE }, NOW)).toThrow(
      expect.objectContaining({ code: 'MISSION_TASK_NOT_FOUND', httpStatus: 404 }),
    );
    expect(() => m.addTask('c1', { id: 'x', title: ' ' }, NOW)).toThrow(
      expect.objectContaining({ code: 'TASK_TITLE_REQUIRED' }),
    );
    expect(() => m.addTask('c1', { id: 'x', title: 'x'.repeat(256) }, NOW)).toThrow(
      expect.objectContaining({ code: 'TASK_TITLE_TOO_LONG' }),
    );
    expect(() =>
      m.addTask('c1', { id: 'x', title: 'x', description: 'd'.repeat(5001) }, NOW),
    ).toThrow(expect.objectContaining({ code: 'TASK_DESCRIPTION_TOO_LONG' }));

    for (const status of [S.TERMINEE, S.REJETEE]) {
      const closed = aMission({ status, tasks: [T.A_FAIRE] });
      expect(() => closed.addTask('c1', { id: 'x', title: 'x' }, NOW)).toThrow(
        expect.objectContaining({ code: 'MISSION_CLOSED' }),
      );
    }
    expect(() =>
      aMission({ status: S.TERMINEE, tasks: [T.FAITE] }).updateTask(
        'c1',
        't1',
        { status: T.A_FAIRE },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'MISSION_CLOSED' }));
  });

  it('tasks can be planned before the lead accepts', () => {
    const m = aMission({ status: S.EN_ATTENTE });
    m.addTask('c1', { id: 'x', title: 'Préparation' }, NOW);
    expect(m.tasks).toHaveLength(1);
  });
});

describe('mission status VO', () => {
  it('TERMINÉE is terminal and every status has a transition entry', () => {
    expect(MISSION_TRANSITIONS[S.TERMINEE]).toEqual([]);
    expect(Object.keys(MISSION_TRANSITIONS).sort()).toEqual([...ALL_MISSION_STATUSES].sort());
  });
  it('parses statuses', () => {
    expect(parseMissionStatus('TERMINÉE')).toBe(S.TERMINEE);
    expect(() => parseMissionStatus('DONE')).toThrow(
      expect.objectContaining({ code: 'INVALID_MISSION_STATUS' }),
    );
    expect(parseTaskStatus('FAITE')).toBe(T.FAITE);
    expect(() => parseTaskStatus('x')).toThrow(
      expect.objectContaining({ code: 'INVALID_TASK_STATUS' }),
    );
  });
  it('MissionTask.create cleans its fields', () => {
    const t = MissionTask.create({
      id: 't',
      missionId: 'm',
      title: ' A ',
      description: '  ',
      order: 1,
      status: T.A_FAIRE,
      assigneeConsultantId: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(t).toMatchObject({ title: 'A', description: null, missionId: 'm', isDone: false });
    expect(t.createdAt).toEqual(NOW);
  });
});
