import {
  AbstractAggregateRoot,
  assertFileAllowed,
  FilePolicy,
  MAX_UPLOAD_BYTES,
  positiveAmount,
  StoredFileRef,
  sumAmounts,
} from '@shared/kernel';
import {
  consultantInvoiceAlreadyPaid,
  contractFullyInvoiced,
  invoiceContractNotSigned,
  invoiceExceedsContract,
  invoiceMissionNotFound,
} from '../errors';
import {
  ConsultantInvoicePaid,
  ConsultantInvoiceSubmitted,
} from '../events/consultant-invoice.events';
import { MissionForInvoice } from '../ports/invoicing.ports';

export const CONSULTANT_INVOICE_FILE_POLICY: FilePolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
};

/** Who looks at an invoice (structurally the shared `ActorRef`). */
export interface InvoiceViewer {
  userId: string;
  kind: 'ADMIN' | 'CONSULTANT' | 'CLIENT' | 'APPORTEUR';
}

/** The consultant's engagement on the mission's main quote. */
export interface Commitment {
  /** signed contract amount(s); null = no signed consultant contract */
  signedAmount: number | null;
  /** already invoiced by the consultant on the same main quote */
  alreadyInvoiced: number;
}

export interface ConsultantInvoiceProps {
  id: string;
  consultantId: string;
  missionId: string;
  quoteId: string;
  amount: number;
  file: StoredFileRef;
  uploadedAt: Date;
  paidAt: Date | null;
  paidById: string | null;
}

/**
 * Invoice a consultant sends to Cleverest for their work on a mission. Backed
 * by the signed consultant contract: the invoices never exceed its amount.
 */
export class ConsultantInvoice extends AbstractAggregateRoot<string> {
  private props: ConsultantInvoiceProps;

  private constructor(props: ConsultantInvoiceProps) {
    super(props.id);
    this.props = props;
  }

  /** @param amount defaults to what remains to invoice on the contract */
  static submit(
    input: {
      id: string;
      mission: MissionForInvoice;
      consultantId: string;
      amount?: number | null;
      commitment: Commitment;
      file: StoredFileRef;
    },
    now: Date,
  ): ConsultantInvoice {
    const { mission, commitment } = input;
    if (!mission.consultantIds.includes(input.consultantId))
      throw invoiceMissionNotFound(mission.id);
    if (commitment.signedAmount === null) throw invoiceContractNotSigned();
    const remaining = sumAmounts([commitment.signedAmount, -commitment.alreadyInvoiced]);
    if (remaining <= 0) throw contractFullyInvoiced(mission.quoteId);
    const amount = positiveAmount(input.amount ?? remaining);
    if (amount > remaining) throw invoiceExceedsContract(remaining);
    assertFileAllowed(input.file, CONSULTANT_INVOICE_FILE_POLICY);

    const invoice = new ConsultantInvoice({
      id: input.id,
      consultantId: input.consultantId,
      missionId: mission.id,
      quoteId: mission.quoteId,
      amount,
      file: input.file,
      uploadedAt: now,
      paidAt: null,
      paidById: null,
    });
    invoice.addDomainEvent(
      new ConsultantInvoiceSubmitted(
        input.id,
        { missionId: mission.id, consultantId: input.consultantId, amount },
        now,
      ),
    );
    return invoice;
  }

  static rehydrate(props: ConsultantInvoiceProps): ConsultantInvoice {
    return new ConsultantInvoice({ ...props });
  }

  get consultantId(): string {
    return this.props.consultantId;
  }
  get missionId(): string {
    return this.props.missionId;
  }
  get quoteId(): string {
    return this.props.quoteId;
  }
  get amount(): number {
    return this.props.amount;
  }
  get file(): StoredFileRef {
    return this.props.file;
  }
  get uploadedAt(): Date {
    return this.props.uploadedAt;
  }
  get isPaid(): boolean {
    return this.props.paidAt !== null;
  }
  get paidAt(): Date | null {
    return this.props.paidAt;
  }
  get paidById(): string | null {
    return this.props.paidById;
  }

  isVisibleTo(viewer: InvoiceViewer): boolean {
    return (
      viewer.kind === 'ADMIN' ||
      (viewer.kind === 'CONSULTANT' && viewer.userId === this.props.consultantId)
    );
  }

  markPaid(adminId: string, now: Date): void {
    if (this.isPaid) throw consultantInvoiceAlreadyPaid(this.id);
    this.props.paidAt = now;
    this.props.paidById = adminId;
    this.addDomainEvent(
      new ConsultantInvoicePaid(
        this.id,
        {
          missionId: this.props.missionId,
          consultantId: this.props.consultantId,
          amount: this.props.amount,
          actorId: adminId,
        },
        now,
      ),
    );
  }
}
