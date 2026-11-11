import { generateUuid } from '@shared/kernel';
import {
  ConsultantAssignment,
  DocumentVisibility,
  Money,
  Quote,
  QuoteActor,
  QuoteActorRef,
  QuoteDocument,
  QuoteProps,
  QuoteStatus,
  QuoteType,
  RequestNumber,
  SlaDeadline,
} from '../domain';

export const NOW = new Date('2026-03-01T10:00:00.000Z');

export const adminRef = (actorId = 'admin-1'): QuoteActorRef => ({
  actorId,
  actor: QuoteActor.ADMIN,
});
export const clientRef = (actorId = 'client-1'): QuoteActorRef => ({
  actorId,
  actor: QuoteActor.CLIENT,
});
export const consultantRef = (actorId = 'consultant-1'): QuoteActorRef => ({
  actorId,
  actor: QuoteActor.CONSULTANT,
});

/**
 * Fluent builder for the Quote aggregate in any state, without replaying the
 * workflow. `aQuote().withStatus(QuoteStatus.COTE).withConsultants('c1').build()`
 */
export class QuoteBuilder {
  private props: QuoteProps = {
    id: generateUuid(),
    clientId: 'client-1',
    parentQuoteId: null,
    isSubquote: false,
    requestNumber: RequestNumber.fromSequence(1),
    type: QuoteType.CONSULTATION,
    title: 'Audit fiscal',
    description: 'Besoin d’un audit fiscal complet',
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
    adminDeadline: SlaDeadline.hoursFrom(NOW, 24),
    consultantDeadline: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  withId(id: string): this {
    this.props.id = id;
    return this;
  }
  withClient(clientId: string): this {
    this.props.clientId = clientId;
    return this;
  }
  withStatus(status: QuoteStatus): this {
    this.props.status = status;
    return this;
  }
  withPrice(amount: number | null): this {
    this.props.price = amount === null ? null : Money.of(amount);
    return this;
  }
  withSequence(sequence: number): this {
    this.props.requestNumber = RequestNumber.fromSequence(sequence);
    return this;
  }
  withType(type: QuoteType): this {
    this.props.type = type;
    return this;
  }
  withTitle(title: string | null): this {
    this.props.title = title;
    return this;
  }
  withDescription(description: string): this {
    this.props.description = description;
    return this;
  }
  /** first id becomes lead unless `lead` is given (pass null for no lead) */
  withConsultants(...ids: string[]): this {
    this.props.consultants = ids.map((consultantId, i) => ({ consultantId, isLead: i === 0 }));
    return this;
  }
  withAssignments(assignments: ConsultantAssignment[]): this {
    this.props.consultants = assignments;
    return this;
  }
  withConsultantDeadline(date: Date | null): this {
    this.props.consultantDeadline = date ? SlaDeadline.at(date) : null;
    return this;
  }
  asSubquoteOf(parentId: string): this {
    this.props.isSubquote = true;
    this.props.parentQuoteId = parentId;
    return this;
  }
  withCreatedAt(date: Date): this {
    this.props.createdAt = date;
    return this;
  }
  withValidatedAt(date: Date | null): this {
    this.props.validatedAt = date;
    return this;
  }

  build(): Quote {
    return Quote.rehydrate({ ...this.props });
  }
}

export const aQuote = (): QuoteBuilder => new QuoteBuilder();

export const aDocument = (
  overrides: Partial<{
    id: string;
    quoteId: string;
    uploadedById: string;
    uploadedByRole: QuoteActor;
    visibility: DocumentVisibility;
    label: string | null;
    originalName: string;
  }> = {},
): QuoteDocument =>
  QuoteDocument.rehydrate({
    id: overrides.id ?? generateUuid(),
    quoteId: overrides.quoteId ?? 'quote-1',
    uploadedById: overrides.uploadedById ?? 'admin-1',
    uploadedByRole: overrides.uploadedByRole ?? QuoteActor.ADMIN,
    label: overrides.label ?? null,
    path: 'quotes/quote-1/file.pdf',
    originalName: overrides.originalName ?? 'file.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    comment: null,
    visibility: overrides.visibility ?? DocumentVisibility.create('ALL'),
    createdAt: NOW,
  });
