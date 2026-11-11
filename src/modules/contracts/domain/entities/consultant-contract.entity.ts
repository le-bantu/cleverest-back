import { AbstractAggregateRoot, assertFileAllowed, StoredFileRef } from '@shared/kernel';
import {
  ConsultantContractAlreadyExists,
  consultantContractAlreadySigned,
  consultantContractNotFound,
  consultantNotOnQuote,
  invalidConsultantContractAmount,
  quoteNotEngageable,
} from '../errors';
import { ConsultantContractCreated, ConsultantContractSigned } from '../events/contract.events';
import { QuoteForContract } from '../ports/quote-gateway.port';
import { CONTRACT_FILE_POLICY } from './contract.entity';

export interface ConsultantContractProps {
  id: string;
  /** the quote (usually a subquote) the consultant priced */
  quoteId: string;
  /** main quote: `quoteId` itself, or the parent of a subquote (links to the mission) */
  rootQuoteId: string;
  consultantId: string;
  /** what Cleverest owes the consultant (EUR, 2 decimals) */
  amount: number;
  createdById: string | null;
  originalFile: StoredFileRef;
  signedFile: StoredFileRef | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_AMOUNT = 999_999_999_999.99;

const checkAmount = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw invalidConsultantContractAmount('INVALID_AMOUNT', 'The amount must be a positive number');
  }
  return Math.round(amount * 100) / 100;
};

/**
 * Engagement between Cleverest and ONE consultant, backed by the quote the
 * consultant priced (subquote, or the main quote when it was not split).
 * Distinct from the client `Contract`: drawn up by an admin, signed once by
 * the consultant. Required before the consultant delivers on the mission.
 */
export class ConsultantContract extends AbstractAggregateRoot<string> {
  private props: ConsultantContractProps;

  private constructor(props: ConsultantContractProps) {
    super(props.id);
    this.props = props;
  }

  /**
   * @param amount explicit amount; defaults to the subquote's price. Required
   *   on a main quote (its price is the client price, shared by the team).
   * @param alreadyExists whether a contract is stored for (quote, consultant)
   */
  static create(
    input: {
      id: string;
      quote: QuoteForContract;
      consultantId: string;
      amount?: number | null;
      originalFile: StoredFileRef;
      createdById: string;
      alreadyExists: boolean;
    },
    now: Date,
  ): ConsultantContract {
    const { quote, consultantId } = input;
    if (input.alreadyExists) throw new ConsultantContractAlreadyExists(quote.id, consultantId);
    if (!quote.priceValidated) throw quoteNotEngageable(quote.id, quote.status);
    if (!quote.consultantIds.includes(consultantId)) {
      throw consultantNotOnQuote(quote.id, consultantId);
    }
    const fallback = quote.isSubquote ? quote.price : null;
    const amount = input.amount ?? fallback;
    if (amount === null) {
      throw invalidConsultantContractAmount(
        'AMOUNT_REQUIRED',
        'An amount is required for a consultant contract on a main quote',
      );
    }
    assertFileAllowed(input.originalFile, CONTRACT_FILE_POLICY);

    const contract = new ConsultantContract({
      id: input.id,
      quoteId: quote.id,
      rootQuoteId: quote.parentQuoteId ?? quote.id,
      consultantId,
      amount: checkAmount(amount),
      createdById: input.createdById,
      originalFile: input.originalFile,
      signedFile: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    contract.addDomainEvent(
      new ConsultantContractCreated(
        input.id,
        {
          quoteId: quote.id,
          consultantId,
          amount: contract.amount,
          actorId: input.createdById,
        },
        now,
      ),
    );
    return contract;
  }

  static rehydrate(props: ConsultantContractProps): ConsultantContract {
    return new ConsultantContract({ ...props });
  }

  get quoteId(): string {
    return this.props.quoteId;
  }
  get rootQuoteId(): string {
    return this.props.rootQuoteId;
  }
  get consultantId(): string {
    return this.props.consultantId;
  }
  get amount(): number {
    return this.props.amount;
  }
  get createdById(): string | null {
    return this.props.createdById;
  }
  get originalFile(): StoredFileRef {
    return this.props.originalFile;
  }
  get signedFile(): StoredFileRef | null {
    return this.props.signedFile;
  }
  get signed(): boolean {
    return this.props.signedAt !== null;
  }
  get signedAt(): Date | null {
    return this.props.signedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  belongsTo(consultantId: string): boolean {
    return this.props.consultantId === consultantId;
  }

  /** The consultant uploads the signed PDF, once. */
  sign(consultantId: string, signedFile: StoredFileRef, now: Date): void {
    if (!this.belongsTo(consultantId)) throw consultantContractNotFound(this.id);
    if (this.signed) throw consultantContractAlreadySigned(this.id);
    assertFileAllowed(signedFile, CONTRACT_FILE_POLICY);
    this.props.signedFile = signedFile;
    this.props.signedAt = now;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new ConsultantContractSigned(
        this.id,
        { quoteId: this.props.quoteId, consultantId, actorId: consultantId },
        now,
      ),
    );
  }

  /** An admin may withdraw a contract the consultant has not signed yet. */
  assertDeletable(): void {
    if (this.signed) throw consultantContractAlreadySigned(this.id);
  }
}
