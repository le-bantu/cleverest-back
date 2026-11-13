import { FixedClock, generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  PdfDocumentDefinition,
  PdfGeneratorPort,
} from '@shared/application/ports/pdf-generator.port';
import { FakeAuditLog, FakeEventBus, FakeFileStorage, FakeNotifier } from '@shared/testing/fakes';
import {
  BilledClient,
  BillingDirectoryPort,
  ClientInvoice,
  ClientInvoiceAlreadyExists,
  ClientInvoiceListFilter,
  ClientInvoiceRepository,
  InvoiceNumberTaken,
  MissionForPayment,
  Payment,
  PaymentListFilter,
  PaymentMissionGatewayPort,
  PaymentProps,
  PaymentRepository,
} from '../domain';
import { PaymentCommitter } from '../application/services/payment-services';

export const NOW = new Date('2026-07-01T10:00:00.000Z');

export class InMemoryPaymentRepository extends PaymentRepository {
  readonly store = new Map<string, Payment>();
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<Payment | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  save(payment: Payment): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    this.store.set(payment.id, payment);
    return Promise.resolve();
  }
  list(query: PageQuery, f: PaymentListFilter): Promise<Page<Payment>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (p) =>
        (f.clientId === undefined || p.clientId === f.clientId) &&
        (f.missionId === undefined || p.missionId === f.missionId) &&
        (f.missionIds === undefined || f.missionIds.includes(p.missionId)) &&
        (f.isValidated === undefined || p.isValidated === f.isValidated) &&
        (f.uploadedFrom === undefined || p.createdAt >= f.uploadedFrom) &&
        (f.uploadedTo === undefined || p.createdAt <= f.uploadedTo),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

export class InMemoryClientInvoiceRepository extends ClientInvoiceRepository {
  readonly store = new Map<string, ClientInvoice>();
  /** numbers "taken" by a concurrent writer: the next save with one of them fails */
  readonly stolenNumbers = new Set<string>();
  failNextSave = false;

  nextIdentity(): string {
    return generateUuid();
  }
  findById(id: string): Promise<ClientInvoice | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }
  existsForPayment(paymentId: string): Promise<boolean> {
    return Promise.resolve([...this.store.values()].some((i) => i.paymentId === paymentId));
  }
  lastSequence(year: number): Promise<number> {
    const seqs = [...this.store.values()]
      .map((i) => i.invoiceNumber)
      .filter((n) => n.year === year)
      .map((n) => n.sequence);
    return Promise.resolve(seqs.length ? Math.max(...seqs) : 0);
  }
  save(invoice: ClientInvoice): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('db down'));
    }
    const number = invoice.invoiceNumber.value;
    if (this.stolenNumbers.delete(number)) {
      // simulate the concurrent writer having committed this number
      this.store.set(
        `stolen-${number}`,
        ClientInvoice.rehydrate({
          id: `stolen-${number}`,
          paymentId: `other-${number}`,
          missionId: 'm',
          clientId: 'x',
          invoiceNumber: invoice.invoiceNumber,
          amount: 1,
          pdfFile: invoice.pdfFile,
          generatedAt: invoice.generatedAt,
          generatedById: null,
          sentAt: null,
        }),
      );
      return Promise.reject(new InvoiceNumberTaken(number));
    }
    const other = [...this.store.values()].find(
      (i) => i.id !== invoice.id && i.paymentId === invoice.paymentId,
    );
    if (other) return Promise.reject(new ClientInvoiceAlreadyExists(invoice.paymentId));
    this.store.set(invoice.id, invoice);
    return Promise.resolve();
  }
  list(query: PageQuery, f: ClientInvoiceListFilter): Promise<Page<ClientInvoice>> {
    const { page, perPage } = normalizePageQuery(query);
    const items = [...this.store.values()].filter(
      (i) =>
        (f.clientId === undefined || i.clientId === f.clientId) &&
        (f.missionId === undefined || i.missionId === f.missionId) &&
        (f.sent === undefined || (i.sentAt !== null) === f.sent),
    );
    const start = (page - 1) * perPage;
    return Promise.resolve(
      new Page(items.slice(start, start + perPage), items.length, { page, perPage }),
    );
  }
}

export class FakePaymentMissionGateway extends PaymentMissionGatewayPort {
  readonly missions = new Map<string, MissionForPayment>();
  add(overrides: Partial<MissionForPayment> = {}): MissionForPayment {
    const m: MissionForPayment = {
      id: generateUuid(),
      clientId: 'client-1',
      title: 'Audit fiscal',
      consultantIds: ['c1', 'c2'],
      ...overrides,
    };
    this.missions.set(m.id, m);
    return m;
  }
  findMission(missionId: string): Promise<MissionForPayment | null> {
    return Promise.resolve(this.missions.get(missionId) ?? null);
  }
  missionIdsForConsultant(consultantId: string): Promise<string[]> {
    return Promise.resolve(
      [...this.missions.values()]
        .filter((m) => m.consultantIds.includes(consultantId))
        .map((m) => m.id),
    );
  }
}

export class FakeBillingDirectory extends BillingDirectoryPort {
  readonly clients = new Map<string, BilledClient>([
    ['client-1', { clientId: 'client-1', name: 'ACME SAS', email: 'compta@acme.test' }],
  ]);
  findClient(clientId: string): Promise<BilledClient | null> {
    return Promise.resolve(this.clients.get(clientId) ?? null);
  }
}

export class FakePdfGenerator extends PdfGeneratorPort {
  readonly documents: PdfDocumentDefinition[] = [];
  generate(definition: PdfDocumentDefinition): Promise<Buffer> {
    this.documents.push(definition);
    return Promise.resolve(Buffer.from(`%PDF ${definition.title}`));
  }
}

export const paymentsTestContext = () => {
  const payments = new InMemoryPaymentRepository();
  const invoices = new InMemoryClientInvoiceRepository();
  const missions = new FakePaymentMissionGateway();
  const directory = new FakeBillingDirectory();
  const pdf = new FakePdfGenerator();
  const audit = new FakeAuditLog();
  const bus = new FakeEventBus();
  const notifier = new FakeNotifier();
  const storage = new FakeFileStorage();
  const clock = new FixedClock(NOW);
  const committer = new PaymentCommitter(audit, bus, new BestEffortNotifier(notifier));
  return {
    payments,
    invoices,
    missions,
    directory,
    pdf,
    audit,
    bus,
    notifier,
    storage,
    clock,
    committer,
  };
};

export const aPayment = (overrides: Partial<PaymentProps> = {}): Payment => {
  const id = overrides.id ?? generateUuid();
  return Payment.rehydrate({
    id,
    missionId: 'mission-1',
    clientId: 'client-1',
    amount: 1500,
    proofFile: {
      key: `payments/mission-1/${id}.pdf`,
      originalName: 'virement.pdf',
      mimeType: 'application/pdf',
      size: 10,
    },
    validatedAt: null,
    validatedById: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
};

export const aValidatedPayment = (overrides: Partial<PaymentProps> = {}): Payment =>
  aPayment({ validatedAt: NOW, validatedById: 'admin-1', ...overrides });
