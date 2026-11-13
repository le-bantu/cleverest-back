import {
  AbstractAggregateRoot,
  assertFileAllowed,
  FilePolicy,
  MAX_UPLOAD_BYTES,
  positiveAmount,
  StoredFileRef,
} from '@shared/kernel';
import { missionNotFound, paymentAlreadyValidated } from '../errors';
import { PaymentSubmitted, PaymentValidated } from '../events/payment.events';
import { MissionForPayment } from '../ports/billing.ports';

export const PROOF_FILE_POLICY: FilePolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
};

export interface PaymentProps {
  id: string;
  missionId: string;
  /** owner of the mission, captured at submission */
  clientId: string;
  amount: number;
  proofFile: StoredFileRef;
  validatedAt: Date | null;
  validatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A payment DECLARED by the client (bank transfer proof); no money moves
 * through the platform. An admin validates it once.
 */
export class Payment extends AbstractAggregateRoot<string> {
  private props: PaymentProps;

  private constructor(props: PaymentProps) {
    super(props.id);
    this.props = props;
  }

  static submit(
    input: {
      id: string;
      mission: MissionForPayment;
      clientId: string;
      amount: number;
      proofFile: StoredFileRef;
    },
    now: Date,
  ): Payment {
    const { mission } = input;
    // no existence leak: a client paying someone else's mission sees a 404
    if (mission.clientId !== input.clientId) throw missionNotFound(mission.id);
    const amount = positiveAmount(input.amount);
    assertFileAllowed(input.proofFile, PROOF_FILE_POLICY);
    const payment = new Payment({
      id: input.id,
      missionId: mission.id,
      clientId: input.clientId,
      amount,
      proofFile: input.proofFile,
      validatedAt: null,
      validatedById: null,
      createdAt: now,
      updatedAt: now,
    });
    payment.addDomainEvent(
      new PaymentSubmitted(
        input.id,
        { missionId: mission.id, clientId: input.clientId, amount },
        now,
      ),
    );
    return payment;
  }

  static rehydrate(props: PaymentProps): Payment {
    return new Payment({ ...props });
  }

  get missionId(): string {
    return this.props.missionId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get amount(): number {
    return this.props.amount;
  }
  get proofFile(): StoredFileRef {
    return this.props.proofFile;
  }
  get isValidated(): boolean {
    return this.props.validatedAt !== null;
  }
  get validatedAt(): Date | null {
    return this.props.validatedAt;
  }
  get validatedById(): string | null {
    return this.props.validatedById;
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

  validate(adminId: string, now: Date): void {
    if (this.isValidated) throw paymentAlreadyValidated(this.id);
    this.props.validatedAt = now;
    this.props.validatedById = adminId;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new PaymentValidated(
        this.id,
        {
          missionId: this.props.missionId,
          clientId: this.props.clientId,
          amount: this.props.amount,
          actorId: adminId,
        },
        now,
      ),
    );
  }
}
