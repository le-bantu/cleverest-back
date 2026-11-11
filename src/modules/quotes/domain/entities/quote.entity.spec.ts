import { ForbiddenException, ValidationException } from '@shared/kernel';
import { aQuote, adminRef, clientRef, consultantRef, NOW } from '../../testing/builders';
import { ConflictException } from '@shared/kernel';
import { DeadlineExceeded, QuoteTransitionNotAllowed } from '../errors';
import { Money } from '../value-objects/money.vo';
import { QuoteStatus as S } from '../value-objects/quote-status.vo';
import { QuoteType } from '../value-objects/quote-type.vo';
import { RequestNumber } from '../value-objects/request-number.vo';
import { Quote } from './quote.entity';
import {
  ConsultantsAssignedToQuote,
  QuoteCreated,
  QuoteSplit,
  QuoteStatusChanged,
} from '../events/quote.events';

const later = (hours: number) => new Date(NOW.getTime() + hours * 3600_000);
const names = (q: Quote) => q.pullDomainEvents().map((e) => e.name);

describe('Quote.create', () => {
  it('starts EN_ATTENTE with a 24h admin SLA and emits QuoteCreated', () => {
    const q = Quote.create(
      {
        id: 'q1',
        clientId: 'client-1',
        requestNumber: RequestNumber.fromSequence(3),
        type: QuoteType.ABONNEMENT,
        title: '  Mon titre ',
        description: ' desc ',
      },
      'client-1',
      NOW,
    );
    expect(q.status).toBe(S.EN_ATTENTE);
    expect(q.title).toBe('Mon titre');
    expect(q.description).toBe('desc');
    expect(q.isSubquote).toBe(false);
    expect(q.parentQuoteId).toBeNull();
    expect(q.requestNumber.value).toBe('req-003');
    expect(q.adminDeadline?.toISOString()).toBe(later(24).toISOString());
    expect(q.consultantDeadline).toBeNull();
    expect(q.isAdminDeadlineExceeded(later(25))).toBe(true);
    const events = q.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(QuoteCreated);
    expect(events[0].payload).toMatchObject({ status: S.EN_ATTENTE, actorId: 'client-1' });
  });

  it('validates description and title', () => {
    const base = {
      id: 'q',
      clientId: 'c',
      requestNumber: RequestNumber.fromSequence(1),
      type: QuoteType.CONSULTATION,
    };
    expect(() => Quote.create({ ...base, description: '   ' }, 'c', NOW)).toThrow(
      ValidationException,
    );
    expect(() =>
      Quote.create({ ...base, description: 'x', title: 'a'.repeat(256) }, 'c', NOW),
    ).toThrow(ValidationException);
    expect(Quote.create({ ...base, description: 'x', title: '  ' }, 'c', NOW).title).toBeNull();
  });
});

describe('Quote access rules', () => {
  const q = aQuote().withClient('client-1').withConsultants('c1').build();
  it('admin sees everything, client only own, consultant only assigned', () => {
    expect(q.canBeAccessedBy(adminRef())).toBe(true);
    expect(q.canBeAccessedBy(clientRef('client-1'))).toBe(true);
    expect(q.canBeAccessedBy(clientRef('client-2'))).toBe(false);
    expect(q.canBeAccessedBy(consultantRef('c1'))).toBe(true);
    expect(q.canBeAccessedBy(consultantRef('c2'))).toBe(false);
    expect(() => q.assertAccessibleBy(consultantRef('c2'))).toThrow(ForbiddenException);
    expect(q.canBeAccessedBy({ actorId: 'x', actor: 'OTHER' as never })).toBe(false);
  });
});

