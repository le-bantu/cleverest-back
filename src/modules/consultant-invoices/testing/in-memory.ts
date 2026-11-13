import {
  FixedClock,
  generateUuid,
  normalizePageQuery,
  Page,
  PageQuery,
  sumAmounts,
} from '@shared/kernel';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { FakeAuditLog, FakeEventBus, FakeFileStorage, FakeNotifier } from '@shared/testing/fakes';
import {
  ConsultantCommitmentPort,
  ConsultantInvoice,
  ConsultantInvoiceListFilter,
  ConsultantInvoiceProps,
  ConsultantInvoiceRepository,
  InvoiceMissionGatewayPort,
  MissionForInvoice,
} from '../domain';
import { ConsultantInvoiceCommitter } from '../application/consultant-invoice-services';

export const NOW = new Date('2026-08-01T10:00:00.000Z');

export class InMemoryConsultantInvoiceRepository extends ConsultantInvoiceRepository {
  readonly store = new Map<string, ConsultantInvoice>();
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<ConsultantInvoice | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  totalInvoiced(consultantId: string, quoteId: string): Promise<number> {
    return Promise.resolve(
      sumAmounts(
        [...this.store.values()]
          .filter((i) => i.consultantId === consultantId && i.quoteId === quoteId)
          .map((i) => i.amount),
      ),
    );
  }
  save(invoice: ConsultantInvoice): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.store.set(invoice.id, invoice);
    return Promise.resolve();
  }
  list(query: PageQuery, f: ConsultantInvoiceListFilter): Promise<Page<ConsultantInvoice>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (i) =>
        (f.consultantId === undefined || i.consultantId === f.consultantId) &&
        (f.missionId === undefined || i.missionId === f.missionId) &&
        (f.isPaid === undefined || i.isPaid === f.isPaid) &&
        (f.uploadedFrom === undefined || i.uploadedAt >= f.uploadedFrom) &&
        (f.uploadedTo === undefined || i.uploadedAt <= f.uploadedTo),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

export class FakeInvoiceMissionGateway extends InvoiceMissionGatewayPort {
  readonly missions = new Map<string, MissionForInvoice>();
  add(overrides: Partial<MissionForInvoice> = {}): MissionForInvoice {
    const m: MissionForInvoice = {
      id: generateUuid(),
      quoteId: 'quote-1',
      consultantIds: ['c1', 'c2'],
      ...overrides,
    };
    this.missions.set(m.id, m);
    return m;
  }
  findMission(missionId: string): Promise<MissionForInvoice | null> {
    return Promise.resolve(this.missions.get(missionId) ?? null);
  }
}

/** Signed amounts keyed by `consultantId:quoteId`; absent = no signed contract. */
export class FakeCommitments extends ConsultantCommitmentPort {
  readonly amounts = new Map<string, number>([['c1:quote-1', 1000]]);
  signedAmount(consultantId: string, quoteId: string): Promise<number | null> {
    return Promise.resolve(this.amounts.get(`${consultantId}:${quoteId}`) ?? null);
  }
}

export const consultantInvoicesTestContext = () => {
  const invoices = new InMemoryConsultantInvoiceRepository();
  const missions = new FakeInvoiceMissionGateway();
  const commitments = new FakeCommitments();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const storage = new FakeFileStorage();
  const clock = new FixedClock(NOW);
  const committer = new ConsultantInvoiceCommitter(
    invoices,
    audit,
    bus,
    new BestEffortNotifier(notifier),
  );
  return { invoices, missions, commitments, audit, bus, notifier, storage, clock, committer };
};

export const aConsultantInvoice = (
  overrides: Partial<ConsultantInvoiceProps> = {},
): ConsultantInvoice => {
  const id = overrides.id ?? generateUuid();
  return ConsultantInvoice.rehydrate({
    id,
    consultantId: 'c1',
    missionId: 'mission-1',
    quoteId: 'quote-1',
    amount: 400,
    file: {
      key: `consultant-invoices/mission-1/${id}.pdf`,
      originalName: 'facture.pdf',
      mimeType: 'application/pdf',
      size: 10,
    },
    uploadedAt: NOW,
    paidAt: null,
    paidById: null,
    ...overrides,
  });
};
