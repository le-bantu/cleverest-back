import { AbstractAggregateRoot, positiveAmount } from '@shared/kernel';
import {
  commissionAmountRequired,
  commissionLocked,
  commissionTransitionNotAllowed,
} from '../errors';
import { CommissionCreated, CommissionStatusChanged } from '../events/apporteur.events';
import { COMMISSION_NEXT, CommissionStatus } from '../value-objects/statuses';

export interface CommissionProps {
  id: string;
  apporteurId: string;
  prospectId: string;
  clientId: string;
  missionId: string;
  clientName: string;
  missionTitle: string;
  amount: number | null;
  status: CommissionStatus;
  validatedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What Cleverest owes an apporteur for a converted prospect. */
export class Commission extends AbstractAggregateRoot<string> {
  private props: CommissionProps;

  private constructor(props: CommissionProps) {
    super(props.id);
    this.props = props;
  }

  static createForConversion(
    input: {
      id: string;
      apporteurId: string;
      prospectId: string;
      clientId: string;
      missionId: string;
      clientName: string;
      missionTitle: string;
      amount?: number | null;
      actorId: string;
    },
    now: Date,
  ): Commission {
    const commission = new Commission({
      id: input.id,
      apporteurId: input.apporteurId,
      prospectId: input.prospectId,
      clientId: input.clientId,
      missionId: input.missionId,
      clientName: input.clientName,
      missionTitle: input.missionTitle,
      amount: input.amount == null ? null : positiveAmount(input.amount),
      status: CommissionStatus.EN_ATTENTE,
      validatedAt: null,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    });
    commission.addDomainEvent(
      new CommissionCreated(
        input.id,
        { apporteurId: input.apporteurId, missionId: input.missionId, actorId: input.actorId },
        now,
      ),
    );
    return commission;
  }

  static rehydrate(props: CommissionProps): Commission {
    return new Commission({ ...props });
  }

  get apporteurId(): string {
    return this.props.apporteurId;
  }
  get prospectId(): string {
    return this.props.prospectId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get missionId(): string {
    return this.props.missionId;
  }
  get clientName(): string {
    return this.props.clientName;
  }
  get missionTitle(): string {
    return this.props.missionTitle;
  }
  get amount(): number | null {
    return this.props.amount;
  }
  get status(): CommissionStatus {
    return this.props.status;
  }
  get validatedAt(): Date | null {
    return this.props.validatedAt;
  }
  get paidAt(): Date | null {
    return this.props.paidAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isOwnedBy(apporteurId: string): boolean {
    return this.props.apporteurId === apporteurId;
  }

  /** The amount is negotiated while pending; frozen once validated. */
  setAmount(amount: number, now: Date): void {
    if (this.props.status !== CommissionStatus.EN_ATTENTE) {
      throw commissionLocked(this.id, this.props.status);
    }
    this.props.amount = positiveAmount(amount);
    this.props.updatedAt = now;
  }

  /** Forward only: EN_ATTENTE → VALIDÉE (amount required) → PAYÉE. */
  updateStatus(target: CommissionStatus, adminId: string, now: Date): void {
    const from = this.props.status;
    if (COMMISSION_NEXT.get(from) !== target) throw commissionTransitionNotAllowed(from, target);
    if (target === CommissionStatus.VALIDEE) {
      if (this.props.amount === null) throw commissionAmountRequired(this.id);
      this.props.validatedAt = now;
    }
    if (target === CommissionStatus.PAYEE) this.props.paidAt = now;
    this.props.status = target;
    this.props.updatedAt = now;
    this.addDomainEvent(
      new CommissionStatusChanged(
        this.id,
        { apporteurId: this.props.apporteurId, from, to: target, actorId: adminId },
        now,
      ),
    );
  }
}
