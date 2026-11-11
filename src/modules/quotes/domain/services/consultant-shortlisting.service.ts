/** A consultant as seen by the quotes context (read-only projection). */
export interface ConsultantCandidate {
  consultantId: string;
  name: string;
  expertiseDomains: string[];
  validated: boolean;
}

export interface ShortlistEntry {
  consultantId: string;
  name: string;
  /** expertise domains of the consultant that match the quote */
  expertiseMatch: string[];
  score: number;
  currentLoad: number;
  validated: boolean;
}

export interface ShortlistSubject {
  type: string;
  title: string | null;
  description: string;
}

export const SHORTLIST_WEIGHTS = {
  perExpertiseMatch: 10,
  validated: 5,
  perActiveQuote: 1,
  maxLoadPenalty: 10,
} as const;

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Scores consultants for a quote. It only PROPOSES — it never assigns.
 *
 * score = 10 × matched expertise domains + 5 if validated − min(load, 10)
 * Ties: lower load first, then name. Pure and deterministic.
 */
export class ConsultantShortlistingService {
  static shortlist(
    subject: ShortlistSubject,
    candidates: readonly ConsultantCandidate[],
    loads: ReadonlyMap<string, number>,
  ): ShortlistEntry[] {
    const haystack = normalize(`${subject.type} ${subject.title ?? ''} ${subject.description}`);
    const w = SHORTLIST_WEIGHTS;

    return candidates
      .map((c) => {
        const expertiseMatch = c.expertiseDomains.filter((domain) => {
          const needle = normalize(domain);
          return needle.length > 0 && haystack.includes(needle);
        });
        const currentLoad = loads.get(c.consultantId) ?? 0;
        const score =
          expertiseMatch.length * w.perExpertiseMatch +
          (c.validated ? w.validated : 0) -
          Math.min(currentLoad * w.perActiveQuote, w.maxLoadPenalty);
        return {
          consultantId: c.consultantId,
          name: c.name,
          expertiseMatch,
          score,
          currentLoad,
          validated: c.validated,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score || a.currentLoad - b.currentLoad || a.name.localeCompare(b.name),
      );
  }
}
