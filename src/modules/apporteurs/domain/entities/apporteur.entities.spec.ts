import { aCommission, aProspect, NOW } from '../../testing/in-memory';
import { Prospect } from './prospect.entity';
import { Commission } from './commission.entity';
import {
  CommissionStatus as C,
  ProspectStatus as P,
  parseCommissionStatus,
} from '../value-objects/statuses';
import {
  CommissionCreated,
  CommissionStatusChanged,
  ProspectConverted,
  ProspectCreated,
  ProspectRejected,
} from '../events/apporteur.events';

const LATER = new Date(NOW.getTime() + 60_000);
const doc = { key: 'k', originalName: 'kbis.pdf', mimeType: 'application/pdf', size: 3 };

describe('Prospect', () => {
  it('is declared by an apporteur, trimmed, email lower-cased, pending', () => {
    const p = Prospect.create(
      {
        id: 'p1',
        apporteurId: 'app-1',
        name: '  Jean Dupont ',
        company: ' ',
        contactEmail: ' Jean@ACME.test ',
        contactPhone: null,
      },
      NOW,
    );
    expect(p).toMatchObject({
      name: 'Jean Dupont',
      company: null,
      displayName: 'Jean Dupont',
      contactEmail: 'jean@acme.test',
      status: P.EN_ATTENTE,
      document: null,
      createdAt: NOW,
    });
    expect(p.pullDomainEvents()).toEqual([expect.any(ProspectCreated)]);
  });

  it('validates name, email and field length', () => {
    const base = { id: 'p', apporteurId: 'a' };
    expect(() => Prospect.create({ ...base, name: ' ' }, NOW)).toThrow(
      expect.objectContaining({ code: 'PROSPECT_NAME_REQUIRED', httpStatus: 422 }),
    );
    expect(() => Prospect.create({ ...base, name: 'x', contactEmail: 'nope' }, NOW)).toThrow(
      expect.objectContaining({ code: 'INVALID_EMAIL' }),
    );
    expect(() => Prospect.create({ ...base, name: 'x'.repeat(256) }, NOW)).toThrow(
      expect.objectContaining({ code: 'PROSPECT_FIELD_TOO_LONG' }),
    );
  });

  it('documents: owner only (404), pending only (409), returns the replaced file', () => {
    const p = aProspect();
    expect(p.attachDocument('app-1', doc, LATER)).toBeNull();
    expect(p.attachDocument('app-1', { ...doc, key: 'k2' }, LATER)).toEqual(doc);
    expect(p.document?.key).toBe('k2');
    expect(() => p.attachDocument('app-2', doc, LATER)).toThrow(
      expect.objectContaining({ code: 'PROSPECT_NOT_FOUND', httpStatus: 404 }),
    );
    expect(() => p.attachDocument('app-1', { ...doc, originalName: 'x.exe' }, LATER)).toThrow(
      expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }),
    );
    p.reject('admin-1', null, LATER);
    expect(() => p.attachDocument('app-1', doc, LATER)).toThrow(
      expect.objectContaining({ code: 'PROSPECT_ALREADY_PROCESSED', httpStatus: 409 }),
    );
  });

  it('convert: EN_ATTENTE → CONVERTI, NOT re-entrant, needs a contact email', () => {
    const p = aProspect();
    expect(p.assertConvertible()).toBe('jean@acme.test');
    p.convert('admin-1', { clientId: 'c1', missionId: 'm1' }, LATER);
    expect(p).toMatchObject({
      status: P.CONVERTI,
      clientId: 'c1',
      missionId: 'm1',
      processedAt: LATER,
      processedById: 'admin-1',
      isOwnedBy: expect.any(Function),
    });
    expect(p.pullDomainEvents()).toEqual([expect.any(ProspectConverted)]);
    expect(() => p.convert('admin-1', { clientId: 'c2', missionId: 'm2' }, LATER)).toThrow(
      expect.objectContaining({ code: 'PROSPECT_ALREADY_PROCESSED', httpStatus: 409 }),
    );
    expect(() => p.reject('admin-1', 'x', LATER)).toThrow(
      expect.objectContaining({ code: 'PROSPECT_ALREADY_PROCESSED' }),
    );
    expect(() => aProspect({ contactEmail: null }).assertConvertible()).toThrow(
      expect.objectContaining({ code: 'PROSPECT_EMAIL_REQUIRED', httpStatus: 422 }),
    );
  });

  it('reject: EN_ATTENTE → REJETÉ with an optional reason', () => {
    const p = aProspect();
    p.reject('admin-1', '  hors cible ', LATER);
    expect(p).toMatchObject({ status: P.REJETE, rejectedReason: 'hors cible', processedAt: LATER });
    expect(p.pullDomainEvents()).toEqual([expect.any(ProspectRejected)]);
    const q = aProspect();
    q.reject('admin-1', undefined, LATER);
    expect(q.rejectedReason).toBeNull();
  });
});

