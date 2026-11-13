import { aPayment, aValidatedPayment, NOW } from '../../testing/in-memory';
import { ClientInvoice } from './client-invoice.entity';
import { InvoiceNumber } from '../value-objects/invoice-number.vo';
import { ClientInvoiceGenerated, ClientInvoiceSent } from '../events/payment.events';

const LATER = new Date(NOW.getTime() + 60_000);
const pdfFile = {
  key: 'client-invoices/i1.pdf',
  originalName: 'FAC-2026-0001.pdf',
  mimeType: 'application/pdf',
  size: 9,
};
const generate = (overrides: Partial<Parameters<typeof ClientInvoice.generateFrom>[0]> = {}) =>
  ClientInvoice.generateFrom(
    {
      id: 'i1',
      payment: aValidatedPayment({ id: 'p1' }),
      invoiceNumber: InvoiceNumber.next(2026, 0),
      pdfFile,
      generatedById: 'admin-1',
      alreadyExists: false,
      ...overrides,
    },
    NOW,
  );

describe('ClientInvoice', () => {
  it('is generated from a validated payment, copying mission, client and amount', () => {
    const i = generate();
    expect(i).toMatchObject({
      paymentId: 'p1',
      missionId: 'mission-1',
      clientId: 'client-1',
      amount: 1500,
      generatedAt: NOW,
      generatedById: 'admin-1',
      sentAt: null,
    });
    expect(i.invoiceNumber.value).toBe('FAC-2026-0001');
    expect(i.pdfFile).toEqual(pdfFile);
    expect(i.isOwnedBy('client-1')).toBe(true);
    expect(i.pullDomainEvents()).toEqual([expect.any(ClientInvoiceGenerated)]);
  });

  it('REFUSES a payment that is not validated (422) and a second invoice (409)', () => {
    expect(() => generate({ payment: aPayment() })).toThrow(
      expect.objectContaining({ code: 'PAYMENT_NOT_VALIDATED', httpStatus: 422 }),
    );
    expect(() => generate({ alreadyExists: true })).toThrow(
      expect.objectContaining({ code: 'CLIENT_INVOICE_ALREADY_EXISTS', httpStatus: 409 }),
    );
  });

  it('markSent records the last delivery and may be repeated', () => {
    const i = generate();
    i.clearDomainEvents();
    i.markSent('admin-1', NOW);
    i.markSent('admin-2', LATER);
    expect(i.sentAt).toEqual(LATER);
    expect(i.pullDomainEvents()).toEqual([
      expect.any(ClientInvoiceSent),
      expect.any(ClientInvoiceSent),
    ]);
  });
});

describe('InvoiceNumber', () => {
  it('is sequential per year, zero-padded, and parses back', () => {
    expect(InvoiceNumber.next(2026, 0).value).toBe('FAC-2026-0001');
    expect(InvoiceNumber.next(2026, 41).value).toBe('FAC-2026-0042');
    expect(InvoiceNumber.next(2026, 9999).value).toBe('FAC-2026-10000');
    const n = InvoiceNumber.of('FAC-2027-0123');
    expect([n.year, n.sequence]).toEqual([2027, 123]);
    expect(InvoiceNumber.prefixFor(2026)).toBe('FAC-2026-');
    expect(InvoiceNumber.of('FAC-2026-0001').equals(InvoiceNumber.next(2026, 0))).toBe(true);
  });

  it('refuses a malformed number', () => {
    for (const bad of ['FAC-26-0001', 'INV-2026-0001', 'FAC-2026-01']) {
      expect(() => InvoiceNumber.of(bad)).toThrow(
        expect.objectContaining({ code: 'INVALID_INVOICE_NUMBER' }),
      );
    }
  });
});
