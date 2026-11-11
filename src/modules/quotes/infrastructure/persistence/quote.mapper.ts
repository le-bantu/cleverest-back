import {
  $Enums,
  Prisma,
  QuoteConsultant as QuoteConsultantRow,
  Quote as QuoteRow,
} from '@prisma/client';
import { Money, Quote, QuoteStatus, QuoteType, RequestNumber, SlaDeadline } from '../../domain';

type PrismaQuoteStatus = $Enums.QuoteStatus;

/** Domain values keep the accents ('COTÉ'); Prisma identifiers are ASCII ('COTE'). */
const DOMAIN_TO_PRISMA = new Map<QuoteStatus, PrismaQuoteStatus>(
  (Object.keys(QuoteStatus) as Array<keyof typeof QuoteStatus>).map((key) => [
    QuoteStatus[key],
    key as PrismaQuoteStatus,
  ]),
);
const PRISMA_TO_DOMAIN = new Map<PrismaQuoteStatus, QuoteStatus>(
  [...DOMAIN_TO_PRISMA.entries()].map(([d, p]) => [p, d]),
);

export const statusToPrisma = (status: QuoteStatus): PrismaQuoteStatus =>
  DOMAIN_TO_PRISMA.get(status)!;
export const statusToDomain = (status: PrismaQuoteStatus): QuoteStatus =>
  PRISMA_TO_DOMAIN.get(status)!;

export const quoteInclude = {
  consultants: { orderBy: { assignedAt: 'asc' } },
} satisfies Prisma.QuoteInclude;

export type QuoteRowWithRelations = QuoteRow & { consultants: QuoteConsultantRow[] };

export const quoteToDomain = (row: QuoteRowWithRelations): Quote =>
  Quote.rehydrate({
    id: row.id,
    clientId: row.clientId,
    parentQuoteId: row.parentQuoteId,
    isSubquote: row.isSubquote,
    requestNumber: RequestNumber.create(row.requestNumber),
    type: row.type as QuoteType,
    title: row.title,
    description: row.description,
    price: row.price === null ? null : Money.of(Number(row.price), row.currency),
    status: statusToDomain(row.status),
    adminNotes: row.adminNotes,
    adminNotesToConsultant: row.adminNotesToConsultant,
    adminNotesToClient: row.adminNotesToClient,
    consultantNotes: row.consultantNotes,
    rejectedReason: row.rejectedReason,
    quotedById: row.quotedById,
    consultants: row.consultants.map((c) => ({ consultantId: c.consultantId, isLead: c.isLead })),
    submittedAt: row.submittedAt,
    validatedAt: row.validatedAt,
    adminDeadline: row.adminDeadline ? SlaDeadline.at(row.adminDeadline) : null,
    consultantDeadline: row.consultantDeadline ? SlaDeadline.at(row.consultantDeadline) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const quoteToPersistence = (q: Quote) => ({
  clientId: q.clientId,
  parentQuoteId: q.parentQuoteId,
  isSubquote: q.isSubquote,
  requestNumber: q.requestNumber.value,
  type: q.type,
  title: q.title,
  description: q.description,
  price: q.price ? new Prisma.Decimal(q.price.amount) : null,
  currency: q.price?.currency ?? 'EUR',
  status: statusToPrisma(q.status),
  adminNotes: q.adminNotes,
  adminNotesToConsultant: q.adminNotesToConsultant,
  adminNotesToClient: q.adminNotesToClient,
  consultantNotes: q.consultantNotes,
  rejectedReason: q.rejectedReason,
  quotedById: q.quotedById,
  submittedAt: q.submittedAt,
  validatedAt: q.validatedAt,
  adminDeadline: q.adminDeadline,
  consultantDeadline: q.consultantDeadline,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
});
