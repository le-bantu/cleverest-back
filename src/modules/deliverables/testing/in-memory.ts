import { FixedClock, generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { FakeEventBus, FakeFileStorage, FakeNotifier, FakeAuditLog } from '@shared/testing/fakes';
import {
  Deliverable,
  DeliverableListFilter,
  DeliverableProps,
  DeliverableRepository,
  MissionForDeliverable,
  MissionGatewayPort,
  ConsultantEngagementPort,
} from '../domain';
import { DeliverableCommitter } from '../application/deliverable-services';

export const NOW = new Date('2026-06-01T10:00:00.000Z');

export class InMemoryDeliverableRepository extends DeliverableRepository {
  readonly store = new Map<string, Deliverable>();
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Deliverable | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  save(deliverable: Deliverable): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.store.set(deliverable.id, deliverable);
    return Promise.resolve();
  }
  list(query: PageQuery, f: DeliverableListFilter): Promise<Page<Deliverable>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (d) =>
        (f.consultantId === undefined || d.consultantId === f.consultantId) &&
        (f.clientId === undefined || d.clientId === f.clientId) &&
        (f.missionId === undefined || d.missionId === f.missionId) &&
        (f.clientValidated === undefined || d.clientValidated === f.clientValidated) &&
        (f.adminValidated === undefined || d.adminValidated === f.adminValidated) &&
        (f.uploadedFrom === undefined || d.uploadedAt >= f.uploadedFrom) &&
        (f.uploadedTo === undefined || d.uploadedAt <= f.uploadedTo),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

export class FakeMissionGateway extends MissionGatewayPort {
  readonly missions = new Map<string, MissionForDeliverable>();
  add(overrides: Partial<MissionForDeliverable> = {}): MissionForDeliverable {
    const m: MissionForDeliverable = {
      id: generateUuid(),
      quoteId: 'quote-1',
      clientId: 'client-1',
      consultantIds: ['c1', 'c2'],
      status: 'EN_COURS',
      active: true,
      ...overrides,
    };
    this.missions.set(m.id, m);
    return m;
  }
  findMission(missionId: string): Promise<MissionForDeliverable | null> {
    return Promise.resolve(this.missions.get(missionId) ?? null);
  }
}

/** Every consultant is engaged unless listed in `unsigned`. */
export class FakeConsultantEngagement extends ConsultantEngagementPort {
  readonly unsigned = new Set<string>();
  readonly calls: Array<{ consultantId: string; quoteId: string }> = [];
  isEngaged(consultantId: string, quoteId: string): Promise<boolean> {
    this.calls.push({ consultantId, quoteId });
    return Promise.resolve(!this.unsigned.has(consultantId));
  }
}

export const deliverablesTestContext = () => {
  const deliverables = new InMemoryDeliverableRepository();
  const missions = new FakeMissionGateway();
  const engagement = new FakeConsultantEngagement();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const storage = new FakeFileStorage();
  const clock = new FixedClock(NOW);
  const audit = new FakeAuditLog();
  const committer = new DeliverableCommitter(
    deliverables,
    bus,
    new BestEffortNotifier(notifier),
    audit,
  );
  return { deliverables, missions, engagement, bus, notifier, storage, clock, committer, audit };
};

export const aDeliverable = (overrides: Partial<DeliverableProps> = {}): Deliverable => {
  const id = overrides.id ?? generateUuid();
  return Deliverable.rehydrate({
    id,
    missionId: 'mission-1',
    consultantId: 'c1',
    clientId: 'client-1',
    file: {
      key: `deliverables/mission-1/${id}.pdf`,
      originalName: 'rapport.pdf',
      mimeType: 'application/pdf',
      size: 10,
    },
    uploadedAt: NOW,
    clientValidated: false,
    clientValidatedAt: null,
    adminValidated: false,
    adminValidatedAt: null,
    adminValidatedById: null,
    ...overrides,
  });
};
