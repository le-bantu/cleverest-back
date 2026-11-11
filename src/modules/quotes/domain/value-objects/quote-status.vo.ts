import { ValidationException } from '@shared/kernel';

/**
 * Quote lifecycle. Values are kept exactly as in the legacy PostgreSQL enum
 * (accents included) — see CDC §7.5 and the Lot 1 framing decisions.
 */
export enum QuoteStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  TRAITEMENT_CONSULTANT = 'TRAITEMENT_CONSULTANT',
  COTE = 'COTÉ',
  VALIDE_ADMIN = 'VALIDÉ_ADMIN',
  SIGNE_CLIENT = 'SIGNÉ_CLIENT',
  REJETE = 'REJETÉ',
  A_REVOIR_CONSULTANT = 'A_REVOIR_CONSULTANT',
  A_REVOIR_CLIENT = 'A_REVOIR_CLIENT',
}

/** Who triggers a transition. `superadmin` acts as `ADMIN`. */
export enum QuoteActor {
  ADMIN = 'ADMIN',
  CONSULTANT = 'CONSULTANT',
  CLIENT = 'CLIENT',
}

export const ALL_QUOTE_STATUSES: readonly QuoteStatus[] = Object.values(QuoteStatus);

export const TERMINAL_QUOTE_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.SIGNE_CLIENT,
  QuoteStatus.REJETE,
];

const S = QuoteStatus;
const A = QuoteActor;

type TransitionTable = ReadonlyMap<QuoteStatus, ReadonlyMap<QuoteStatus, ReadonlySet<QuoteActor>>>;

const targets = (
  ...entries: Array<[QuoteStatus, QuoteActor[]]>
): ReadonlyMap<QuoteStatus, ReadonlySet<QuoteActor>> =>
  new Map(entries.map(([to, actors]) => [to, new Set(actors)] as const));

/**
 * The single source of truth for the quote state machine:
 * from → (to → actors allowed to perform it). Anything absent is illegal.
 */
export const QUOTE_TRANSITIONS: TransitionTable = new Map([
  [
    S.EN_ATTENTE,
    targets(
      [S.TRAITEMENT_CONSULTANT, [A.ADMIN]],
      [S.VALIDE_ADMIN, [A.ADMIN]],
      [S.REJETE, [A.ADMIN]],
      [S.A_REVOIR_CLIENT, [A.ADMIN]],
    ),
  ],
  [
    S.A_REVOIR_CLIENT,
    targets([S.EN_ATTENTE, [A.ADMIN]], [S.VALIDE_ADMIN, [A.ADMIN]], [S.REJETE, [A.ADMIN]]),
  ],
  [S.TRAITEMENT_CONSULTANT, targets([S.COTE, [A.CONSULTANT]], [S.REJETE, [A.ADMIN]])],
  [
    S.COTE,
    targets([S.VALIDE_ADMIN, [A.ADMIN]], [S.REJETE, [A.ADMIN]], [S.A_REVOIR_CONSULTANT, [A.ADMIN]]),
  ],
  [S.A_REVOIR_CONSULTANT, targets([S.COTE, [A.CONSULTANT]], [S.REJETE, [A.ADMIN]])],
  [S.VALIDE_ADMIN, targets([S.SIGNE_CLIENT, [A.CLIENT]], [S.REJETE, [A.CLIENT]])],
  [S.SIGNE_CLIENT, targets()],
  [S.REJETE, targets()],
]);

export const isQuoteStatus = (value: string): value is QuoteStatus =>
  (ALL_QUOTE_STATUSES as string[]).includes(value);

export const parseQuoteStatus = (value: string): QuoteStatus => {
  if (!isQuoteStatus(value)) {
    throw new ValidationException('INVALID_QUOTE_STATUS', `Unknown quote status "${value}"`);
  }
  return value;
};

export const isTerminalQuoteStatus = (status: QuoteStatus): boolean =>
  TERMINAL_QUOTE_STATUSES.includes(status);

/** Maps the authenticated user's roles to the actor kind used by the state machine. */
export const quoteActorFromRoles = (roles: readonly string[]): QuoteActor | null => {
  if (roles.includes('admin') || roles.includes('superadmin')) return QuoteActor.ADMIN;
  if (roles.includes('consultant')) return QuoteActor.CONSULTANT;
  if (roles.includes('client')) return QuoteActor.CLIENT;
  return null;
};
