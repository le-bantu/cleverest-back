import { Inject, Injectable } from '@nestjs/common';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { ActorKind, ActorRef, resolveActor } from '@shared/application/actor';
import { ActorContext } from '@shared/application/use-case';
import {
  Deliverable,
  DELIVERABLE_REPOSITORY,
  deliverableNotFound,
  DeliverableRepository,
  DeliverableValidatedByAdmin,
  DeliverableValidatedByClient,
} from '../domain';
import {
  ClientDeliverableView,
  DeliverableView,
  toClientDeliverableView,
  toDeliverableView,
} from './deliverables.dto';

export const DELIVERABLE_PERMISSIONS = { VALIDATE: 'validate-deliverables' } as const;
export const DELIVERABLE_NOTIFICATION_TYPE = 'deliverable';

/** Loads a deliverable the actor may see; anything else is a 404 (no existence leak). */
export const loadVisibleDeliverable = async (
  deliverables: DeliverableRepository,
  actor: ActorContext,
  deliverableId: string,
  allowed: readonly ActorKind[] = ['ADMIN', 'CONSULTANT', 'CLIENT'],
): Promise<{ by: ActorRef; deliverable: Deliverable }> => {
  const by = resolveActor(actor, allowed);
  const deliverable = await deliverables.findById(deliverableId);
  if (!deliverable || !deliverable.isVisibleTo(by)) throw deliverableNotFound(deliverableId);
  return { by, deliverable };
};

export const deliverableViewFor = (
  by: ActorRef,
  d: Deliverable,
): DeliverableView | ClientDeliverableView =>
  by.kind === 'CLIENT' ? toClientDeliverableView(d) : toDeliverableView(d);

/** Saves, publishes events and notifies (best effort). */
@Injectable()
export class DeliverableCommitter {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async commit(deliverable: Deliverable): Promise<void> {
    await this.deliverables.save(deliverable);
    const events = deliverable.pullDomainEvents();
    for (const event of events) {
      const data = { deliverableId: deliverable.id, missionId: deliverable.missionId };
      if (event instanceof DeliverableValidatedByAdmin) {
        await this.notifier.notify([deliverable.clientId], {
          type: DELIVERABLE_NOTIFICATION_TYPE,
          title: 'Nouveau livrable disponible',
          body: deliverable.file.originalName,
          data,
        });
      } else if (event instanceof DeliverableValidatedByClient) {
        await this.notifier.notify([deliverable.consultantId], {
          type: DELIVERABLE_NOTIFICATION_TYPE,
          title: 'Livrable validé par le client',
          body: deliverable.file.originalName,
          data,
        });
      }
    }
    await this.events.publish(events);
  }
}