describe('Quote.assignConsultants', () => {
  it('moves EN_ATTENTE → TRAITEMENT_CONSULTANT, persists the lead and sets a consultant SLA', () => {
    const q = aQuote().build();
    q.assignConsultants(
      [
        { consultantId: 'c1', isLead: false },
        { consultantId: 'c2', isLead: true },
      ],
      adminRef(),
      NOW,
    );
    expect(q.status).toBe(S.TRAITEMENT_CONSULTANT);
    expect(q.leadConsultantId).toBe('c2');
    expect(q.consultantIds).toEqual(['c1', 'c2']);
    expect(q.consultantDeadline?.toISOString()).toBe(later(24).toISOString());
    const events = q.pullDomainEvents();
    expect(events.map((e) => e.name)).toEqual([
      'quotes.quote-status-changed',
      'quotes.consultants-assigned',
    ]);
    expect((events[1] as ConsultantsAssignedToQuote).data.newlyAssignedIds).toEqual(['c1', 'c2']);
  });

  it('syncs (replaces) assignments without status change when already in processing', () => {
    const q = aQuote().withStatus(S.TRAITEMENT_CONSULTANT).withConsultants('c1').build();
    q.assignConsultants([{ consultantId: 'c3', isLead: false }], adminRef(), NOW, later(72));
    expect(q.status).toBe(S.TRAITEMENT_CONSULTANT);
    expect(q.consultants).toEqual([{ consultantId: 'c3', isLead: false }]);
    expect(q.leadConsultantId).toBeNull();
    expect(q.consultantDeadline?.toISOString()).toBe(later(72).toISOString());
    expect(names(q)).toEqual(['quotes.consultants-assigned']);
  });

  it('keeps a still-valid consultant deadline on reassignment', () => {
    const q = aQuote()
      .withStatus(S.A_REVOIR_CONSULTANT)
      .withConsultants('c1')
      .withConsultantDeadline(later(5))
      .build();
    q.assignConsultants([{ consultantId: 'c1', isLead: true }], adminRef(), NOW);
    expect(q.consultantDeadline?.toISOString()).toBe(later(5).toISOString());
  });

  it('allows at most one lead, no duplicates, at least one consultant', () => {
    const q = aQuote().build();
    expect(() =>
      q.assignConsultants(
        [
          { consultantId: 'c1', isLead: true },
          { consultantId: 'c2', isLead: true },
        ],
        adminRef(),
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'MULTIPLE_LEADS' }));
    expect(() =>
      q.assignConsultants(
        [
          { consultantId: 'c1', isLead: false },
          { consultantId: 'c1', isLead: false },
        ],
        adminRef(),
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'DUPLICATE_CONSULTANT' }));
    expect(() => q.assignConsultants([], adminRef(), NOW)).toThrow(
      expect.objectContaining({ code: 'CONSULTANTS_REQUIRED' }),
    );
  });

  it('is admin-only and refused in non-assignable statuses', () => {
    expect(() =>
      aQuote()
        .build()
        .assignConsultants([{ consultantId: 'c1', isLead: true }], clientRef(), NOW),
    ).toThrow(ForbiddenException);
    for (const status of [S.COTE, S.VALIDE_ADMIN, S.SIGNE_CLIENT, S.REJETE, S.A_REVOIR_CLIENT]) {
      expect(() =>
        aQuote()
          .withStatus(status)
          .build()
          .assignConsultants([{ consultantId: 'c1', isLead: true }], adminRef(), NOW),
      ).toThrow(ConflictException);
    }
  });
});

describe('Quote.setLead', () => {
  it('switches the lead among assigned consultants', () => {
    const q = aQuote().withConsultants('c1', 'c2').build();
    q.setLead('c2', adminRef(), NOW);
    expect(q.consultants).toEqual([
      { consultantId: 'c1', isLead: false },
      { consultantId: 'c2', isLead: true },
    ]);
  });
  it('refuses a non-assigned consultant or a non-admin', () => {
    const q = aQuote().withConsultants('c1').build();
    expect(() => q.setLead('c9', adminRef(), NOW)).toThrow(ValidationException);
    expect(() => q.setLead('c1', consultantRef('c1'), NOW)).toThrow(ForbiddenException);
  });
});

