import { Inject, Injectable } from '@nestjs/common';
import { formatEuros } from '@shared/kernel';
import { ActorKind, ActorRef, resolveActor } from '@shared/application/actor';
import { ActorContext } from '@shared/application/use-case';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { PdfDocumentDefinition } from '@shared/application/ports/pdf-generator.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  BilledClient,
  ClientInvoice,
  ClientInvoiceGenerated,
  clientInvoiceNotFound,
  ClientInvoiceRepository,
  ClientInvoiceSent,
  Payment,
  paymentNotFound,
  PaymentRepository,
  PaymentSubmitted,
  PaymentValidated,
} from '../../domain';

export const PAYMENT_PERMISSIONS = { VALIDATE: 'validate-payments' } as const;
export const PAYMENT_NOTIFICATION_TYPE = 'payment';
export const INVOICE_NOTIFICATION_TYPE = 'client-invoice';

/** Loads a payment visible to the actor: any admin, or the owning client (404 otherwise). */
export const loadVisiblePayment = async (
  payments: PaymentRepository,
  actor: ActorContext,
  paymentId: string,
): Promise<{ by: ActorRef; payment: Payment }> => {
  const by = resolveActor(actor, ['ADMIN', 'CLIENT']);
  const payment = await payments.findById(paymentId);
  if (!payment || (by.kind === 'CLIENT' && !payment.isOwnedBy(by.userId))) {
    throw paymentNotFound(paymentId);
  }
  return { by, payment };
};

export const loadVisibleInvoice = async (
  invoices: ClientInvoiceRepository,
  actor: ActorContext,
  invoiceId: string,
  allowed: readonly ActorKind[] = ['ADMIN', 'CLIENT'],
): Promise<{ by: ActorRef; invoice: ClientInvoice }> => {
  const by = resolveActor(actor, allowed);
  const invoice = await invoices.findById(invoiceId);
  if (!invoice || (by.kind === 'CLIENT' && !invoice.isOwnedBy(by.userId))) {
    throw clientInvoiceNotFound(invoiceId);
  }
  return { by, invoice };
};

const frDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
};

/** The invoice document (text-only template). */
export const clientInvoiceDocument = (
  invoice: ClientInvoice,
  payment: Payment,
  client: BilledClient,
  missionTitle: string,
): PdfDocumentDefinition => ({
  title: `Facture ${invoice.invoiceNumber.value}`,
  blocks: [
    { text: 'THE CLEVEREST', style: 'title' },
    { text: 'Cabinet de conseil', style: 'small' },
    { text: `Facture N° ${invoice.invoiceNumber.value}`, style: 'heading', spaceBefore: 24 },
    { text: `Date d'émission : ${frDate(invoice.generatedAt)}` },
    { text: 'Facturé à', style: 'heading', spaceBefore: 18 },
    { text: client.name },
    ...(client.email ? [{ text: client.email }] : []),
    { text: 'Objet', style: 'heading', spaceBefore: 18 },
    { text: `Mission : ${missionTitle}` },
    {
      text: `Paiement déclaré le ${frDate(payment.createdAt)}, validé le ${frDate(
        payment.validatedAt ?? invoice.generatedAt,
      )}.`,
    },
    { text: `Montant : ${formatEuros(invoice.amount)}`, style: 'heading', spaceBefore: 18 },
    { text: 'Facture acquittée.', bold: true, spaceBefore: 6 },
    {
      text: `Référence paiement : ${payment.id}`,
      style: 'small',
      spaceBefore: 36,
    },
  ],
});

/** After a payment / invoice is saved: AuditLog rows, events, best-effort notifications. */
@Injectable()
export class PaymentCommitter {
  constructor(
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async afterPayment(payment: Payment): Promise<void> {
    const events = payment.pullDomainEvents();
    for (const event of events) {
      if (event instanceof PaymentSubmitted) {
        await this.audit.record({
          entity: 'Payment',
          entityId: payment.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'PENDING',
          actorId: payment.clientId,
          metadata: { missionId: payment.missionId, amount: payment.amount },
        });
      } else if (event instanceof PaymentValidated) {
        await this.audit.record({
          entity: 'Payment',
          entityId: payment.id,
          action: 'STATUS_CHANGED',
          fromStatus: 'PENDING',
          toStatus: 'VALIDATED',
          actorId: event.data.actorId,
          metadata: { missionId: payment.missionId, amount: payment.amount },
        });
        await this.notifier.notify([payment.clientId], {
          type: PAYMENT_NOTIFICATION_TYPE,
          title: 'Paiement validé',
          body: `Votre paiement de ${formatEuros(payment.amount)} a été validé.`,
          data: { paymentId: payment.id, missionId: payment.missionId },
        });
      }
    }
    await this.events.publish(events);
  }

  async afterInvoice(invoice: ClientInvoice): Promise<void> {
    const events = invoice.pullDomainEvents();
    for (const event of events) {
      if (event instanceof ClientInvoiceGenerated) {
        await this.audit.record({
          entity: 'ClientInvoice',
          entityId: invoice.id,
          action: 'GENERATED',
          fromStatus: null,
          toStatus: 'GENERATED',
          actorId: event.data.actorId,
          metadata: {
            paymentId: invoice.paymentId,
            invoiceNumber: invoice.invoiceNumber.value,
            amount: invoice.amount,
          },
        });
      } else if (event instanceof ClientInvoiceSent) {
        await this.audit.record({
          entity: 'ClientInvoice',
          entityId: invoice.id,
          action: 'SENT',
          fromStatus: null,
          toStatus: 'SENT',
          actorId: event.data.actorId,
          metadata: { invoiceNumber: invoice.invoiceNumber.value },
        });
      }
    }
    await this.events.publish(events);
  }
}
