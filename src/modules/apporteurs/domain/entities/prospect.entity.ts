import {
  AbstractAggregateRoot,
  assertFileAllowed,
  FilePolicy,
  MAX_UPLOAD_BYTES,
  StoredFileRef,
} from '@shared/kernel';
import {
  invalidProspect,
  prospectAlreadyProcessed,
  prospectEmailRequired,
  prospectNotFound,
} from '../errors';
import { ProspectConverted, ProspectCreated, ProspectRejected } from '../events/apporteur.events';
import { ProspectStatus } from '../value-objects/statuses';

export const PROSPECT_DOCUMENT_POLICY: FilePolicy = {
  maxBytes: MAX_UPLOAD_BYTES,
  extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEXT_MAX = 255;

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length > TEXT_MAX) {
    throw invalidProspect(
      'PROSPECT_FIELD_TOO_LONG',
      `Fields are limited to ${TEXT_MAX} characters`,
    );
  }
  return trimmed ? trimmed : null;
};

export interface ProspectProps {
  id: string;
  apporteurId: string;
  name: string;
  company: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  document: StoredFileRef | null;
  status: ProspectStatus;
  rejectedReason: string | null;
  clientId: string | null;
  missionId: string | null;
  processedAt: Date | null;
  processedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A business lead brought by an apporteur. Converted OR rejected by an admin — once. */
export class Prospect extends AbstractAggregateRoot<string> {
  private props: ProspectProps;

  private constructor(props: ProspectProps) {
    super(props.id);
    this.props = props;
  }

  static create(
    input: {
      id: string;
      apporteurId: string;
      name: string;
      company?: string | null;
      contactEmail?: string | null;
      contactPhone?: string | null;
    },
    now: Date,
  ): Prospect {
    const name = clean(input.name);
    if (!name) throw invalidProspect('PROSPECT_NAME_REQUIRED', 'The prospect name is required');
    const contactEmail = clean(input.contactEmail)?.toLowerCase() ?? null;
    if (contactEmail && !EMAIL.test(contactEmail)) {
      throw invalidProspect('INVALID_EMAIL', 'The contact email is not valid');
    }
    const prospect = new Prospect({
      id: input.id,
      apporteurId: input.apporteurId,
      name,
      company: clean(input.company),
      contactEmail,
      contactPhone: clean(input.contactPhone),
      document: null,
      status: ProspectStatus.EN_ATTENTE,
      rejectedReason: null,
      clientId: null,
      missionId: null,
      processedAt: null,
      processedById: null,
      createdAt: now,
      updatedAt: now,
    });
    prospect.addDomainEvent(new ProspectCreated(input.id, { apporteurId: input.apporteurId }, now));
    return prospect;
  }

  static rehydrate(props: ProspectProps): Prospect {
    return new Prospect({ ...props });
  }

  get apporteurId(): string {
    return this.props.apporteurId;
  }
  get name(): string {
    return this.props.name;
  }
  get company(): string | null {
    return this.props.company;
  }
  /** company if known, else the contact name */
  get displayName(): string {
    return this.props.company ?? this.props.name;
  }
  get contactEmail(): string | null {
    return this.props.contactEmail;
  }
  get contactPhone(): string | null {
    return this.props.contactPhone;
  }
  get document(): StoredFileRef | null {
    return this.props.document;
  }
  get status(): ProspectStatus {
    return this.props.status;
  }
  get rejectedReason(): string | null {
    return this.props.rejectedReason;
  }
  get clientId(): string | null {
    return this.props.clientId;
  }
  get missionId(): string | null {
    return this.props.missionId;
  }
  get processedAt(): Date | null {
    return this.props.processedAt;
  }
  get processedById(): string | null {
    return this.props.processedById;
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

  /** Owner only, while pending. Returns the replaced document (to delete from storage). */
  attachDocument(apporteurId: string, file: StoredFileRef, now: Date): StoredFileRef | null {
    if (!this.isOwnedBy(apporteurId)) throw prospectNotFound(this.id);
    this.assertPending();
    assertFileAllowed(file, PROSPECT_DOCUMENT_POLICY);
    const previous = this.props.document;
    this.props.document = file;
    this.props.updatedAt = now;
    return previous;
  }

  /** Checks a conversion can start (pending + contact email) — before anything is prepared. */
  assertConvertible(): string {
    this.assertPending();
    if (!this.props.contactEmail) throw prospectEmailRequired(this.id);
    return this.props.contactEmail;
  }

  /** EN_ATTENTE → CONVERTI (non re-entrant). */
  convert(adminId: string, result: { clientId: string; missionId: string }, now: Date): void {
    this.assertConvertible();
    this.props.status = ProspectStatus.CONVERTI;
    this.props.clientId = result.clientId;
    this.props.missionId = result.missionId;
    this.markProcessed(adminId, now);
    this.addDomainEvent(
      new ProspectConverted(
        this.id,
        { apporteurId: this.props.apporteurId, ...result, actorId: adminId },
        now,
      ),
    );
  }

  /** EN_ATTENTE → REJETÉ. */
  reject(adminId: string, reason: string | null | undefined, now: Date): void {
    this.assertPending();
    this.props.status = ProspectStatus.REJETE;
    this.props.rejectedReason = reason?.trim() || null;
    this.markProcessed(adminId, now);
    this.addDomainEvent(
      new ProspectRejected(
        this.id,
        {
          apporteurId: this.props.apporteurId,
          reason: this.props.rejectedReason,
          actorId: adminId,
        },
        now,
      ),
    );
  }

  private assertPending(): void {
    if (this.props.status !== ProspectStatus.EN_ATTENTE) {
      throw prospectAlreadyProcessed(this.id, this.props.status);
    }
  }

  private markProcessed(adminId: string, now: Date): void {
    this.props.processedAt = now;
    this.props.processedById = adminId;
    this.props.updatedAt = now;
  }
}