describe('Commission', () => {
  const create = (amount?: number | null) =>
    Commission.createForConversion(
      {
        id: 'k1',
        apporteurId: 'app-1',
        prospectId: 'p1',
        clientId: 'c1',
        missionId: 'm1',
        clientName: 'ACME',
        missionTitle: 'Audit',
        amount,
        actorId: 'admin-1',
      },
      NOW,
    );

  it('is created pending, amount optional', () => {
    const c = create();
    expect(c).toMatchObject({
      status: C.EN_ATTENTE,
      amount: null,
      clientName: 'ACME',
      prospectId: 'p1',
    });
    expect(c.isOwnedBy('app-1')).toBe(true);
    expect(c.pullDomainEvents()).toEqual([expect.any(CommissionCreated)]);
    expect(create(99.999).amount).toBe(100);
    expect(() => create(0)).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
  });

  it('transitions are forward only: EN_ATTENTE → VALIDÉE (amount required) → PAYÉE', () => {
    const c = aCommission();
    expect(() => c.updateStatus(C.VALIDEE, 'a', LATER)).toThrow(
      expect.objectContaining({ code: 'COMMISSION_AMOUNT_REQUIRED', httpStatus: 422 }),
    );
    expect(() => c.updateStatus(C.PAYEE, 'a', LATER)).toThrow(
      expect.objectContaining({ code: 'COMMISSION_TRANSITION_NOT_ALLOWED', httpStatus: 409 }),
    );
    c.setAmount(250, LATER);
    c.updateStatus(C.VALIDEE, 'a', LATER);
    expect(c).toMatchObject({ status: C.VALIDEE, validatedAt: LATER, paidAt: null });
    expect(() => c.setAmount(300, LATER)).toThrow(
      expect.objectContaining({ code: 'COMMISSION_LOCKED', httpStatus: 409 }),
    );
    expect(() => c.updateStatus(C.EN_ATTENTE, 'a', LATER)).toThrow(
      expect.objectContaining({ code: 'COMMISSION_TRANSITION_NOT_ALLOWED' }),
    );
    c.updateStatus(C.PAYEE, 'a', LATER);
    expect(c).toMatchObject({ status: C.PAYEE, paidAt: LATER, updatedAt: LATER });
    expect(c.pullDomainEvents()).toEqual([
      expect.any(CommissionStatusChanged),
      expect.any(CommissionStatusChanged),
    ]);
    expect(() => c.updateStatus(C.PAYEE, 'a', LATER)).toThrow(
      expect.objectContaining({ code: 'COMMISSION_TRANSITION_NOT_ALLOWED' }),
    );
  });

  it('parses statuses (accented values)', () => {
    expect(parseCommissionStatus('VALIDÉE')).toBe(C.VALIDEE);
    expect(() => parseCommissionStatus('VALIDEE')).toThrow(
      expect.objectContaining({ code: 'INVALID_COMMISSION_STATUS', httpStatus: 422 }),
    );
  });
});
