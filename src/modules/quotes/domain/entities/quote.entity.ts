import { AbstractAggregateRoot, ForbiddenException } from '@shared/kernel';
import {
  ConsultantsAssignedToQuote,
  QuoteCreated,
  QuoteSplit,
  QuoteStatusChanged,
} from '../events/quote.events';
import {
  DeadlineExceeded,
  invalidQuote,
  quoteAccessDenied,
  quoteConflict,
  QuoteTransitionNotAllowed,
} from '../errors';
import { QuoteStatusTransitionService } from '../services/quote-status-transition.service';
import { Money } from '../value-objects/money.vo';
import { isTerminalQuoteStatus, QuoteActor, QuoteStatus } from '../value-objects/quote-status.vo';
import { QuoteType } from '../value-objects/quote-type.vo';
import { RequestNumber } from '../value-objects/request-number.vo';
import {
  ADMIN_SLA_HOURS,
  CONSULTANT_SLA_HOURS,
  SlaDeadline,
} from '../value-objects/sla-deadline.vo';

/** The authenticated actor performing a domain operation. */
export interface QuoteActorRef {
  actorId: string;
  actor: QuoteActor;
}

export interface ConsultantAssignment {
  consultantId: string;
  isLead: boolean;
}

export interface QuoteProps {
  id: string;
  clientId: string;
  parentQuoteId: string | null;
  isSubquote: boolean;
  requestNumber: RequestNumber;
  type: QuoteType;
  title: string | null;
  description: string;
  price: Money | null;
  status: QuoteStatus;
  adminNotes: string | null;
  adminNotesToConsultant: string | null;
  adminNotesToClient: string | null;
  consultantNotes: string | null;
  rejectedReason: string | null;
  quotedById: string | null;
  consultants: ConsultantAssignment[];
  submittedAt: Date | null;
  validatedAt: Date | null;
  adminDeadline: SlaDeadline | null;
  consultantDeadline: SlaDeadline | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQuoteProps {
  id: string;
  clientId: string;
  requestNumber: RequestNumber;
  type: QuoteType;
  title?: string | null;
  description: string;
}

export interface NewSubquoteProps {
  id: string;
  requestNumber: RequestNumber;
  title: string;
  description: string;
  consultantId: string;
  consultantDeadline?: Date | null;
}

export interface ReviewByAdminProps {
  status: QuoteStatus;
  adminNotes?: string | null;
  adminNotesToConsultant?: string | null;
  adminNotesToClient?: string | null;
  rejectedReason?: string | null;
  description?: string;
  price?: Money | null;
}

export interface ValidateConsultantQuoteProps {
  status: QuoteStatus;
  adminNotes?: string | null;
  adminNotesToConsultant?: string | null;
  rejectedReason?: string | null;
}

/** Statuses in which consultants may be (re)assigned or a quote split. */
const ASSIGNABLE_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.EN_ATTENTE,
  QuoteStatus.TRAITEMENT_CONSULTANT,
  QuoteStatus.A_REVOIR_CONSULTANT,
];
const SPLITTABLE_STATUSES: readonly QuoteStatus[] = [
  QuoteStatus.EN_ATTENTE,
  QuoteStatus.TRAITEMENT_CONSULTANT,
];
/** Targets accepted by `PATCH /admin/quotes/:id/validate` (from COTÉ only). */
export const VALIDATION_TARGETS: readonly QuoteStatus[] = [
  QuoteStatus.VALIDE_ADMIN,
  QuoteStatus.REJETE,
  QuoteStatus.A_REVOIR_CONSULTANT,
];
/** Statuses in which the client sees the price (once an admin has validated it). */
const PRICE_VISIBLE_TO_CLIENT: readonly QuoteStatus[] = [
  QuoteStatus.VALIDE_ADMIN,
  QuoteStatus.SIGNE_CLIENT,
];

const TITLE_MAX = 255;

