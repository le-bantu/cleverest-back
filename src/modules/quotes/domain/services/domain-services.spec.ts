import { QuoteTransitionNotAllowed } from '../errors';
import { ALL_QUOTE_STATUSES, QuoteActor, QuoteStatus as S } from '../value-objects/quote-status.vo';
import { QuoteStatusTransitionService as T } from './quote-status-transition.service';
import { RequestNumberGenerator } from './request-number-generator';
import { ConsultantShortlistingService } from './consultant-shortlisting.service';

const A = QuoteActor;
const ACTORS = [A.ADMIN, A.CONSULTANT, A.CLIENT];

/** Exhaustive list of legal (from, to, actor) triples. Everything else must be refused. */
const ALLOWED: Array<[S, S, QuoteActor]> = [
  [S.EN_ATTENTE, S.TRAITEMENT_CONSULTANT, A.ADMIN],
  [S.EN_ATTENTE, S.VALIDE_ADMIN, A.ADMIN],
  [S.EN_ATTENTE, S.REJETE, A.ADMIN],
  [S.EN_ATTENTE, S.A_REVOIR_CLIENT, A.ADMIN],
  [S.A_REVOIR_CLIENT, S.EN_ATTENTE, A.ADMIN],
  [S.A_REVOIR_CLIENT, S.VALIDE_ADMIN, A.ADMIN],
  [S.A_REVOIR_CLIENT, S.REJETE, A.ADMIN],
  [S.TRAITEMENT_CONSULTANT, S.COTE, A.CONSULTANT],
  [S.TRAITEMENT_CONSULTANT, S.REJETE, A.ADMIN],
  [S.COTE, S.VALIDE_ADMIN, A.ADMIN],
  [S.COTE, S.REJETE, A.ADMIN],
  [S.COTE, S.A_REVOIR_CONSULTANT, A.ADMIN],
  [S.A_REVOIR_CONSULTANT, S.COTE, A.CONSULTANT],
  [S.A_REVOIR_CONSULTANT, S.REJETE, A.ADMIN],
  [S.VALIDE_ADMIN, S.SIGNE_CLIENT, A.CLIENT],
  [S.VALIDE_ADMIN, S.REJETE, A.CLIENT],
];
const key = (f: S, t: S, a: QuoteActor) => `${f}|${t}|${a}`;
const allowedKeys = new Set(ALLOWED.map(([f, t, a]) => key(f, t, a)));

const everyTriple: Array<[S, S, QuoteActor]> = ALL_QUOTE_STATUSES.flatMap((from) =>
  ALL_QUOTE_STATUSES.flatMap((to) =>
    ACTORS.map((actor) => [from, to, actor] as [S, S, QuoteActor]),
  ),
);

describe('QuoteStatusTransitionService — full matrix', () => {
  it.each(everyTriple)('%s → %s by %s', (from, to, actor) => {
    const expected = allowedKeys.has(key(from, to, actor));
    expect(T.canTransition(from, to, actor)).toBe(expected);
    if (expected) {
      expect(() => T.assertCanTransition(from, to, actor)).not.toThrow();
    } else {
      expect(() => T.assertCanTransition(from, to, actor)).toThrow(QuoteTransitionNotAllowed);
    }
  });

  it('the refusal is a 409 carrying from/to/actor', () => {
    try {
      T.assertCanTransition(S.SIGNE_CLIENT, S.EN_ATTENTE, A.ADMIN);
      fail('should throw');
    } catch (e) {
      const ex = e as QuoteTransitionNotAllowed;
      expect(ex.httpStatus).toBe(409);
      expect(ex.code).toBe('QUOTE_TRANSITION_NOT_ALLOWED');
      expect(ex.details).toEqual({ from: S.SIGNE_CLIENT, to: S.EN_ATTENTE, actor: A.ADMIN });
    }
  });

  it('terminal statuses have no outgoing transition', () => {
    for (const actor of ACTORS) {
      expect(T.allowedTargets(S.SIGNE_CLIENT, actor)).toEqual([]);
      expect(T.allowedTargets(S.REJETE, actor)).toEqual([]);
    }
  });

  it('lists allowed targets per actor', () => {
    expect(T.allowedTargets(S.COTE, A.ADMIN).sort()).toEqual(
      [S.VALIDE_ADMIN, S.REJETE, S.A_REVOIR_CONSULTANT].sort(),
    );
    expect(T.allowedTargets(S.COTE, A.CLIENT)).toEqual([]);
  });
});

