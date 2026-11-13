import { Inject, Injectable } from '@nestjs/common';
import { formatEuros } from '@shared/kernel';
import { ActorRef, resolveActor } from '@shared/application/actor';
import { ActorContext } from '@shared/application/use-case';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  Commission,
  CommissionCreated,
  commissionNotFound,
  CommissionRepository,
  CommissionStatusChanged,
  Prospect,
  ProspectConverted,
  ProspectCreated,
  prospectNotFound,
  ProspectRejected,
  ProspectRepository,
} from '../domain';

export const APPORTEUR_PERMISSIONS = {
  CONVERT: 'manage-users',
  PAY: 'pay-apporteurs',
} as const;
export const PROSPECT_NOTIFICATION_TYPE = 'prospect';
export const COMMISSION_NOTIFICATION_TYPE = 'commission';

/** Any admin, or the apporteur who owns it; anyone else gets a 404. */
export const loadVisibleProspect = async (
  prospects: ProspectRepository,
  actor: ActorContext,
  prospectId: string,
): Promise<{ by: ActorRef; prospect: Prospect }> => {
  const by = resolveActor(actor, ['ADMIN', 'APPORTEUR']);
  const prospect = await prospects.findById(prospectId);
  if (!prospect || (by.kind !== 'ADMIN' && !prospect.isOwnedBy(by.userId))) {
    throw prospectNotFound(prospectId);
  }
  return { by, prospect };
};

export const loadVisibleCommission = async (
  commissions: CommissionRepository,
  actor: ActorContext,
  commissionId: string,
): Promise<{ by: ActorRef; commission: Commission }> => {
  const by = resolveActor(actor, ['ADMIN', 'APPORTEUR']);
  const commission = await commissions.findById(commissionId);
  if (!commission || (by.kind !== 'ADMIN' && !commission.isOwnedBy(by.userId))) {
    throw commissionNotFound(commissionId);
  }
  return { by, commission };
};

/** Saves nothing: AuditLog rows, events and best-effort notifications after a commit. */
@Injectable()
export class ApporteurCommitter {
  constructor(
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async afterProspect(prospect: Prospect): Promise<void> {
    const events = prospect.pullDomainEvents();
    for (const event of events) {
      const base = { entity: 'Prospect', entityId: prospect.id };
      if (event instanceof ProspectCreated) {
        await this.audit.record({
          ...base,
          action: 'CREATED',
          fromStatus: null,
          toStatus: prospect.status,
          actorId: event.data.apporteurId,
        });
      } else if (event instanceof ProspectConverted || event instanceof ProspectRejected) {
        const converted = event instanceof ProspectConverted;
        await this.audit.record({
          ...base,
          action: 'STATUS_CHANGED',
          fromStatus: 'EN_ATTENTE',
          toStatus: prospect.status,
          actorId: event.data.actorId,
          metadata: converted
            ? { clientId: prospect.clientId, missionId: prospect.missionId }
            : { reason: prospect.rejectedReason },
        });
        await this.notifier.notify([prospect.apporteurId], {
          type: PROSPECT_NOTIFICATION_TYPE,
          title: converted ? 'Prospect converti' : 'Prospect refusé',
          body: prospect.displayName,
          data: { prospectId: prospect.id, status: prospect.status },
        });
      }
    }
    await this.events.publish(events);
  }

  async auditAmount(
    commission: Commission,
    previous: number | null,
    actorId: string,
  ): Promise<void> {
    await this.audit.record({
      entity: 'Commission',
      entityId: commission.id,
      action: 'AMOUNT_SET',
      fromStatus: commission.status,
      toStatus: commission.status,
      actorId,
      metadata: { from: previous, to: commission.amount },
    });
  }

  async afterCommission(commission: Commission): Promise<void> {
    const events = commission.pullDomainEvents();
    for (const event of events) {
      const base = { entity: 'Commission', entityId: commission.id };
      if (event instanceof CommissionCreated) {
        await this.audit.record({
          ...base,
          action: 'CREATED',
          fromStatus: null,
          toStatus: commission.status,
          actorId: event.data.actorId,
          metadata: { missionId: commission.missionId, prospectId: commission.prospectId },
        });
      } else if (event instanceof CommissionStatusChanged) {
        await this.audit.record({
          ...base,
          action: 'STATUS_CHANGED',
          fromStatus: event.data.from,
          toStatus: event.data.to,
          actorId: event.data.actorId,
          metadata: { amount: commission.amount },
        });
        await this.notifier.notify([commission.apporteurId], {
          type: COMMISSION_NOTIFICATION_TYPE,
          title: `Commission ${event.data.to === 'PAYÉE' ? 'payée' : 'validée'}`,
          body: `${commission.clientName} — ${formatEuros(commission.amount ?? 0)}`,
          data: { commissionId: commission.id, status: commission.status },
        });
      }
    }
    await this.events.publish(events);
  }
}
