import {
  AbstractAggregateRoot,
  assertFileAllowed,
  FilePolicy,
  MAX_UPLOAD_BYTES,
  StoredFileRef,
} from '@shared/kernel';
import {
  ContractAlreadyExists,
  contractAlreadySigned,
  contractNotFound,
  QuoteNotReadyForContract,
} from '../errors';
import { ContractCreated, ContractSigned } from '../events/contract.events';
import { QuoteForContract } from '../ports/quote-gateway.port';

export const CONTRACT_FILE_POLICY: FilePolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  extensions: ['.pdf'],
};

export interface ContractProps {
  id: string;
  quoteId: string;
  /** owner of the quote, captured at creation (ownership checks without a cross-context join) */
  clientId: string;
  createdById: string | null;
  originalFile: StoredFileRef;
  signedFile: StoredFileRef | null;
  signed: boolean;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Contract drawn up by an admin from a validated quote, signed once by the client. */
export class Contract extends AbstractAggregateRoot<string> {
  private props: ContractProps;

  private constructor(props: ContractProps) {
    super(props.id);
    this.props = props;
  }

  /**
   * @param alreadyExists whether a contract is already stored for the quote
   */
  static create(
    input: {
      id: string;
      quote: QuoteForContract;
      originalFile: StoredFileRef;
      createdById: string;
      alreadyExists: boolean;
    },
    now: Date,
  ): Contract {
    const { quote } = input;
    if (input.alreadyExists) throw new ContractAlreadyExists(quote.id);
    if (!quote.readyForContract || quote.isSubquote) {
      throw new QuoteNotReadyForContract(quote.id, quote.status);
    }
    assertFileAllowed(input.originalFile, CONTRACT_FILE_POLICY);

    const contract = new Contract({
      id: input.id,
      quoteId: quote.id,
      clientId: quote.clientId,
      createdById: input.createdById,
      originalFile: input.originalFile,
      signedFile: null,
      signed: false,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    contract.addDomainEvent(
      new ContractCreated(
        input.id,
        { quoteId: quote.id, clientId: quote.clientId, actorId: input.createdById },
        now,
      ),
    );
    return contract;
  }

  static rehydrate(props: ContractProps): Contract {
    return new Contract({ ...props });
  }

  get quoteId(): string {
    return this.props.quoteId;
  }
  get clientId(): string {
    return this.props.clientId;
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
    return this.props.signed;
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

  isOwnedBy(clientId: string): boolean {
    return this.props.clientId === clientId;
  }

  /** Mono-signature: the owning client uploads the signed PDF, once. */
  sign(clientId: string, signedFile: StoredFileRef, now: Date): void {
    if (!this.isOwnedBy(clientId)) throw contractNotFound(this.id);
    if (this.props.signed) throw contractAlreadySigned(this.id);
    assertFileAllowed(signedFile, CONTRACT_FILE_POLICY);
    this.props.signed = true;
    this.props.signedAt = now;
    this.props.signedFile = signedFile;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new ContractSigned(
        this.id,
        { quoteId: this.props.quoteId, clientId, actorId: clientId },
        now,
      ),
    );
  }
}
