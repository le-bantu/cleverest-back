import { ValidationException } from '@shared/kernel';
import { Money } from './money.vo';
import { RequestNumber } from './request-number.vo';
import { SlaDeadline } from './sla-deadline.vo';
import { parseQuoteType, QuoteType } from './quote-type.vo';
import {
  isTerminalQuoteStatus,
  parseQuoteStatus,
  QuoteActor,
  quoteActorFromRoles,
  QuoteStatus,
} from './quote-status.vo';
import { DocumentVisibility, VisibleTo } from './document-visibility.vo';

describe('Money', () => {
  it('rounds to cents and defaults to EUR', () => {
    const m = Money.of(10.005);
    expect(m.amount).toBe(10.01);
    expect(m.currency).toBe('EUR');
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e13])('rejects %p', (amount) => {
    expect(() => Money.of(amount)).toThrow(ValidationException);
  });
  it('rejects a malformed currency', () => {
    expect(() => Money.of(1, 'eur')).toThrow(ValidationException);
  });
  it('rejects a non-number', () => {
    expect(() => Money.of('12' as unknown as number)).toThrow(ValidationException);
  });
  it('is equal by value', () => {
    expect(Money.of(5).equals(Money.of(5))).toBe(true);
  });
});

describe('RequestNumber', () => {
  it('pads to 3 digits and exposes its sequence', () => {
    const n = RequestNumber.fromSequence(7);
    expect(n.value).toBe('req-007');
    expect(n.toString()).toBe('req-007');
    expect(n.sequence).toBe(7);
  });
  it('grows past 999', () => {
    expect(RequestNumber.fromSequence(1000).value).toBe('req-1000');
  });
  it('parses valid values and rejects others', () => {
    expect(RequestNumber.create('req-042').sequence).toBe(42);
    expect(() => RequestNumber.create('REQ-1')).toThrow(ValidationException);
    expect(() => RequestNumber.fromSequence(0)).toThrow(ValidationException);
    expect(() => RequestNumber.fromSequence(1.5)).toThrow(ValidationException);
  });
});

describe('SlaDeadline', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  it('computes hours from now and detects exceedance', () => {
    const d = SlaDeadline.hoursFrom(now, 24);
    expect(d.date.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(d.isExceeded(now)).toBe(false);
    expect(d.isExceeded(new Date('2026-01-02T00:00:01.000Z'))).toBe(true);
  });
  it('rejects invalid dates', () => {
    expect(() => SlaDeadline.at(new Date('nope'))).toThrow(ValidationException);
  });
});

describe('QuoteType / QuoteStatus helpers', () => {
  it('parses known values only', () => {
    expect(parseQuoteType('ABONNEMENT')).toBe(QuoteType.ABONNEMENT);
    expect(() => parseQuoteType('ponctuel')).toThrow(ValidationException);
    expect(parseQuoteStatus('COTÉ')).toBe(QuoteStatus.COTE);
    expect(() => parseQuoteStatus('ACCEPTÉ')).toThrow(ValidationException);
  });
  it('keeps the legacy accented values', () => {
    expect(QuoteStatus.VALIDE_ADMIN).toBe('VALIDÉ_ADMIN');
    expect(QuoteStatus.SIGNE_CLIENT).toBe('SIGNÉ_CLIENT');
    expect(QuoteStatus.REJETE).toBe('REJETÉ');
  });
  it('knows terminal statuses', () => {
    expect(isTerminalQuoteStatus(QuoteStatus.SIGNE_CLIENT)).toBe(true);
    expect(isTerminalQuoteStatus(QuoteStatus.REJETE)).toBe(true);
    expect(isTerminalQuoteStatus(QuoteStatus.COTE)).toBe(false);
  });
  it('maps roles to actors (superadmin acts as admin)', () => {
    expect(quoteActorFromRoles(['superadmin'])).toBe(QuoteActor.ADMIN);
    expect(quoteActorFromRoles(['admin'])).toBe(QuoteActor.ADMIN);
    expect(quoteActorFromRoles(['consultant'])).toBe(QuoteActor.CONSULTANT);
    expect(quoteActorFromRoles(['client'])).toBe(QuoteActor.CLIENT);
    expect(quoteActorFromRoles(['apporteur'])).toBeNull();
  });
});

describe('DocumentVisibility', () => {
  const parties = { clientId: 'client-1', consultantIds: ['c1', 'c2'] };
  const client = { userId: 'client-1', actor: QuoteActor.CLIENT };
  const otherClient = { userId: 'client-2', actor: QuoteActor.CLIENT };
  const c1 = { userId: 'c1', actor: QuoteActor.CONSULTANT };
  const outsider = { userId: 'c9', actor: QuoteActor.CONSULTANT };
  const admin = { userId: 'a', actor: QuoteActor.ADMIN };

  it.each<[VisibleTo, string[], boolean, boolean, boolean, boolean]>([
    // visibleTo, users, client, consultant c1, outsider consultant, other client
    [VisibleTo.ALL, [], true, true, false, false],
    [VisibleTo.CLIENT, [], true, false, false, false],
    [VisibleTo.CONSULTANT, [], false, true, false, false],
    [VisibleTo.ADMIN, [], false, false, false, false],
    [VisibleTo.SPECIFIC, ['c1'], false, true, false, false],
    [VisibleTo.SPECIFIC, ['client-1'], true, false, false, false],
    [VisibleTo.SPECIFIC, ['c9'], false, false, false, false],
  ])('%s %j → client=%s c1=%s outsider=%s other=%s', (to, users, cl, co, out, oth) => {
    const v = DocumentVisibility.create(to, users);
    expect(v.allows(client, parties)).toBe(cl);
    expect(v.allows(c1, parties)).toBe(co);
    expect(v.allows(outsider, parties)).toBe(out);
    expect(v.allows(otherClient, parties)).toBe(oth);
    expect(v.allows(admin, parties)).toBe(true);
  });

  it('dedupes SPECIFIC users and drops them for other modes', () => {
    expect(DocumentVisibility.create('SPECIFIC', ['a', 'a', 'b']).userIds).toEqual(['a', 'b']);
    expect(DocumentVisibility.create('ALL', ['a']).userIds).toEqual([]);
  });
  it('requires users for SPECIFIC and rejects unknown modes', () => {
    expect(() => DocumentVisibility.create('SPECIFIC', [])).toThrow(ValidationException);
    expect(() => DocumentVisibility.create('PUBLIC')).toThrow(ValidationException);
  });
  it('defaults to the uploader audience', () => {
    expect(DocumentVisibility.defaultFor(QuoteActor.ADMIN).visibleTo).toBe(VisibleTo.ADMIN);
    expect(DocumentVisibility.defaultFor(QuoteActor.CLIENT).visibleTo).toBe(VisibleTo.CLIENT);
    expect(DocumentVisibility.defaultFor(QuoteActor.CONSULTANT).visibleTo).toBe(
      VisibleTo.CONSULTANT,
    );
  });
});