describe('RequestNumberGenerator', () => {
  it('req-001 → req-002', () => {
    expect(RequestNumberGenerator.next(1).value).toBe('req-002');
  });
  it('starts at req-001 on an empty table', () => {
    expect(RequestNumberGenerator.next(0).value).toBe('req-001');
    expect(RequestNumberGenerator.next(-3).value).toBe('req-001');
  });
  it('reserves consecutive numbers', () => {
    expect(RequestNumberGenerator.nextMany(998, 3).map((n) => n.value)).toEqual([
      'req-999',
      'req-1000',
      'req-1001',
    ]);
  });
});

describe('ConsultantShortlistingService', () => {
  const subject = {
    type: 'CONSULTATION',
    title: 'Audit fiscal',
    description: 'Optimisation de la fiscalité et du droit social',
  };
  const candidates = [
    { consultantId: 'c-none', name: 'Zoé', expertiseDomains: ['marketing'], validated: true },
    {
      consultantId: 'c-two',
      name: 'Bob',
      expertiseDomains: ['Fiscalité', 'droit'],
      validated: true,
    },
    { consultantId: 'c-one', name: 'Alice', expertiseDomains: ['fiscalite'], validated: false },
    {
      consultantId: 'c-busy',
      name: 'Carl',
      expertiseDomains: ['fiscalité', 'droit'],
      validated: true,
    },
    { consultantId: 'c-empty', name: 'Dan', expertiseDomains: ['  '], validated: false },
  ];
  const loads = new Map([['c-busy', 3]]);

  it('scores expertise overlap (accent/case-insensitive), validation and load; sorts desc', () => {
    const list = ConsultantShortlistingService.shortlist(subject, candidates, loads);
    expect(list.map((e) => e.consultantId)).toEqual([
      'c-two',
      'c-busy',
      'c-one',
      'c-none',
      'c-empty',
    ]);
    expect(list[0]).toEqual({
      consultantId: 'c-two',
      name: 'Bob',
      expertiseMatch: ['Fiscalité', 'droit'],
      score: 25,
      currentLoad: 0,
      validated: true,
    });
    expect(list[1].score).toBe(22);
    expect(list[1].currentLoad).toBe(3);
    expect(list[2].score).toBe(10);
    expect(list[4].expertiseMatch).toEqual([]);
  });

  it('caps the load penalty and breaks ties by load then name', () => {
    const list = ConsultantShortlistingService.shortlist(
      { type: 'ABONNEMENT', title: null, description: 'rien' },
      [
        { consultantId: 'b', name: 'B', expertiseDomains: [], validated: true },
        { consultantId: 'a', name: 'A', expertiseDomains: [], validated: true },
        { consultantId: 'x', name: 'X', expertiseDomains: [], validated: true },
        { consultantId: 'h', name: 'H', expertiseDomains: [], validated: true },
      ],
      new Map([
        ['x', 2],
        ['h', 50],
      ]),
    );
    expect(list.map((e) => e.consultantId)).toEqual(['a', 'b', 'x', 'h']);
    expect(list[3].score).toBe(5 - 10);
  });

  it('never mutates its inputs (it only proposes)', () => {
    const input = candidates.map((c) => ({ ...c }));
    ConsultantShortlistingService.shortlist(subject, input, loads);
    expect(input).toEqual(candidates);
  });
});
