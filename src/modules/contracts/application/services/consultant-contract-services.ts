import { Inject, Injectable } from '@nestjs/common';
import { ActorRef, resolveActor } from '@shared/application/actor';
import { ActorContext } from '@shared/application/use-case';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  ConsultantContract,
  ConsultantContractCreated,
  ConsultantContractRepository,
  ConsultantContractSigned,
  consultantContractNotFound,
} from '../../domain';
import { ConsultantContractView } from '../contracts.dto';

export const CONSULTANT_CONTRACT_AUDIT_ENTITY = 'ConsultantContract';
export const CONSULTANT_CONTRACT_NOTIFICATION_TYPE = 'consultant-contract';

export const toConsultantContractView = (c: ConsultantContract): ConsultantContractView => ({
  id: c.id,
  quoteId: c.quoteId,
  rootQuoteId: c.rootQuoteId,
  consultantId: c.consultantId,
  amount: c.amount,
  signed: c.signed,
  signedAt: c.signedAt,
  originalFileName: c.originalFile.originalName,
  signedFileName: c.signedFile?.originalName ?? null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/**
 * Loads a consultant contract the actor may see: any admin, or the consultant
 * it binds. Anyone else gets a 404 (no existence leak).
 */
export const loadVisibleConsultantContract = async (
  contracts: ConsultantContractRepository,
  actor: ActorContext,
  contractId: string,
): Promise<{ by: ActorRef; contract: ConsultantContract }> => {
  const by = resolveActor(actor, ['ADMIN', 'CONSULTANT']);
  const contract = await contracts.findById(contractId);
  if (!contract || (by.kind === 'CONSULTANT' && !contract.belongsTo(by.userId))) {
    throw consultantContractNotFound(contractId);
  }
  return { by, contract };
};

/** After a consultant contract is saved: AuditLog rows, events, best-effort notifications. */
@Injectable()
export class ConsultantContractCommitter {
  constructor(
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async afterCommit(contract: ConsultantContract): Promise<void> {
    const events = contract.pullDomainEvents();
    for (const event of events) {
      if (event instanceof ConsultantContractCreated) {
        await this.audit.record({
          entity: CONSULTANT_CONTRACT_AUDIT_ENTITY,
          entityId: contract.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: 'UNSIGNED',
          actorId: event.data.actorId,
          metadata: {
            quoteId: event.data.quoteId,
            consultantId: event.data.consultantId,
            amount: event.data.amount,
          },
        });
        await this.notifier.notify([contract.consultantId], {
          type: CONSULTANT_CONTRACT_NOTIFICATION_TYPE,
          title: 'Contrat de mission à signer',
          body: 'Un contrat avec The Cleverest est prêt à être signé.',
          data: { consultantContractId: contract.id, quoteId: contract.quoteId },
        });
      } else if (event instanceof ConsultantContractSigned) {
        await this.audit.record({
          entity: CONSULTANT_CONTRACT_AUDIT_ENTITY,
          entityId: contract.id,
          action: 'STATUS_CHANGED',
          fromStatus: 'UNSIGNED',
          toStatus: 'SIGNED',
          actorId: event.data.actorId,
          metadata: { quoteId: event.data.quoteId },
        });
        if (contract.createdById) {
          await this.notifier.notify([contract.createdById], {
            type: CONSULTANT_CONTRACT_NOTIFICATION_TYPE,
            title: 'Contrat consultant signé',
            body: 'Le consultant a signé son contrat de mission.',
            data: { consultantContractId: contract.id, quoteId: contract.quoteId },
          });
        }
      }
    }
    await this.events.publish(events);
  }

  async afterDelete(contract: ConsultantContract, actorId: string): Promise<void> {
    await this.audit.record({
      entity: CONSULTANT_CONTRACT_AUDIT_ENTITY,
      entityId: contract.id,
      action: 'DELETED',
      fromStatus: 'UNSIGNED',
      toStatus: null,
      actorId,
      metadata: { quoteId: contract.quoteId, consultantId: contract.consultantId },
    });
  }
}
