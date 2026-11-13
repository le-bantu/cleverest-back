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
  ClientOnboardingPort,
  ClosedDealPort,
  ClosedDealRequest,
  Commission,
  CommissionListFilter,
  CommissionProps,
  CommissionRepository,
  CommissionStatus,
  PreparedClient,
  PreparedDeal,
  Prospect,
  ProspectListFilter,
  ProspectProps,
  ProspectRepository,
  ProspectStatus,
} from '../domain';
import { ApporteurCommitter } from '../application/apporteur-services';

export const NOW = new Date('2026-09-01T10:00:00.000Z');

const paginate = <T>(items: T[], query: PageQuery): Page<T> => {
  const { page, perPage } = normalizePageQuery(query);
  const start = (page - 1) * perPage;
  return new Page(items.slice(start, start + perPage), items.length, { page, perPage });
};

export class InMemoryProspectRepository extends ProspectRepository {
  readonly store = new Map<string, Prospect>();
  readonly saves: Array<{ id: string; tx: unknown }> = [];
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Prospect | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  save(prospect: Prospect, tx?: unknown): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.saves.push({ id: prospect.id, tx });
    this.store.set(prospect.id, prospect);
    return Promise.resolve();
  }
  list(query: PageQuery, f: ProspectListFilter): Promise<Page<Prospect>> {
    return Promise.resolve(
      paginate(
        [...this.store.values()].filter(
          (p) =>
            (f.apporteurId === undefined || p.apporteurId === f.apporteurId) &&
            (f.status === undefined || p.status === f.status),
        ),
        query,
      ),
    );
  }
}

export class InMemoryCommissionRepository extends CommissionRepository {
  readonly store = new Map<string, Commission>();
  readonly saves: Array<{ id: string; tx: unknown }> = [];

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Commission | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  save(commission: Commission, tx?: unknown): Promise<void> {
    this.saves.push({ id: commission.id, tx });
    this.store.set(commission.id, commission);
    return Promise.resolve();
  }
  list(query: PageQuery, f: CommissionListFilter): Promise<Page<Commission>> {
    return Promise.resolve(
      paginate(
        [...this.store.values()].filter(
          (c) =>
            (f.apporteurId === undefined || c.apporteurId === f.apporteurId) &&
            (f.status === undefined || c.status === f.status) &&
            (f.missionId === undefined || c.missionId === f.missionId),
        ),
        query,
      ),
    );
  }
}

/** Records what was persisted / finalized, in order. */
export class FakeOnboarding extends ClientOnboardingPort {
  readonly log: string[] = [];
  existing = false;
  prepareClient(input: {
    email: string;
    name: string;
    phone: string | null;
  }): Promise<PreparedClient> {
    this.log.push(`prepare:${input.email}:${input.name}`);
    return Promise.resolve({
      clientId: 'client-new',
      created: !this.existing,
      email: input.email,
      temporaryPassword: this.existing ? null : 'Temp-Pass-123',
      persist: (tx) => {
        this.log.push(`persist-client:${String(!!tx)}`);
        return Promise.resolve();
      },
      finalize: () => {
        this.log.push('finalize-client');
        return Promise.resolve();
      },
    });
  }
}

export class FakeClosedDeal extends ClosedDealPort {
  readonly requests: ClosedDealRequest[] = [];
  readonly log: string[] = [];
  failOnPersist = false;
  prepareDeal(request: ClosedDealRequest): Promise<PreparedDeal> {
    this.requests.push(request);
    return Promise.resolve({
      quoteId: 'quote-new',
      contractId: 'contract-new',
      missionId: 'mission-new',
      persist: (tx) => {
        if (this.failOnPersist) return Promise.reject(new Error('mission insert failed'));
        this.log.push(`persist-deal:${String(!!tx)}`);
        return Promise.resolve();
      },
      finalize: () => {
        this.log.push('finalize-deal');
        return Promise.resolve();
      },
    });
  }
}

export const apporteursTestContext = () => {
  const prospects = new InMemoryProspectRepository();
  const commissions = new InMemoryCommissionRepository();
  const onboarding = new FakeOnboarding();
  const deals = new FakeClosedDeal();
  const uow = new FakeUnitOfWork();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const best = new BestEffortNotifier(notifier);
  const storage = new FakeFileStorage();
  const clock = new FixedClock(NOW);
  const committer = new ApporteurCommitter(audit, bus, best);
  return {
    prospects,
    commissions,
    onboarding,
    deals,
    uow,
    audit,
    bus,
    notifier,
    best,
    storage,
    clock,
    committer,
  };
};

export const aProspect = (overrides: Partial<ProspectProps> = {}): Prospect =>
  Prospect.rehydrate({
    id: overrides.id ?? generateUuid(),
    apporteurId: 'app-1',
    name: 'Jean Dupont',
    company: 'ACME SAS',
    contactEmail: 'jean@acme.test',
    contactPhone: '0600000000',
    document: null,
    status: ProspectStatus.EN_ATTENTE,
    rejectedReason: null,
    clientId: null,
    missionId: null,
    processedAt: null,
    processedById: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

export const aCommission = (overrides: Partial<CommissionProps> = {}): Commission =>
  Commission.rehydrate({
    id: overrides.id ?? generateUuid(),
    apporteurId: 'app-1',
    prospectId: 'p1',
    clientId: 'client-1',
    missionId: 'mission-1',
    clientName: 'ACME SAS',
    missionTitle: 'Audit',
    amount: null,
    status: CommissionStatus.EN_ATTENTE,
    validatedAt: null,
    paidAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
