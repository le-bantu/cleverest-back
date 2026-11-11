import { FixedClock, generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import {
  FakeAuditLog,
  FakeEventBus,
  FakeFileStorage,
  FakeNotifier,
  FakeUnitOfWork,
} from '@shared/testing/fakes';
import {
  ConsultantCandidate,
  ConsultantDirectoryPort,
  ConsultantWorkloadPort,
  Quote,
  QuoteDocument,
  QuoteDocumentRepository,
  QuoteListFilter,
  QuoteRepository,
} from '../domain';
import { QuoteCommitter } from '../application/services/quote-committer';
import { QuoteNotifications } from '../application/services/quote-notifications';
import { NOW } from './builders';

export class InMemoryQuoteRepository extends QuoteRepository {
  readonly store = new Map<string, Quote>();
  /** quotes that have a contract (contracts context projection) */
  readonly contractQuoteIds = new Set<string>();
  saves = 0;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Quote | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  findSubquotes(parentQuoteId: string): Promise<Quote[]> {
    return Promise.resolve(
      [...this.store.values()].filter((q) => q.parentQuoteId === parentQuoteId),
    );
  }
  hasSubquotes(parentQuoteId: string): Promise<boolean> {
    return this.findSubquotes(parentQuoteId).then((s) => s.length > 0);
  }
  save(quote: Quote): Promise<void> {
    this.saves++;
    this.store.set(quote.id, quote);
    return Promise.resolve();
  }
  delete(id: string): Promise<void> {
    this.store.delete(id);
    for (const q of [...this.store.values()]) if (q.parentQuoteId === id) this.store.delete(q.id);
    return Promise.resolve();
  }
  hasContract(quoteId: string): Promise<boolean> {
    return Promise.resolve(this.contractQuoteIds.has(quoteId));
  }
  lastRequestSequence(): Promise<number> {
    const seqs = [...this.store.values()].map((q) => q.requestNumber.sequence);
    return Promise.resolve(seqs.length ? Math.max(...seqs) : 0);
  }
  list(query: PageQuery, f: QuoteListFilter): Promise<Page<Quote>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (q) =>
        (f.clientId === undefined || q.clientId === f.clientId) &&
        (f.consultantId === undefined || q.isAssigned(f.consultantId)) &&
        (f.status === undefined || q.status === f.status) &&
        (f.type === undefined || q.type === f.type) &&
        (f.isSubquote === undefined || q.isSubquote === f.isSubquote) &&
        (f.parentQuoteId === undefined || q.parentQuoteId === f.parentQuoteId) &&
        (f.isValidated === undefined || (q.validatedAt !== null) === f.isValidated) &&
        (f.dateMin === undefined || q.createdAt >= f.dateMin) &&
        (f.dateMax === undefined || q.createdAt <= f.dateMax) &&
        (f.hasContract === undefined || this.contractQuoteIds.has(q.id) === f.hasContract),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

export class InMemoryQuoteDocumentRepository extends QuoteDocumentRepository {
  readonly store = new Map<string, QuoteDocument>();
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<QuoteDocument | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  listByQuote(quoteId: string): Promise<QuoteDocument[]> {
    return Promise.resolve([...this.store.values()].filter((d) => d.quoteId === quoteId));
  }
  save(document: QuoteDocument): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.store.set(document.id, document);
    return Promise.resolve();
  }
  delete(id: string): Promise<void> {
    this.store.delete(id);
    return Promise.resolve();
  }
}

export {
  FakeAuditLog,
  FakeEventBus,
  FakeFileStorage,
  FakeNotifier,
  FakeUnitOfWork,
} from '@shared/testing/fakes';

export class FakeConsultantDirectory extends ConsultantDirectoryPort {
  constructor(public consultants: ConsultantCandidate[] = []) {
    super();
  }
  listConsultants(): Promise<ConsultantCandidate[]> {
    return Promise.resolve([...this.consultants]);
  }
  findConsultantsByIds(ids: readonly string[]): Promise<ConsultantCandidate[]> {
    return Promise.resolve(this.consultants.filter((c) => ids.includes(c.consultantId)));
  }
}

export class FakeConsultantWorkload extends ConsultantWorkloadPort {
  constructor(public loads = new Map<string, number>()) {
    super();
  }
  currentLoad(): Promise<Map<string, number>> {
    return Promise.resolve(new Map(this.loads));
  }
}

export const consultant = (id: string, expertiseDomains: string[] = [], validated = true) => ({
  consultantId: id,
  name: id.toUpperCase(),
  expertiseDomains,
  validated,
});

export const actor = {
  client: (userId = 'client-1'): ActorContext => ({ userId, roles: ['client'], permissions: [] }),
  consultant: (userId = 'c1'): ActorContext => ({ userId, roles: ['consultant'], permissions: [] }),
  admin: (
    permissions = ['manage-quotes', 'assign-consultants'],
    userId = 'admin-1',
  ): ActorContext => ({
    userId,
    roles: ['admin'],
    permissions,
  }),
  bareAdmin: (userId = 'admin-2'): ActorContext => ({ userId, roles: ['admin'], permissions: [] }),
  apporteur: (userId = 'app-1'): ActorContext => ({
    userId,
    roles: ['apporteur'],
    permissions: [],
  }),
};

/** Everything a quotes use case may need, wired with in-memory fakes. */
export const quotesTestContext = () => {
  const quotes = new InMemoryQuoteRepository();
  const documents = new InMemoryQuoteDocumentRepository();
  const uow = new FakeUnitOfWork();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const storage = new FakeFileStorage();
  const directory = new FakeConsultantDirectory([
    consultant('c1'),
    consultant('c2'),
    consultant('c3'),
  ]);
  const workload = new FakeConsultantWorkload();
  const clock = new FixedClock(NOW);
  const committer = new QuoteCommitter(quotes, uow, audit, bus);
  const notifications = new QuoteNotifications(notifier);
  return {
    quotes,
    documents,
    uow,
    audit,
    bus,
    notifier,
    storage,
    directory,
    workload,
    clock,
    committer,
    notifications,
  };
};