describe('Quote.submitByConsultant', () => {
  const processing = () =>
    aQuote()
      .withStatus(S.TRAITEMENT_CONSULTANT)
      .withConsultants('c1')
      .withConsultantDeadline(later(24))
      .build();

  it('moves to COTÉ with price, notes, quotedBy and submittedAt', () => {
    const q = processing();
    q.submitByConsultant(
      { price: Money.of(1500), consultantNotes: ' ok ' },
      consultantRef('c1'),
      NOW,
    );
    expect(q.status).toBe(S.COTE);
    expect(q.price?.amount).toBe(1500);
    expect(q.consultantNotes).toBe('ok');
    expect(q.quotedById).toBe('c1');
    expect(q.submittedAt).toEqual(NOW);
    const [event] = q.pullDomainEvents() as QuoteStatusChanged[];
    expect(event.data).toMatchObject({ from: S.TRAITEMENT_CONSULTANT, to: S.COTE, actorId: 'c1' });
  });

  it('also works from A_REVOIR_CONSULTANT and keeps notes when omitted', () => {
    const q = aQuote().withStatus(S.A_REVOIR_CONSULTANT).withConsultants('c1').build();
    q.submitByConsultant({ price: Money.of(10) }, consultantRef('c1'), NOW);
    expect(q.status).toBe(S.COTE);
    expect(q.consultantNotes).toBeNull();
  });

  it('refuses after the consultant deadline (DeadlineExceeded)', () => {
    const q = processing();
    expect(() =>
      q.submitByConsultant({ price: Money.of(1) }, consultantRef('c1'), later(25)),
    ).toThrow(DeadlineExceeded);
  });

  it('refuses a non-assigned consultant and illegal source statuses', () => {
    expect(() =>
      processing().submitByConsultant({ price: Money.of(1) }, consultantRef('c2'), NOW),
    ).toThrow(ForbiddenException);
    expect(() =>
      processing().submitByConsultant({ price: Money.of(1) }, adminRef('c1'), NOW),
    ).toThrow(ForbiddenException);
    const done = aQuote().withStatus(S.VALIDE_ADMIN).withConsultants('c1').build();
    expect(() => done.submitByConsultant({ price: Money.of(1) }, consultantRef('c1'), NOW)).toThrow(
      QuoteTransitionNotAllowed,
    );
  });
});

describe('Quote.reviewByAdmin', () => {
  it('rejects WITHOUT a price and records the reason', () => {
    const q = aQuote().build();
    q.reviewByAdmin({ status: S.REJETE, rejectedReason: 'hors périmètre' }, adminRef(), NOW);
    expect(q.status).toBe(S.REJETE);
    expect(q.rejectedReason).toBe('hors périmètre');
    expect(q.price).toBeNull();
  });

  it('validates directly with a price (validatedAt set), notes and description updated', () => {
    const q = aQuote().build();
    q.reviewByAdmin(
      {
        status: S.VALIDE_ADMIN,
        price: Money.of(900),
        adminNotes: 'interne',
        adminNotesToClient: 'pour vous',
        adminNotesToConsultant: null,
        description: 'nouvelle description',
      },
      adminRef(),
      NOW,
    );
    expect(q.status).toBe(S.VALIDE_ADMIN);
    expect(q.validatedAt).toEqual(NOW);
    expect(q.adminNotes).toBe('interne');
    expect(q.adminNotesToClient).toBe('pour vous');
    expect(q.adminNotesToConsultant).toBeNull();
    expect(q.description).toBe('nouvelle description');
    expect(q.isPriceVisibleToClient).toBe(true);
  });

  it('requires a price to validate', () => {
    expect(() =>
      aQuote().build().reviewByAdmin({ status: S.VALIDE_ADMIN }, adminRef(), NOW),
    ).toThrow(expect.objectContaining({ code: 'PRICE_REQUIRED' }));
  });

  it('notes-only review when status is unchanged (no event)', () => {
    const q = aQuote().build();
    q.reviewByAdmin({ status: S.EN_ATTENTE, adminNotes: 'vu' }, adminRef(), NOW);
    expect(q.adminNotes).toBe('vu');
    expect(q.pullDomainEvents()).toHaveLength(0);
  });

  it('refuses notes-only review on a terminal quote and illegal transitions', () => {
    expect(() =>
      aQuote().withStatus(S.REJETE).build().reviewByAdmin({ status: S.REJETE }, adminRef(), NOW),
    ).toThrow(QuoteTransitionNotAllowed);
    expect(() =>
      aQuote().build().reviewByAdmin({ status: S.SIGNE_CLIENT }, adminRef(), NOW),
    ).toThrow(QuoteTransitionNotAllowed);
    expect(() => aQuote().build().reviewByAdmin({ status: S.REJETE }, clientRef(), NOW)).toThrow(
      ForbiddenException,
    );
  });

  it('A_REVOIR_CLIENT round-trip and TRAITEMENT_CONSULTANT requires consultants', () => {
    const q = aQuote().build();
    q.reviewByAdmin({ status: S.A_REVOIR_CLIENT, adminNotesToClient: 'précisez' }, adminRef(), NOW);
    expect(q.status).toBe(S.A_REVOIR_CLIENT);
    q.reviewByAdmin({ status: S.EN_ATTENTE }, adminRef(), NOW);
    expect(q.status).toBe(S.EN_ATTENTE);
    expect(() => q.reviewByAdmin({ status: S.TRAITEMENT_CONSULTANT }, adminRef(), NOW)).toThrow(
      expect.objectContaining({ code: 'CONSULTANTS_REQUIRED' }),
    );

    const withC = aQuote().withConsultants('c1').build();
    withC.reviewByAdmin({ status: S.TRAITEMENT_CONSULTANT }, adminRef(), NOW);
    expect(withC.status).toBe(S.TRAITEMENT_CONSULTANT);
    expect(withC.consultantDeadline).not.toBeNull();
  });
});

