import {
  AbstractAggregateRoot,
  assertFileAllowed,
  FilePolicy,
  MAX_UPLOAD_BYTES,
  StoredFileRef,
} from '@shared/kernel';
import {
  consultantContractNotSigned,
  deliverableNotFound,
  missionNotActive,
  notAssignedToMission,
} from '../errors';
import {
  DeliverableUploaded,
  DeliverableValidatedByAdmin,
  DeliverableValidatedByClient,
} from '../events/deliverable.events';
import { MissionForDeliverable } from '../ports/mission-gateway.port';

export const DELIVERABLE_FILE_POLICY: FilePolicy = { maxBytes: MAX_UPLOAD_BYTES, extensions: [] };

/** Who looks at a deliverable (structurally the shared `ActorRef`). */
export interface DeliverableViewer {
  userId: string;
  kind: 'ADMIN' | 'CONSULTANT' | 'CLIENT' | 'APPORTEUR';
}

export interface DeliverableProps {
  id: string;
  missionId: string;
  /** author */
  consultantId: string;
  /** owner of the mission, captured at upload */
  clientId: string;
  file: StoredFileRef;
  uploadedAt: Date;
  clientValidated: boolean;
  clientValidatedAt: Date | null;
  adminValidated: boolean;
  adminValidatedAt: Date | null;
  adminValidatedById: string | null;
}

/**
 * A file delivered on a mission. Two independent validations (client, admin);
 * the client only ever sees it once an admin validated it.
 */
export class Deliverable extends AbstractAggregateRoot<string> {
  private props: DeliverableProps;

  private constructor(props: DeliverableProps) {
    super(props.id);
    this.props = props;
  }

  static upload(
    input: {
      id: string;
      mission: MissionForDeliverable;
      consultantId: string;
      /** the consultant signed their consultant contract for this mission's quote */
      engaged: boolean;
      file: StoredFileRef;
    },
    now: Date,
  ): Deliverable {
    const { mission } = input;
    if (!mission.consultantIds.includes(input.consultantId)) throw notAssignedToMission();
    if (!mission.active) throw missionNotActive(mission.id, mission.status);
    if (!input.engaged) throw consultantContractNotSigned();
    assertFileAllowed(input.file, DELIVERABLE_FILE_POLICY);
    const deliverable = new Deliverable({
      id: input.id,
      missionId: mission.id,
      consultantId: input.consultantId,
      clientId: mission.clientId,
      file: input.file,
      uploadedAt: now,
      clientValidated: false,
      clientValidatedAt: null,
      adminValidated: false,
      adminValidatedAt: null,
      adminValidatedById: null,
    });
    deliverable.addDomainEvent(
      new DeliverableUploaded(input.id, deliverable.eventData(input.consultantId), now),
    );
    return deliverable;
  }

  static rehydrate(props: DeliverableProps): Deliverable {
    return new Deliverable({ ...props });
  }

  get missionId(): string {
    return this.props.missionId;
  }
  get consultantId(): string {
    return this.props.consultantId;
  }
  get clientId(): string {
    return this.props.clientId;
  }
  get file(): StoredFileRef {
    return this.props.file;
  }
  get uploadedAt(): Date {
    return this.props.uploadedAt;
  }
  get clientValidated(): boolean {
    return this.props.clientValidated;
  }
  get clientValidatedAt(): Date | null {
    return this.props.clientValidatedAt;
  }
  get adminValidated(): boolean {
    return this.props.adminValidated;
  }
  get adminValidatedAt(): Date | null {
    return this.props.adminValidatedAt;
  }
  get adminValidatedById(): string | null {
    return this.props.adminValidatedById;
  }

  /** The client sees a deliverable of their mission only once an admin validated it. */
  isVisibleToClient(clientId: string): boolean {
    return this.props.clientId === clientId && this.props.adminValidated;
  }

  /** Admin: all; consultant: their own uploads; client: released deliverables of their missions. */
  isVisibleTo(viewer: DeliverableViewer): boolean {
    switch (viewer.kind) {
      case 'ADMIN':
        return true;
      case 'CONSULTANT':
        return this.props.consultantId === viewer.userId;
      default:
        return this.isVisibleToClient(viewer.userId);
    }
  }

  /** Releases the deliverable to the client. Idempotent. */
  validateByAdmin(adminId: string, now: Date): void {
    if (this.props.adminValidated) return;
    this.props.adminValidated = true;
    this.props.adminValidatedAt = now;
    this.props.adminValidatedById = adminId;
    this.addDomainEvent(new DeliverableValidatedByAdmin(this.id, this.eventData(adminId), now));
  }

  /** The owning client accepts a released deliverable. Idempotent. */
  validateByClient(clientId: string, now: Date): void {
    if (!this.isVisibleToClient(clientId)) throw deliverableNotFound(this.id);
    if (this.props.clientValidated) return;
    this.props.clientValidated = true;
    this.props.clientValidatedAt = now;
    this.addDomainEvent(new DeliverableValidatedByClient(this.id, this.eventData(clientId), now));
  }

  private eventData(actorId: string) {
    return {
      missionId: this.props.missionId,
      clientId: this.props.clientId,
      consultantId: this.props.consultantId,
      actorId,
    };
  }
}
