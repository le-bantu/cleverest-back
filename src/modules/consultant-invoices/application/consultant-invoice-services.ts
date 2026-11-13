import { Inject, Injectable } from '@nestjs/common';
import { formatEuros } from '@shared/kernel';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  ConsultantInvoice,
  CONSULTANT_INVOICE_REPOSITORY,
  ConsultantInvoicePaid,
  ConsultantInvoiceRepository,
  ConsultantInvoiceSubmitted,
} from '../domain';

export const CONSULTANT_INVOICE_PERMISSIONS = { PAY: 'pay-consultants' } as const;
export const CONSULTANT_INVOICE_NOTIFICATION_TYPE = 'consultant-invoice';

/** Saves, audits, publishes events and notifies (best effort). */
@Injectable()
export class ConsultantInvoiceCommitter {
  constructor(
    @Inject(CONSULTANT_INVOICE_REPOSITORY) private readonly invoices: ConsultantInvoiceRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async commit(invoice: ConsultantInvoice): Promise<void> {
    await this.invoices.save(invoice);
    const events = invoice.pullDomainEvents();
    for (const event of events) {
      const metadata = { missionId: invoice.missionId, amount: invoice.amount };
      if (event instanceof ConsultantInvoiceSubmitted) {
        await this.audit.record({
          entity: 'ConsultantInvoice',
          entityId: invoice.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'UNPAID',
          actorId: invoice.consultantId,
          metadata,
        });
      } else if (event instanceof ConsultantInvoicePaid) {
        await this.audit.record({
          entity: 'ConsultantInvoice',
          entityId: invoice.id,
          action: 'STATUS_CHANGED',
          fromStatus: 'UNPAID',
          toStatus: 'PAID',
          actorId: event.data.actorId,
          metadata,
        });
        await this.notifier.notify([invoice.consultantId], {
          type: CONSULTANT_INVOICE_NOTIFICATION_TYPE,
          title: 'Facture payée',
          body: `Votre facture de ${formatEuros(invoice.amount)} a été payée.`,
          data: { invoiceId: invoice.id, missionId: invoice.missionId },
        });
      }
    }
    await this.events.publish(events);
  }
}