describe('Quote.validateConsultantQuote', () => {
  const quoted = () => aQuote().withStatus(S.COTE).withConsultants('c1').withPrice(1200).build();

  it('COTÉ → VALIDÉ_ADMIN sets validatedAt', () => {
    const q = quoted();
    q.validateConsultantQuote({ status: S.VALIDE_ADMIN, adminNotes: 'ok' }, adminRef(), NOW);
    expect(q.status).toBe(S.VALIDE_ADMIN);
    expect(q.validatedAt).toEqual(NOW);
    expect(q.adminNotes).toBe('ok');
  });

  it('COTÉ → A_REVOIR_CONSULTANT re-opens a fresh consultant SLA', () => {
    const q = aQuote()
      .withStatus(S.COTE)
      .withConsultants('c1')
      .withPrice(5)
      .withConsultantDeadline(new Date('2020-01-01'))
      .build();
    q.validateConsultantQuote(
      { status: S.A_REVOIR_CONSULTANT, adminNotesToConsultant: 'revoir' },
      adminRef(),
      NOW,
    );
    expect(q.status).toBe(S.A_REVOIR_CONSULTANT);
    expect(q.adminNotesToConsultant).toBe('revoir');
    expect(q.consultantDeadline?.toISOString()).toBe(later(24).toISOString());
  });

  it('COTÉ → REJETÉ keeps the reason', () => {
    const q = quoted();
    q.validateConsultantQuote({ status: S.REJETE, rejectedReason: 'trop cher' }, adminRef(), NOW);
    expect(q.rejectedReason).toBe('trop cher');
  });

  it('refuses when not COTÉ, for other targets, or without price', () => {
    expect(() =>
      aQuote().build().validateConsultantQuote({ status: S.VALIDE_ADMIN }, adminRef(), NOW),
    ).toThrow(QuoteTransitionNotAllowed);
    expect(() =>
      quoted().validateConsultantQuote({ status: S.EN_ATTENTE }, adminRef(), NOW),
    ).toThrow(QuoteTransitionNotAllowed);
    expect(() =>
      aQuote()
        .withStatus(S.COTE)
        .build()
        .validateConsultantQuote({ status: S.VALIDE_ADMIN }, adminRef(), NOW),
    ).toThrow(expect.objectContaining({ code: 'PRICE_REQUIRED' }));
  });
});

