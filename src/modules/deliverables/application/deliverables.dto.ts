import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { IncomingFile } from '@shared/application/files';
import { Deliverable } from '../domain';

export interface DeliverableRef {
  actor: ActorContext;
  deliverableId: string;
}

export interface UploadDeliverableInput {
  actor: ActorContext;
  missionId: string;
  file: IncomingFile;
}

export interface ListDeliverablesInput extends Partial<PageQuery> {
  actor: ActorContext;
  /** admin only (ignored for other audiences) */
  consultantId?: string;
  missionId?: string;
  /** client validation */
  validated?: boolean;
  /** admin validation (ignored for clients: always true for them) */
  adminValidated?: boolean;
  uploadedFrom?: Date;
  uploadedTo?: Date;
}

/** Client view: no author, no internal validation detail. */
export interface ClientDeliverableView {
  id: string;
  missionId: string;
  fileName: string;
  mimeType: string | null;
  size: number;
  uploadedAt: Date;
  clientValidated: boolean;
  validatedAt: Date | null;
}

export interface DeliverableView extends ClientDeliverableView {
  consultantId: string;
  clientId: string;
  adminValidated: boolean;
  adminValidatedAt: Date | null;
}

export const toClientDeliverableView = (d: Deliverable): ClientDeliverableView => ({
  id: d.id,
  missionId: d.missionId,
  fileName: d.file.originalName,
  mimeType: d.file.mimeType,
  size: d.file.size,
  uploadedAt: d.uploadedAt,
  clientValidated: d.clientValidated,
  validatedAt: d.clientValidatedAt,
});

export const toDeliverableView = (d: Deliverable): DeliverableView => ({
  ...toClientDeliverableView(d),
  consultantId: d.consultantId,
  clientId: d.clientId,
  adminValidated: d.adminValidated,
  adminValidatedAt: d.adminValidatedAt,
});
