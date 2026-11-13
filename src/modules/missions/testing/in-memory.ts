import { FixedClock, generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  FakeAuditLog,
  FakeEventBus,
  FakeFileStorage,
  FakeNotifier,
  FakeUnitOfWork,
} from '@shared/testing/fakes';
import {
  ContractForMission,
  ContractGatewayPort,
  Mission,
  MissionAssignment,
  MissionListFilter,
  MissionProps,
  MissionRepository,
  MissionStatus,
  MissionTask,
  MissionTaskStatus,
  QuoteTeamPort,
} from '../domain';
import { MissionCommitter } from '../application/services/mission-committer';

export const NOW = new Date('2026-05-01T08:00:00.000Z');

export class InMemoryMissionRepository extends MissionRepository {
  readonly store = new Map<string, Mission>();
  saves = 0;
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Mission | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  idsForConsultant(consultantId: string): Promise<string[]> {
    return Promise.resolve(
      [...this.store.values()].filter((m) => m.isAssigned(consultantId)).map((m) => m.id),
    );
  }
  save(mission: Mission): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.saves++;
    this.store.set(mission.id, mission);
    return Promise.resolve();
  }
  list(query: PageQuery, f: MissionListFilter): Promise<Page<Mission>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (m) =>
        (f.clientId === undefined || m.clientId === f.clientId) &&
        (f.consultantId === undefined || m.isAssigned(f.consultantId)) &&
        (f.status === undefined || m.status === f.status) &&
        (f.title === undefined || m.title.toLowerCase().includes(f.title.toLowerCase())) &&
        (f.contractId === undefined || m.contractId === f.contractId) &&
        (f.deliveryDateFrom === undefined ||
          (m.deliveryDate !== null && m.deliveryDate >= f.deliveryDateFrom)) &&
        (f.deliveryDateTo === undefined ||
          (m.deliveryDate !== null && m.deliveryDate <= f.deliveryDateTo)),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

export class FakeContractGateway extends ContractGatewayPort {
  readonly contracts = new Map<string, ContractForMission>();
  add(overrides: Partial<ContractForMission> = {}): ContractForMission {
    const c: ContractForMission = {
      id: generateUuid(),
      quoteId: 'quote-1',
      clientId: 'client-1',
      signed: true,
      ...overrides,
    };
    this.contracts.set(c.id, c);
    return c;
  }
  findContract(contractId: string): Promise<ContractForMission | null> {
    return Promise.resolve(this.contracts.get(contractId) ?? null);
  }
}

export class FakeQuoteTeam extends QuoteTeamPort {
  readonly leads = new Map<string, string>();
  consultants = new Set(['c1', 'c2', 'c3']);
  leadConsultantOf(quoteId: string): Promise<string | null> {
    return Promise.resolve(this.leads.get(quoteId) ?? null);
  }
  existingConsultants(ids: readonly string[]): Promise<string[]> {
    return Promise.resolve(ids.filter((id) => this.consultants.has(id)));
  }
}

export const missionsTestContext = () => {
  const missions = new InMemoryMissionRepository();
  const contracts = new FakeContractGateway();
  const team = new FakeQuoteTeam();
  const uow = new FakeUnitOfWork();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const storage = new FakeFileStorage();
  const clock = new FixedClock(NOW);
  const committer = new MissionCommitter(missions, audit, bus, new BestEffortNotifier(notifier));
  return { missions, contracts, team, uow, audit, bus, notifier, storage, clock, committer };
};

/** Mission in any state, without replaying the workflow. */
export const aMission = (
  overrides: Partial<Omit<MissionProps, 'consultants' | 'tasks'>> & {
    consultants?: MissionAssignment[];
    /** task statuses, assigned to `taskAssignee` */
    tasks?: MissionTaskStatus[];
    taskAssignee?: string | null;
  } = {},
): Mission => {
  const id = overrides.id ?? generateUuid();
  const { tasks: taskStatuses = [], taskAssignee = null, ...rest } = overrides;
  return Mission.rehydrate({
    id,
    contractId: 'contract-1',
    quoteId: 'quote-1',
    clientId: 'client-1',
    title: 'Audit fiscal',
    description: null,
    status: MissionStatus.EN_COURS,
    progress: 0,
    deliveryDate: null,
    contractFile: {
      key: `missions/${id}/contract.pdf`,
      originalName: 'mission.pdf',
      mimeType: 'application/pdf',
      size: 10,
    },
    consultants: [
      { consultantId: 'c1', isLead: true },
      { consultantId: 'c2', isLead: false },
    ],
    createdById: 'admin-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...rest,
    tasks: taskStatuses.map((status, i) =>
      MissionTask.rehydrate({
        id: `t${i + 1}`,
        missionId: id,
        title: `Tâche ${i + 1}`,
        description: null,
        order: i + 1,
        status,
        assigneeConsultantId: taskAssignee,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ),
  });
};