describe('Quote client decisions', () => {
  const validated = () => aQuote().withStatus(S.VALIDE_ADMIN).withPrice(100).build();

  it('owner signs → SIGNÉ_CLIENT', () => {
    const q = validated();
    q.signByClient(clientRef('client-1'), NOW);
    expect(q.status).toBe(S.SIGNE_CLIENT);
    expect(q.isTerminal).toBe(true);
  });

  it('owner rejects → REJETÉ with reason', () => {
    const q = validated();
    q.rejectByClient('  pas de budget ', clientRef('client-1'), NOW);
    expect(q.status).toBe(S.REJETE);
    expect(q.rejectedReason).toBe('pas de budget');
  });

  it('refuses a stranger, a subquote, and an unvalidated quote', () => {
    expect(() => validated().signByClient(clientRef('client-2'), NOW)).toThrow(ForbiddenException);
    expect(() =>
      aQuote().withStatus(S.VALIDE_ADMIN).asSubquoteOf('p').build().signByClient(clientRef(), NOW),
    ).toThrow(ForbiddenException);
    expect(() => aQuote().withStatus(S.COTE).build().signByClient(clientRef(), NOW)).toThrow(
      QuoteTransitionNotAllowed,
    );
    expect(() =>
      aQuote().withStatus(S.COTE).build().rejectByClient(null, clientRef(), NOW),
    ).toThrow(QuoteTransitionNotAllowed);
  });
});

describe('Quote.split / createSubquote', () => {
  it('creates one subquote per consultant (lead, inherited type/client/SLA) and moves parent', () => {
    const parent = aQuote().withTitle('Projet').withType(QuoteType.ABONNEMENT).build();
    const subs = parent.split(
      [
        { id: 's1', requestNumber: RequestNumber.fromSequence(2), consultantId: 'c1' },
        { id: 's2', requestNumber: RequestNumber.fromSequence(3), consultantId: 'c2' },
      ],
      adminRef(),
      NOW,
    );
    expect(parent.status).toBe(S.TRAITEMENT_CONSULTANT);
    expect(subs).toHaveLength(2);
    expect(subs[0]).toMatchObject({
      isSubquote: true,
      parentQuoteId: parent.id,
      clientId: parent.clientId,
      type: QuoteType.ABONNEMENT,
      title: 'Projet - Sous-devis 1',
      status: S.TRAITEMENT_CONSULTANT,
    });
    expect(subs[0].consultants).toEqual([{ consultantId: 'c1', isLead: true }]);
    expect(subs[0].adminDeadline).toEqual(parent.adminDeadline);
    expect(subs[1].consultantDeadline?.toISOString()).toBe(later(24).toISOString());
    expect(names(subs[0])).toEqual(['quotes.quote-created', 'quotes.consultants-assigned']);
    const parentEvents = parent.pullDomainEvents();
    expect(parentEvents.map((e) => e.name)).toEqual([
      'quotes.quote-status-changed',
      'quotes.quote-split',
    ]);
    expect((parentEvents[1] as QuoteSplit).data.subquoteIds).toEqual(['s1', 's2']);
  });

  it('keeps the parent status when already in consultant processing', () => {
    const parent = aQuote().withTitle(null).withStatus(S.TRAITEMENT_CONSULTANT).build();
    const [sub] = parent.split(
      [{ id: 's1', requestNumber: RequestNumber.fromSequence(9), consultantId: 'c1' }],
      adminRef(),
      NOW,
    );
    expect(sub.title).toBe('Devis - Sous-devis 1');
    expect(names(parent)).toEqual(['quotes.quote-split']);
  });

  it('forbids splitting a subquote (no subquote of a subquote)', () => {
    const sub = aQuote().asSubquoteOf('p').build();
    expect(() =>
      sub.split(
        [{ id: 's', requestNumber: RequestNumber.fromSequence(2), consultantId: 'c1' }],
        adminRef(),
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'SUBQUOTE_OF_SUBQUOTE' }));
    expect(() =>
      sub.createSubquote(
        {
          id: 's',
          requestNumber: RequestNumber.fromSequence(2),
          title: 't',
          description: 'd',
          consultantId: 'c1',
        },
        adminRef(),
        NOW,
      ),
    ).toThrow(expect.objectContaining({ code: 'SUBQUOTE_OF_SUBQUOTE' }));
  });

  it('refuses empty or duplicate consultants, wrong status, non-admin', () => {
    const rn = RequestNumber.fromSequence(2);
    expect(() => aQuote().build().split([], adminRef(), NOW)).toThrow(ValidationException);
    expect(() =>
      aQuote()
        .build()
        .split(
          [
            { id: 'a', requestNumber: rn, consultantId: 'c1' },
            { id: 'b', requestNumber: rn, consultantId: 'c1' },
          ],
          adminRef(),
          NOW,
        ),
    ).toThrow(ValidationException);
    expect(() =>
      aQuote()
        .withStatus(S.COTE)
        .build()
        .split([{ id: 'a', requestNumber: rn, consultantId: 'c1' }], adminRef(), NOW),
    ).toThrow(expect.objectContaining({ code: 'QUOTE_NOT_SPLITTABLE' }));
    expect(() =>
      aQuote()
        .build()
        .split([{ id: 'a', requestNumber: rn, consultantId: 'c1' }], clientRef(), NOW),
    ).toThrow(ForbiddenException);
  });

  it('createSubquote honours an explicit consultant deadline', () => {
    const parent = aQuote().build();
    const sub = parent.createSubquote(
      {
        id: 's1',
        requestNumber: RequestNumber.fromSequence(2),
        title: 'Volet social',
        description: 'Partie sociale',
        consultantId: 'c7',
        consultantDeadline: later(48),
      },
      adminRef(),
      NOW,
    );
    expect(sub.title).toBe('Volet social');
    expect(sub.leadConsultantId).toBe('c7');
    expect(sub.consultantDeadline?.toISOString()).toBe(later(48).toISOString());
    expect(parent.status).toBe(S.TRAITEMENT_CONSULTANT);
  });
});

