import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { IncomingFile } from '@shared/application/files';
import { Commission, CommissionStatus, Prospect, ProspectStatus } from '../domain';

export interface ProspectRef {
  actor: ActorContext;
  prospectId: string;
}

export interface CreateProspectInput {
  actor: ActorContext;
  name: string;
  company?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}

export interface UploadProspectDocumentInput extends ProspectRef {
  file: IncomingFile;
}

export interface ListProspectsInput extends Partial<PageQuery> {
  actor: ActorContext;
  /** admin only */
  apporteurId?: string;
  status?: ProspectStatus;
}

export interface RejectProspectInput extends ProspectRef {
  reason?: string | null;
}

export interface ConvertProspectInput extends ProspectRef {
  quoteTitle: string;
  /** defaults to a description built from the prospect */
  description?: string | null;
  /** CONSULTATION (default) or ABONNEMENT */
  quoteType?: string;
  /** price of the closed deal (EUR) */
  price: number;
  missionTitle: string;
  missionDescription?: string | null;
  deliveryDate?: Date | null;
  /** optional, can be set later (`PATCH /admin/commissions/:id`) */
  commissionAmount?: number | null;
  /** contract signed by the client (PDF) */
  signedContract: IncomingFile;
  /** mission contract (pdf / doc / docx) */
  contractMission: IncomingFile;
}

export interface ProspectView {
  id: string;
  apporteurId: string;
  name: string;
  company: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  documentName: string | null;
  status: ProspectStatus;
  rejectedReason: string | null;
  clientId: string | null;
  missionId: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const toProspectView = (p: Prospect): ProspectView => ({
  id: p.id,
  apporteurId: p.apporteurId,
  name: p.name,
  company: p.company,
  contactEmail: p.contactEmail,
  contactPhone: p.contactPhone,
  documentName: p.document?.originalName ?? null,
  status: p.status,
  rejectedReason: p.rejectedReason,
  clientId: p.clientId,
  missionId: p.missionId,
  processedAt: p.processedAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

export interface ConversionResult {
  prospect: ProspectView;
  clientId: string;
  clientCreated: boolean;
  quoteId: string;
  contractId: string;
  missionId: string;
  commissionId: string;
}

export interface CommissionRef {
  actor: ActorContext;
  commissionId: string;
}

export interface ListCommissionsInput extends Partial<PageQuery> {
  actor: ActorContext;
  /** admin only */
  apporteurId?: string;
  status?: CommissionStatus;
  missionId?: string;
}

export interface UpdateCommissionStatusInput extends CommissionRef {
  status: string;
}

export interface SetCommissionAmountInput extends CommissionRef {
  amount: number;
}

export interface CommissionView {
  id: string;
  apporteurId: string;
  prospectId: string;
  clientId: string;
  clientName: string;
  missionId: string;
  missionTitle: string;
  amount: number | null;
  currency: 'EUR';
  status: CommissionStatus;
  validatedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}

export const toCommissionView = (c: Commission): CommissionView => ({
  id: c.id,
  apporteurId: c.apporteurId,
  prospectId: c.prospectId,
  clientId: c.clientId,
  clientName: c.clientName,
  missionId: c.missionId,
  missionTitle: c.missionTitle,
  amount: c.amount,
  currency: 'EUR',
  status: c.status,
  validatedAt: c.validatedAt,
  paidAt: c.paidAt,
  createdAt: c.createdAt,
});
