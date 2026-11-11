import {
  aConsultantContract,
  aQuoteForContract,
  aSubquoteForContract,
  NOW,
  pdf,
} from '../../testing/in-memory';
import { ConsultantContract } from './consultant-contract.entity';
import { ConsultantContractCreated, ConsultantContractSigned } from '../events/contract.events';

const LATER = new Date(NOW.getTime() + 60_000);

const create = (overrides: Partial<Parameters<typeof ConsultantContract.create>[0]> = {}) =>
  ConsultantContract.create(
    {
      id: 'cc1',
      quote: aSubquoteForContract({ id: 'sub-1' }),
      consultantId: 'c1',
      originalFile: pdf(),
      createdById: 'admin-1',
      alreadyExists: false,
      ...overrides,
    },
    NOW,
  );

describe('ConsultantContract', () => {
  it('binds the consultant to the subquote they priced, at the subquote price by default', () => {
    const c = create();
    expect(c).toMatchObject({
      quoteId: 'sub-1',
      rootQuoteId: 'main-1',
      consultantId: 'c1',
      amount: 1200,
      createdById: 'admin-1',
      signed: false,
      signedAt: null,
      signedFile: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(c.originalFile.originalName).toBe('contrat.pdf');
    const [event] = c.pullDomainEvents();
    expect(event).toBeInstanceOf(ConsultantContractCreated);
    expect((event as ConsultantContractCreated).data).toEqual({
      quoteId: 'sub-1',
      consultantId: 'c1',
      amount: 1200,
      actorId: 'admin-1',
    });
  });

  it('an explicit amount wins and is rounded to cents', () => {
    expect(create({ amount: 999.999 }).amount).toBe(1000);
    expect(create({ amount: 850.5 }).amount).toBe(850.5);
  });

  it('on a main quote (not split): rootQuoteId = quoteId and the amount is required', () => {
    const main = aQuoteForContract({ id: 'main-9', consultantIds: ['c1', 'c2'] });
    expect(() => create({ quote: main })).toThrow(
      expect.objectContaining({ code: 'AMOUNT_REQUIRED', httpStatus: 422 }),
    );
    const c = create({ quote: main, consultantId: 'c2', amount: 400 });
    expect(c).toMatchObject({ quoteId: 'main-9', rootQuoteId: 'main-9', amount: 400 });
  });

  it('accepts a client-signed main quote (price still validated)', () => {
    const signed = aQuoteForContract({
      status: 'SIGNÉ_CLIENT',
      readyForContract: false,
      priceValidated: true,
    });
    expect(create({ quote: signed, amount: 10 }).signed).toBe(false);
  });

  it('guards: price not validated (422), consultant not on the quote (422), duplicate (409)', () => {
    expect(() =>
      create({ quote: aSubquoteForContract({ status: 'COTÉ', priceValidated: false }) }),
    ).toThrow(expect.objectContaining({ code: 'QUOTE_NOT_VALIDATED', httpStatus: 422 }));
    expect(() => create({ consultantId: 'c9' })).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_NOT_ON_QUOTE', httpStatus: 422 }),
    );
    expect(() => create({ alreadyExists: true })).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_CONTRACT_ALREADY_EXISTS', httpStatus: 409 }),
    );
  });

  it('refuses a non-positive or absurd amount and a non-PDF file', () => {
    for (const amount of [0, -5, Number.NaN, 1e13]) {
      expect(() => create({ amount })).toThrow(
        expect.objectContaining({ code: 'INVALID_AMOUNT', httpStatus: 422 }),
      );
    }
    expect(() => create({ quote: aSubquoteForContract({ price: null }) })).toThrow(
      expect.objectContaining({ code: 'AMOUNT_REQUIRED' }),
    );
    expect(() => create({ originalFile: { ...pdf(), originalName: 'c.docx' } })).toThrow(
      expect.objectContaining({ httpStatus: 422 }),
    );
  });

  it('is signed once, by the bound consultant only', () => {
    const c = aConsultantContract();
    expect(() => c.sign('c2', pdf('s.pdf'), LATER)).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_CONTRACT_NOT_FOUND', httpStatus: 404 }),
    );
    c.sign('c1', pdf('s.pdf'), LATER);
    expect(c).toMatchObject({ signed: true, signedAt: LATER, updatedAt: LATER });
    expect(c.signedFile?.originalName).toBe('s.pdf');
    expect(c.pullDomainEvents()).toEqual([expect.any(ConsultantContractSigned)]);
    expect(() => c.sign('c1', pdf('again.pdf'), LATER)).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_CONTRACT_ALREADY_SIGNED', httpStatus: 409 }),
    );
  });

  it('can be withdrawn while unsigned only', () => {
    expect(() => aConsultantContract().assertDeletable()).not.toThrow();
    expect(() => aConsultantContract({ signed: true }).assertDeletable()).toThrow(
      expect.objectContaining({ code: 'CONSULTANT_CONTRACT_ALREADY_SIGNED' }),
    );
  });

  it('rehydrates without events', () => {
    const c = aConsultantContract({ signed: true });
    const copy = ConsultantContract.rehydrate({
      id: c.id,
      quoteId: c.quoteId,
      rootQuoteId: c.rootQuoteId,
      consultantId: c.consultantId,
      amount: c.amount,
      createdById: null,
      originalFile: c.originalFile,
      signedFile: c.signedFile,
      signedAt: c.signedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
    expect(copy.signed).toBe(true);
    expect(copy.createdById).toBeNull();
    expect(copy.belongsTo('c1')).toBe(true);
    expect(copy.pullDomainEvents()).toEqual([]);
  });
});