const cleanText = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const requireDescription = (value: string): string => {
  const cleaned = cleanText(value);
  if (!cleaned) throw invalidQuote('QUOTE_DESCRIPTION_REQUIRED', 'Description is required');
  return cleaned;
};

const checkTitle = (value: string | null | undefined): string | null => {
  const cleaned = cleanText(value);
  if (cleaned && cleaned.length > TITLE_MAX) {
    throw invalidQuote('QUOTE_TITLE_TOO_LONG', `Title must be at most ${TITLE_MAX} characters`);
  }
  return cleaned;
};

/**
 * Quote aggregate root. Owns its consultant assignments (with `isLead`).
 * Every status change goes through `QuoteStatusTransitionService`.
 */
export class Quote extends AbstractAggregateRoot<string> {
  private props: QuoteProps;

  private constructor(props: QuoteProps) {
    super(props.id);
    this.props = props;
  }

  // ---------------------------------------------------------------- factories

  static create(input: CreateQuoteProps, actorId: string, now: Date): Quote {
    const quote = new Quote({
      id: input.id,
      clientId: input.clientId,
      parentQuoteId: null,
      isSubquote: false,
      requestNumber: input.requestNumber,
      type: input.type,
      title: checkTitle(input.title),
      description: requireDescription(input.description),
      price: null,
      status: QuoteStatus.EN_ATTENTE,
      adminNotes: null,
      adminNotesToConsultant: null,
      adminNotesToClient: null,
      consultantNotes: null,
      rejectedReason: null,
      quotedById: null,
      consultants: [],
      submittedAt: null,
      validatedAt: null,
      adminDeadline: SlaDeadline.hoursFrom(now, ADMIN_SLA_HOURS),
      consultantDeadline: null,
      createdAt: now,
      updatedAt: now,
    });
    quote.recordCreated(actorId, now);
    return quote;
  }

  static rehydrate(props: QuoteProps): Quote {
    return new Quote({ ...props, consultants: props.consultants.map((c) => ({ ...c })) });
  }

  // ---------------------------------------------------------------- getters

