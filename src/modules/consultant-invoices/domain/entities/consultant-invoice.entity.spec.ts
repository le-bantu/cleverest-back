import { aConsultantInvoice, NOW } from '../../testing/in-memory';
import { ConsultantInvoice } from './consultant-invoice.entity';
import {
  ConsultantInvoicePaid,
  ConsultantInvoiceSubmitted,
} from '../events/consultant-invoice.events';

const LATER = new Date(NOW.getTime() + 60_000);
const mission = { id: 'm1', quoteId: 'q1', consultantIds: ['c1'] };
const file = { key: 'k', originalName: 'facture.pdf', mimeType: 'application/pdf', size: 3 };
const submit = (overrides: Partial<Parameters<typeof ConsultantInvoice.submit>[0]> = {}) =>
  ConsultantInvoice.submit(
    {
      id: 'i1',
      mission,
      consultantId: 'c1',
      commitment: { signedAmount: 1000, alreadyInvoiced: 300 },
      file,
      ...overrides,
    },
    NOW,
  );

describe('ConsultantInvoice', () => {
  it('defaults to what remains on the contract, unpaid', () => {
    const i = submit();
    expect(i).toMatchObject({
      consultantId: 'c1',
      missionId: 'm1',
      quoteId: 'q1',
      amount: 700,
      uploadedAt: NOW,
      isPaid: false,
      paidAt: null,
      paidById: null,
    });
    expect(i.file).toEqual(file);
    expect(i.pullDomainEvents()).toEqual([expect.any(ConsultantInvoiceSubmitted)]);
  });

  it('accepts a partial amount up to the remainder (cent precision)', () => {
    expect(submit({ amount: 250.5 }).amount).toBe(250.5);
    expect(
      submit({ amount: 0.1, commitment: { signedAmount: 0.3, alreadyInvoiced: 0.2 } }).amount,
    ).toBe(0.1);
  });

  it('guards: not assigned 404, no signed contract 403, fully invoiced 409, too much 422', () => {
    expect(() => submit({ consultantId: 'c9' })).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_FOUND', httpStatus: 404 }),
    );
    expect(() => submit({ commitment: { signedAmount: null, alreadyInvoiced: 0 } })).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_CONTRACT_NOT_SIGNED', httpStatus: 403 }),
    );
    expect(() => submit({ commitment: { signedAmount: 500, alreadyInvoiced: 500 } })).toThrow(
      expect.objectContaining({ code: 'CONTRACT_FULLY_INVOICED', httpStatus: 409 }),
    );
    expect(() => submit({ amount: 700.01 })).toThrow(
      expect.objectContaining({ code: 'INVOICE_EXCEEDS_CONTRACT', httpStatus: 422 }),
    );
    expect(() => submit({ amount: -1 })).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT' }),
    );
    expect(() => submit({ file: { ...file, originalName: 'f.docx' } })).toThrow(
      expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
    );
  });

  it('is visible to its author and admins only', () => {
    const i = aConsultantInvoice();
    expect(i.isVisibleTo({ userId: 'x', kind: 'ADMIN' })).toBe(true);
    expect(i.isVisibleTo({ userId: 'c1', kind: 'CONSULTANT' })).toBe(true);
    expect(i.isVisibleTo({ userId: 'c2', kind: 'CONSULTANT' })).toBe(false);
    expect(i.isVisibleTo({ userId: 'c1', kind: 'CLIENT' })).toBe(false);
  });

  it('is marked paid once', () => {
    const i = aConsultantInvoice();
    i.markPaid('admin-1', LATER);
    expect(i).toMatchObject({ isPaid: true, paidAt: LATER, paidById: 'admin-1' });
    expect(i.pullDomainEvents()).toEqual([expect.any(ConsultantInvoicePaid)]);
    expect(() => i.markPaid('admin-1', LATER)).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_INVOICE_ALREADY_PAID', httpStatus: 409 }),
    );
  });
});
