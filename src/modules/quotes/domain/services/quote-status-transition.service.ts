import { QuoteTransitionNotAllowed } from '../errors';
import { QUOTE_TRANSITIONS, QuoteActor, QuoteStatus } from '../value-objects/quote-status.vo';

/**
 * Domain service guarding EVERY quote status change: (from, to, actor) must
 * appear in `QUOTE_TRANSITIONS`. Stateless — exposed as static helpers so the
 * aggregate can call it without injection.
 */
export class QuoteStatusTransitionService {
  static canTransition(from: QuoteStatus, to: QuoteStatus, actor: QuoteActor): boolean {
    return QUOTE_TRANSITIONS.get(from)?.get(to)?.has(actor) ?? false;
  }

  static assertCanTransition(from: QuoteStatus, to: QuoteStatus, actor: QuoteActor): void {
    if (!QuoteStatusTransitionService.canTransition(from, to, actor)) {
      throw new QuoteTransitionNotAllowed(from, to, actor);
    }
  }

  /** Targets reachable from `from` by `actor` (useful for UIs / docs). */
  static allowedTargets(from: QuoteStatus, actor: QuoteActor): QuoteStatus[] {
    const targets = QUOTE_TRANSITIONS.get(from);
    if (!targets) return [];
    return [...targets.entries()].filter(([, actors]) => actors.has(actor)).map(([to]) => to);
  }
}
