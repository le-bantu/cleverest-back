import { aPayment, NOW } from '../../testing/in-memory';
import { Payment } from './payment.entity';
import { PaymentSubmitted, PaymentValidated } from '../events/payment.events';

const LATER = new Date(NOW.getTime() + 60_000);
const mission = { id: 'm1', clientId: 'client-1', title: 'Audit', consultantIds: ['c1'] };
const proof = { key: 'k', originalName: 'virement.png', mimeType: 'image/png', size: 5 };
const submit = (overrides: Partial<Parameters<typeof Payment.submit>[0]> = {}) =>
  Payment.submit(
    { id: 'p1', mission, clientId: 'client-1', amount: 1234.567, proofFile: proof, ...overrides },
    NOW,
  );

describe('Payment', () => {
  it('is declared by the mission owner, pending, amount rounded to cents', () => {
    const p = submit();
    expect(p).toMatchObject({
      missionId: 'm1',
      clientId: 'client-1',
      amount: 1234.57,
      isValidated: false,
      validatedAt: null,
      validatedById: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(p.proofFile).toEqual(proof);
    expect(p.isOwnedBy('client-1')).toBe(true);
    expect(p.pullDomainEvents()).toEqual([expect.any(PaymentSubmitted)]);
  });

  it("refuses another client's mission (404), a bad amount, a bad proof type", () => {
    expect(() => submit({ clientId: 'intruder' })).toThrow(
      expect.objectContaining({ code: 'MISSION_NOT_FOUND', httpStatus: 404 }),
    );
    expect(() => submit({ amount: 0 })).toThrow(
      expect.objectContaining({ code: 'INVALID_AMOUNT', httpStatus: 422 }),
    );
    expect(() => submit({ proofFile: { ...proof, originalName: 'x.exe' } })).toThrow(
      expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
    );
  });

  it('is validated once by an admin', () => {
    const p = aPayment();
    p.validate('admin-1', LATER);
    expect(p).toMatchObject({
      isValidated: true,
      validatedAt: LATER,
      validatedById: 'admin-1',
      updatedAt: LATER,
    });
    const [event] = p.pullDomainEvents();
    expect(event).toBeInstanceOf(PaymentValidated);
    expect((event as PaymentValidated).data).toMatchObject({ actorId: 'admin-1', amount: 1500 });
    expect(() => p.validate('admin-2', LATER)).toThrow(
      expect.objectContaining({ code: 'PAYMENT_ALREADY_VALIDATED', httpStatus: 409 }),
    );
  });
});