  get clientId(): string {
    return this.props.clientId;
  }
  get parentQuoteId(): string | null {
    return this.props.parentQuoteId;
  }
  get isSubquote(): boolean {
    return this.props.isSubquote;
  }
  get requestNumber(): RequestNumber {
    return this.props.requestNumber;
  }
  get type(): QuoteType {
    return this.props.type;
  }
  get title(): string | null {
    return this.props.title;
  }
  get description(): string {
    return this.props.description;
  }
  get price(): Money | null {
    return this.props.price;
  }
  get status(): QuoteStatus {
    return this.props.status;
  }
  get adminNotes(): string | null {
    return this.props.adminNotes;
  }
  get adminNotesToConsultant(): string | null {
    return this.props.adminNotesToConsultant;
  }
  get adminNotesToClient(): string | null {
    return this.props.adminNotesToClient;
  }
  get consultantNotes(): string | null {
    return this.props.consultantNotes;
  }
  get rejectedReason(): string | null {
    return this.props.rejectedReason;
  }
  get quotedById(): string | null {
    return this.props.quotedById;
  }
  get consultants(): ConsultantAssignment[] {
    return this.props.consultants.map((c) => ({ ...c }));
  }
  get consultantIds(): string[] {
    return this.props.consultants.map((c) => c.consultantId);
  }
  get leadConsultantId(): string | null {
    return this.props.consultants.find((c) => c.isLead)?.consultantId ?? null;
  }
  get submittedAt(): Date | null {
    return this.props.submittedAt;
  }
  get validatedAt(): Date | null {
    return this.props.validatedAt;
  }
  get adminDeadline(): Date | null {
    return this.props.adminDeadline?.date ?? null;
  }
  get consultantDeadline(): Date | null {
    return this.props.consultantDeadline?.date ?? null;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get isTerminal(): boolean {
    return isTerminalQuoteStatus(this.props.status);
  }
  get isPriceVisibleToClient(): boolean {
    return PRICE_VISIBLE_TO_CLIENT.includes(this.props.status);
  }

  isAssigned(consultantId: string): boolean {
    return this.props.consultants.some((c) => c.consultantId === consultantId);
  }

  isOwnedBy(clientId: string): boolean {
    return this.props.clientId === clientId;
  }

  isAdminDeadlineExceeded(now: Date): boolean {
    return this.props.adminDeadline?.isExceeded(now) ?? false;
  }

  isConsultantDeadlineExceeded(now: Date): boolean {
    return this.props.consultantDeadline?.isExceeded(now) ?? false;
  }

  // ---------------------------------------------------------------- access

  /** Ownership/assignment rule shared by reads and document operations. */
  canBeAccessedBy(by: QuoteActorRef): boolean {
    switch (by.actor) {
      case QuoteActor.ADMIN:
        return true;
      case QuoteActor.CLIENT:
        return this.isOwnedBy(by.actorId);
      case QuoteActor.CONSULTANT:
        return this.isAssigned(by.actorId);
      default:
        return false;
    }
  }

  assertAccessibleBy(by: QuoteActorRef): void {
    if (!this.canBeAccessedBy(by)) throw quoteAccessDenied();
  }

  // ---------------------------------------------------------------- behaviour

  /** Admin (re)assigns consultants (sync semantics). At most one lead. */
  assignConsultants(
    assignments: readonly ConsultantAssignment[],
    by: QuoteActorRef,
    now: Date,
    consultantDeadline?: Date | null,
  ): void {
    this.assertAdmin(by);
    if (!ASSIGNABLE_STATUSES.includes(this.props.status)) {
      throw quoteConflict(
        'QUOTE_NOT_ASSIGNABLE',
        `Consultants cannot be assigned while the quote is ${this.props.status}`,
      );
    }
    const normalized = Quote.normalizeAssignments(assignments);
    const previous = new Set(this.consultantIds);

    this.props.consultants = normalized;
    this.resetConsultantDeadline(now, consultantDeadline);
    if (this.props.status === QuoteStatus.EN_ATTENTE) {
      this.transitionTo(QuoteStatus.TRAITEMENT_CONSULTANT, by, now);
    }
    this.touch(now);
    this.addDomainEvent(
      new ConsultantsAssignedToQuote(
        this.id,
        {
          consultantIds: normalized.map((c) => c.consultantId),
          newlyAssignedIds: normalized.map((c) => c.consultantId).filter((id) => !previous.has(id)),
          leadId: this.leadConsultantId,
          actorId: by.actorId,
        },
        now,
      ),
    );
  }

  /** Admin designates the lead among already-assigned consultants. */
  setLead(consultantId: string, by: QuoteActorRef, now: Date): void {
    this.assertAdmin(by);
    if (!this.isAssigned(consultantId)) {
      throw invalidQuote('LEAD_NOT_ASSIGNED', 'The lead must be one of the assigned consultants');
    }
    this.props.consultants = this.props.consultants.map((c) => ({
      ...c,
      isLead: c.consultantId === consultantId,
    }));
    this.touch(now);
  }

  /** Consultant submits a price → COTÉ. Refused once the consultant SLA has passed. */
  submitByConsultant(
    input: { price: Money; consultantNotes?: string | null },
    by: QuoteActorRef,
    now: Date,
  ): void {
    if (by.actor !== QuoteActor.CONSULTANT || !this.isAssigned(by.actorId)) {
      throw quoteAccessDenied();
    }
    QuoteStatusTransitionService.assertCanTransition(this.props.status, QuoteStatus.COTE, by.actor);
    if (this.props.consultantDeadline?.isExceeded(now)) {
      throw new DeadlineExceeded(this.props.consultantDeadline.date);
    }
    this.props.price = input.price;
    if (input.consultantNotes !== undefined) {
      this.props.consultantNotes = cleanText(input.consultantNotes);
    }
    this.props.quotedById = by.actorId;
    this.props.submittedAt = now;
    this.transitionTo(QuoteStatus.COTE, by, now);
  }

  /** Admin reviews a client request (price NOT required when rejecting). */
  reviewByAdmin(input: ReviewByAdminProps, by: QuoteActorRef, now: Date): void {
    this.assertAdmin(by);
    const target = input.status;
    const isNotesOnly = target === this.props.status;
    if (isNotesOnly && this.isTerminal) {
      throw new QuoteTransitionNotAllowed(this.props.status, target, by.actor);
    }
    if (!isNotesOnly) {
      QuoteStatusTransitionService.assertCanTransition(this.props.status, target, by.actor);
    }

    if (input.description !== undefined) {
      this.props.description = requireDescription(input.description);
    }
    if (input.price) this.props.price = input.price;
    this.applyAdminNotes(input);

    if (!isNotesOnly) {
      if (target === QuoteStatus.VALIDE_ADMIN) {
        if (!this.props.price) {
          throw invalidQuote('PRICE_REQUIRED', 'A price is required to validate a quote');
        }
        this.props.validatedAt = now;
      }
      if (target === QuoteStatus.TRAITEMENT_CONSULTANT) {
        if (this.props.consultants.length === 0) {
          throw invalidQuote(
            'CONSULTANTS_REQUIRED',
            'Assign at least one consultant before sending the quote to consultants',
          );
        }
        this.resetConsultantDeadline(now);
      }
      if (target === QuoteStatus.REJETE) {
        this.props.rejectedReason = cleanText(input.rejectedReason) ?? this.props.rejectedReason;
      }
      this.transitionTo(target, by, now);
    }
    this.touch(now);
  }

  /** Admin rules on a consultant's quotation (current status must be COTÉ). */
  validateConsultantQuote(input: ValidateConsultantQuoteProps, by: QuoteActorRef, now: Date): void {
    this.assertAdmin(by);
    if (this.props.status !== QuoteStatus.COTE || !VALIDATION_TARGETS.includes(input.status)) {
      throw new QuoteTransitionNotAllowed(this.props.status, input.status, by.actor);
    }
    QuoteStatusTransitionService.assertCanTransition(this.props.status, input.status, by.actor);
    this.applyAdminNotes(input);

    if (input.status === QuoteStatus.VALIDE_ADMIN) {
      if (!this.props.price) {
        throw invalidQuote('PRICE_REQUIRED', 'A price is required to validate a quote');
      }
      this.props.validatedAt = now;
    }
    if (input.status === QuoteStatus.A_REVOIR_CONSULTANT) {
      this.resetConsultantDeadline(now);
    }
    if (input.status === QuoteStatus.REJETE) {
      this.props.rejectedReason = cleanText(input.rejectedReason) ?? this.props.rejectedReason;
    }
    this.transitionTo(input.status, by, now);
    this.touch(now);
  }

  signByClient(by: QuoteActorRef, now: Date): void {
    this.assertClientOwner(by);
    this.transitionTo(QuoteStatus.SIGNE_CLIENT, by, now);
    this.touch(now);
  }

  rejectByClient(reason: string | null | undefined, by: QuoteActorRef, now: Date): void {
    this.assertClientOwner(by);
    QuoteStatusTransitionService.assertCanTransition(
      this.props.status,
      QuoteStatus.REJETE,
      by.actor,
    );
    this.props.rejectedReason = cleanText(reason);
    this.transitionTo(QuoteStatus.REJETE, by, now);
    this.touch(now);
  }

  setAdminNotesToConsultant(notes: string, by: QuoteActorRef, now: Date): void {
    this.assertAdmin(by);
    const cleaned = cleanText(notes);
    if (!cleaned) throw invalidQuote('NOTES_REQUIRED', 'Notes must not be empty');
    this.props.adminNotesToConsultant = cleaned;
    this.touch(now);
  }

  /** One subquote per consultant; parent and children go to TRAITEMENT_CONSULTANT. */
  split(
    children: ReadonlyArray<{ id: string; requestNumber: RequestNumber; consultantId: string }>,
    by: QuoteActorRef,
    now: Date,
  ): Quote[] {
    this.assertCanHaveSubquotes(by);
    if (children.length === 0) {
      throw invalidQuote('CONSULTANTS_REQUIRED', 'At least one consultant is required to split');
    }
    const ids = children.map((c) => c.consultantId);
    if (new Set(ids).size !== ids.length) {
      throw invalidQuote('DUPLICATE_CONSULTANT', 'Each consultant may appear only once');
    }
    const base = this.props.title ?? 'Devis';
    const subquotes = children.map((child, index) =>
      this.spawnSubquote(
        {
          id: child.id,
          requestNumber: child.requestNumber,
          title: `${base} - Sous-devis ${index + 1}`,
          description: this.props.description,
          consultantId: child.consultantId,
        },
        by,
        now,
      ),
    );
    this.moveParentToConsultantProcessing(by, now);
    this.addDomainEvent(
      new QuoteSplit(
        this.id,
        { subquoteIds: subquotes.map((s) => s.id), actorId: by.actorId },
        now,
      ),
    );
    return subquotes;
  }

  /** Manual subquote assigned to a single consultant. */
  createSubquote(input: NewSubquoteProps, by: QuoteActorRef, now: Date): Quote {
    this.assertCanHaveSubquotes(by);
    const subquote = this.spawnSubquote(input, by, now);
    this.moveParentToConsultantProcessing(by, now);
    return subquote;
  }

  /**
   * Deletion rule: the owning client while EN_ATTENTE and without subquotes;
   * an admin at any time except once signed (a contract may exist).
   */
  assertDeletableBy(by: QuoteActorRef, hasSubquotes: boolean): void {
    if (by.actor === QuoteActor.ADMIN) {
      if (this.props.status === QuoteStatus.SIGNE_CLIENT) {
        throw quoteConflict('QUOTE_NOT_DELETABLE', 'A signed quote cannot be deleted');
      }
      return;
    }
    if (by.actor !== QuoteActor.CLIENT || !this.isOwnedBy(by.actorId) || this.isSubquote) {
      throw quoteAccessDenied();
    }
    if (this.props.status !== QuoteStatus.EN_ATTENTE || hasSubquotes) {
      throw quoteConflict(
        'QUOTE_NOT_DELETABLE',
        'Only a pending quote without subquotes can be deleted',
      );
    }
  }

  // ---------------------------------------------------------------- internals

  private static normalizeAssignments(
    assignments: readonly ConsultantAssignment[],
  ): ConsultantAssignment[] {
    if (assignments.length === 0) {
      throw invalidQuote('CONSULTANTS_REQUIRED', 'At least one consultant is required');
    }
    const ids = assignments.map((a) => a.consultantId);
    if (new Set(ids).size !== ids.length) {
      throw invalidQuote('DUPLICATE_CONSULTANT', 'Each consultant may appear only once');
    }
    if (assignments.filter((a) => a.isLead).length > 1) {
      throw invalidQuote('MULTIPLE_LEADS', 'At most one consultant can be lead');
    }
    return assignments.map((a) => ({ consultantId: a.consultantId, isLead: a.isLead === true }));
  }

  private spawnSubquote(input: NewSubquoteProps, by: QuoteActorRef, now: Date): Quote {
    const deadline = input.consultantDeadline
      ? SlaDeadline.at(input.consultantDeadline)
      : SlaDeadline.hoursFrom(now, CONSULTANT_SLA_HOURS);
    const child = new Quote({
      id: input.id,
      clientId: this.props.clientId,
      parentQuoteId: this.id,
      isSubquote: true,
      requestNumber: input.requestNumber,
      type: this.props.type,
      title: checkTitle(input.title),
      description: requireDescription(input.description),
      price: null,
      status: QuoteStatus.TRAITEMENT_CONSULTANT,
      adminNotes: null,
      adminNotesToConsultant: null,
      adminNotesToClient: null,
      consultantNotes: null,
      rejectedReason: null,
      quotedById: null,
      consultants: [{ consultantId: input.consultantId, isLead: true }],
      submittedAt: null,
      validatedAt: null,
      adminDeadline: this.props.adminDeadline,
      consultantDeadline: deadline,
      createdAt: now,
      updatedAt: now,
    });
    child.recordCreated(by.actorId, now);
    child.addDomainEvent(
      new ConsultantsAssignedToQuote(
        child.id,
        {
          consultantIds: [input.consultantId],
          newlyAssignedIds: [input.consultantId],
          leadId: input.consultantId,
          actorId: by.actorId,
        },
        now,
      ),
    );
    return child;
  }

  private assertCanHaveSubquotes(by: QuoteActorRef): void {
    this.assertAdmin(by);
    if (this.props.isSubquote) {
      throw quoteConflict('SUBQUOTE_OF_SUBQUOTE', 'A subquote cannot itself be split');
    }
    if (!SPLITTABLE_STATUSES.includes(this.props.status)) {
      throw quoteConflict(
        'QUOTE_NOT_SPLITTABLE',
        `A quote cannot be split while it is ${this.props.status}`,
      );
    }
  }

  private moveParentToConsultantProcessing(by: QuoteActorRef, now: Date): void {
    if (this.props.status === QuoteStatus.EN_ATTENTE) {
      this.transitionTo(QuoteStatus.TRAITEMENT_CONSULTANT, by, now);
    }
    this.touch(now);
  }

  private applyAdminNotes(input: {
    adminNotes?: string | null;
    adminNotesToConsultant?: string | null;
    adminNotesToClient?: string | null;
  }): void {
    if (input.adminNotes !== undefined) this.props.adminNotes = cleanText(input.adminNotes);
    if (input.adminNotesToConsultant !== undefined) {
      this.props.adminNotesToConsultant = cleanText(input.adminNotesToConsultant);
    }
    if (input.adminNotesToClient !== undefined) {
      this.props.adminNotesToClient = cleanText(input.adminNotesToClient);
    }
  }

  private resetConsultantDeadline(now: Date, explicit?: Date | null): void {
    if (explicit) {
      this.props.consultantDeadline = SlaDeadline.at(explicit);
    } else if (!this.props.consultantDeadline || this.props.consultantDeadline.isExceeded(now)) {
      this.props.consultantDeadline = SlaDeadline.hoursFrom(now, CONSULTANT_SLA_HOURS);
    }
  }

  private assertAdmin(by: QuoteActorRef): void {
    if (by.actor !== QuoteActor.ADMIN) {
      throw new ForbiddenException('ADMIN_ONLY', 'Only an administrator can perform this action');
    }
  }

  private assertClientOwner(by: QuoteActorRef): void {
    if (by.actor !== QuoteActor.CLIENT || !this.isOwnedBy(by.actorId) || this.isSubquote) {
      throw quoteAccessDenied();
    }
  }

  private transitionTo(to: QuoteStatus, by: QuoteActorRef, now: Date): void {
    const from = this.props.status;
    QuoteStatusTransitionService.assertCanTransition(from, to, by.actor);
    this.props.status = to;
    this.addDomainEvent(
      new QuoteStatusChanged(
        this.id,
        { from, to, actor: by.actor, actorId: by.actorId, clientId: this.props.clientId },
        now,
      ),
    );
  }

  private recordCreated(actorId: string | null, now: Date): void {
    this.addDomainEvent(
      new QuoteCreated(
        this.id,
        {
          clientId: this.props.clientId,
          requestNumber: this.props.requestNumber.value,
          isSubquote: this.props.isSubquote,
          parentQuoteId: this.props.parentQuoteId,
          status: this.props.status,
          actorId,
        },
        now,
      ),
    );
  }

  private touch(now: Date): void {
    this.props.updatedAt = now;
  }
}
