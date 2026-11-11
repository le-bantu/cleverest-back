import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { Contract, ContractCreated, ContractSigned } from '../../domain';

export const CONTRACT_AUDIT_ENTITY = 'Contract';
export const CONTRACT_NOTIFICATION_TYPE = 'contract';

/** After a contract is durably saved: AuditLog rows, events, best-effort notifications. */
@Injectable()
export class ContractCommitter {
  constructor(
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async afterCommit(contract: Contract): Promise<void> {
    const events = contract.pullDomainEvents();
    for (const event of events) {
      if (event instanceof ContractCreated) {
        await this.audit.record({
          entity: CONTRACT_AUDIT_ENTITY,
          entityId: contract.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'UNSIGNED',
          actorId: event.data.actorId,
          metadata: { quoteId: event.data.quoteId },
        });
        await this.notifier.notify([contract.clientId], {
          type: CONTRACT_NOTIFICATION_TYPE,
          title: 'Contrat disponible',
          body: 'Votre contrat est prêt à être signé.',
          data: { contractId: contract.id, quoteId: contract.quoteId },
        });
      } else if (event instanceof ContractSigned) {
        await this.audit.record({
          entity: CONTRACT_AUDIT_ENTITY,
          entityId: contract.id,
          action: 'STATUS_CHANGED',
          fromStatus: 'UNSIGNED',
          toStatus: 'SIGNED',
          actorId: event.data.actorId,
          metadata: { quoteId: event.data.quoteId },
        });
      }
    }
    await this.events.publish(events);
  }
}
