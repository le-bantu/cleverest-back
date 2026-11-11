import {
  ConflictException,
  FixedClock,
  generateUuid,
  normalizePageQuery,
  Page,
  PageQuery,
} from '@shared/kernel';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  FakeAuditLog,
  FakeEventBus,
  FakeFileStorage,
  FakeNotifier,
  FakeUnitOfWork,
} from '@shared/testing/fakes';
import {
  Contract,
  ContractListFilter,
  ContractRepository,
  PendingQuoteSignature,
  QuoteForContract,
  QuoteGatewayPort,
} from '../domain';
import { ContractCommitter } from '../application/services/contract-committer';

export const NOW = new Date('2026-04-01T09:00:00.000Z');

export class InMemoryContractRepository extends ContractRepository {
  readonly store = new Map<string, Contract>();
  saves: Array<{ id: string; tx: unknown }> = [];
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Contract | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  existsForQuote(quoteId: string): Promise<boolean> {
    return Promise.resolve([...this.store.values()].some((c) => c.quoteId === quoteId));
  }
  save(contract: Contract, tx?: unknown): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.saves.push({ id: contract.id, tx });
    this.store.set(contract.id, contract);
    return Promise.resolve();
  }
  list(query: PageQuery, f: ContractListFilter): Promise<Page<Contract>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (c) =>
        (f.clientId === undefined || c.clientId === f.clientId) &&
        (f.quoteId === undefined || c.quoteId === f.quoteId) &&
        (f.signed === undefined || c.signed === f.signed) &&
        (f.dateFrom === undefined || c.createdAt >= f.dateFrom) &&
        (f.dateTo === undefined || c.createdAt <= f.dateTo),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

/** Quotes seen from contracts; signing flips the status when persisted. */
export class FakeQuoteGateway extends QuoteGatewayPort {
  readonly quotes = new Map<string, QuoteForContract>();
  readonly persisted: Array<{ quoteId: string; tx: unknown }> = [];
  finalized: string[] = [];

  add(overrides: Partial<QuoteForContract> = {}): QuoteForContract {
    const quote: QuoteForContract = {
      id: generateUuid(),
      clientId: 'client-1',
      requestNumber: 'req-001',
      status: 'VALIDÉ_ADMIN',
      isSubquote: false,
      readyForContract: true,
      ...overrides,
    };
    this.quotes.set(quote.id, quote);
    return quote;
  }

  findQuote(quoteId: string): Promise<QuoteForContract | null> {
    return Promise.resolve(this.quotes.get(quoteId) ?? null);
  }

  prepareClientSignature(quoteId: string, clientId: string): Promise<PendingQuoteSignature> {
    const quote = this.quotes.get(quoteId);
    if (!quote?.readyForContract || quote.clientId !== clientId) {
      return Promise.reject(new ConflictException('QUOTE_TRANSITION_NOT_ALLOWED', 'nope'));
    }
    return Promise.resolve({
      persist: (tx) => {
        this.persisted.push({ quoteId, tx });
        this.quotes.set(quoteId, { ...quote, status: 'SIGNÉ_CLIENT', readyForContract: false });
        return Promise.resolve();
      },
      finalize: () => {
        this.finalized.push(quoteId);
        return Promise.resolve();
      },
    });
  }
}

export const contractsTestContext = () => {
  const contracts = new InMemoryContractRepository();
  const quotes = new FakeQuoteGateway();
  const uow = new FakeUnitOfWork();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const storage = new FakeFileStorage();
  const clock = new FixedClock(NOW);
  const committer = new ContractCommitter(audit, bus, new BestEffortNotifier(notifier));
  return { contracts, quotes, uow, audit, bus, notifier, storage, clock, committer };
};

export const pdf = (name = 'contrat.pdf') => ({
  key: `contracts/x/${name}`,
  originalName: name,
  mimeType: 'application/pdf',
  size: 1234,
});

export const aContract = (
  overrides: { quote?: Partial<QuoteForContract>; signed?: boolean } = {},
): Contract => {
  const contract = Contract.create(
    {
      id: generateUuid(),
      quote: {
        id: generateUuid(),
        clientId: 'client-1',
        requestNumber: 'req-001',
        status: 'VALIDÉ_ADMIN',
        isSubquote: false,
        readyForContract: true,
        ...overrides.quote,
      },
      originalFile: pdf(),
      createdById: 'admin-1',
      alreadyExists: false,
    },
    NOW,
  );
  if (overrides.signed) contract.sign(contract.clientId, pdf('signe.pdf'), NOW);
  contract.clearDomainEvents();
  return contract;
};
