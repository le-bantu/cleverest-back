import { aContract, NOW, pdf } from '../../testing/in-memory';
import { Contract } from './contract.entity';
import { ContractCreated, ContractSigned } from '../events/contract.events';

const quote = (overrides = {}) => ({
  id: 'q1',
  clientId: 'client-1',
  requestNumber: 'req-001',
  status: 'VALIDÉ_ADMIN',
  isSubquote: false,
  readyForContract: true,
  ...overrides,
});

const create = (overrides: Partial<Parameters<typeof Contract.create>[0]> = {}) =>
  Contract.create(
    {
      id: 'k1',
      quote: quote(),
      originalFile: pdf(),
      createdById: 'admin-1',
      alreadyExists: false,
      ...overrides,
    },
    NOW,
  );

describe('Contract', () => {
  it('is created unsigned from a VALIDÉ_ADMIN quote, owned by the quote client', () => {
    const c = create();
    expect(c).toMatchObject({
      quoteId: 'q1',
      clientId: 'client-1',
      createdById: 'admin-1',
      signed: false,
      signedAt: null,
      signedFile: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(c.originalFile.originalName).toBe('contrat.pdf');
    expect(c.pullDomainEvents()).toEqual([expect.any(ContractCreated)]);
  });

  it('guards the quote state: not VALIDÉ_ADMIN or a subquote → 422 QUOTE_NOT_VALIDATED', () => {
    expect(() => create({ quote: quote({ readyForContract: false, status: 'COTÉ' }) })).toThrow(
      expect.objectContaining({ code: 'QUOTE_NOT_VALIDATED', httpStatus: 422 }),
    );
    expect(() => create({ quote: quote({ isSubquote: true }) })).toThrow(
      expect.objectContaining({ code: 'QUOTE_NOT_VALIDATED' }),
    );
  });

  it('refuses a second contract for the same quote (409)', () => {
    expect(() => create({ alreadyExists: true })).toThrow(
      expect.objectContaining({ code: 'CONTRACT_ALREADY_EXISTS', httpStatus: 409 }),
    );
  });

  it('accepts PDF only', () => {
    expect(() => create({ originalFile: { ...pdf(), originalName: 'c.docx' } })).toThrow(
      expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
    );
  });

  it('is signed once by its client, with the signed file and an event', () => {
    const c = aContract();
    const later = new Date(NOW.getTime() + 1000);
    c.sign('client-1', pdf('signe.pdf'), later);
    expect(c).toMatchObject({ signed: true, signedAt: later, updatedAt: later });
    expect(c.signedFile?.originalName).toBe('signe.pdf');
    expect(c.pullDomainEvents()).toEqual([expect.any(ContractSigned)]);

    expect(() => c.sign('client-1', pdf(), later)).toThrow(
      expect.objectContaining({ code: 'CONTRACT_ALREADY_SIGNED', httpStatus: 409 }),
    );
  });

  it('another client cannot sign (404, no leak); signed file must be a PDF', () => {
    const c = aContract();
    expect(() => c.sign('client-2', pdf(), NOW)).toThrow(
      expect.objectContaining({ code: 'CONTRACT_NOT_FOUND' }),
    );
    expect(() => c.sign('client-1', { ...pdf(), originalName: 'x.png' }, NOW)).toThrow(
      expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
    );
    expect(c.signed).toBe(false);
  });

  it('rehydrates as is', () => {
    const c = aContract({ signed: true });
    const copy = Contract.rehydrate({
      id: c.id,
      quoteId: c.quoteId,
      clientId: c.clientId,
      createdById: null,
      originalFile: c.originalFile,
      signedFile: c.signedFile,
      signed: true,
      signedAt: c.signedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
    expect(copy.equals(c)).toBe(true);
    expect(copy.createdById).toBeNull();
    expect(copy.isOwnedBy('client-1')).toBe(true);
  });
});