describe('Quote misc', () => {
  it('setAdminNotesToConsultant requires content and admin', () => {
    const q = aQuote().build();
    q.setAdminNotesToConsultant(' à revoir ', adminRef(), NOW);
    expect(q.adminNotesToConsultant).toBe('à revoir');
    expect(() => q.setAdminNotesToConsultant('  ', adminRef(), NOW)).toThrow(ValidationException);
    expect(() => q.setAdminNotesToConsultant('x', clientRef(), NOW)).toThrow(ForbiddenException);
  });

  it('deletion rules: client owner only while EN_ATTENTE and without subquotes; admin unless signed', () => {
    const pending = aQuote().build();
    expect(() => pending.assertDeletableBy(clientRef('client-1'), false)).not.toThrow();
    expect(() => pending.assertDeletableBy(clientRef('client-1'), true)).toThrow(ConflictException);
    expect(() => pending.assertDeletableBy(clientRef('client-2'), false)).toThrow(
      ForbiddenException,
    );
    expect(() => pending.assertDeletableBy(consultantRef(), false)).toThrow(ForbiddenException);
    expect(() =>
      aQuote().withStatus(S.COTE).build().assertDeletableBy(clientRef('client-1'), false),
    ).toThrow(ConflictException);
    expect(() =>
      aQuote().withStatus(S.COTE).build().assertDeletableBy(adminRef(), true),
    ).not.toThrow();
    expect(() =>
      aQuote().withStatus(S.SIGNE_CLIENT).build().assertDeletableBy(adminRef(), false),
    ).toThrow(ConflictException);
  });

  it('exposes its state through getters', () => {
    const q = aQuote()
      .withStatus(S.COTE)
      .withConsultants('c1')
      .withPrice(10)
      .withValidatedAt(null)
      .build();
    expect(q.isPriceVisibleToClient).toBe(false);
    expect(q.isConsultantDeadlineExceeded(NOW)).toBe(false);
    expect(q.isAdminDeadlineExceeded(NOW)).toBe(false);
    expect(q.createdAt).toEqual(NOW);
    expect(q.updatedAt).toEqual(NOW);
    expect(q.rejectedReason).toBeNull();
  });
});
