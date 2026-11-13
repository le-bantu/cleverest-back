import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { EVENT_BUS, EventBusPort } from '@shared/application/ports/event-bus.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import {
  ConsultantsAssignedToMission,
  Mission,
  MISSION_REPOSITORY,
  MissionCreated,
  MissionRepository,
  MissionStatus,
  MissionStatusChanged,
} from '../../domain';

export const MISSION_AUDIT_ENTITY = 'Mission';
export const MISSION_NOTIFICATION_TYPE = 'mission';

/** Saves a mission, then writes AuditLog rows, publishes events and notifies (best effort). */
@Injectable()
export class MissionCommitter {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLogPort,
    @Inject(EVENT_BUS) private readonly events: EventBusPort,
    private readonly notifier: BestEffortNotifier,
  ) {}

  async commit(mission: Mission, tx?: unknown): Promise<void> {
    await this.missions.save(mission, tx);
    await this.afterCommit(mission);
  }

  /** Audit + events + notifications once the mission is durably saved (possibly by another context's UoW). */
  async afterCommit(mission: Mission): Promise<void> {
    const events = mission.pullDomainEvents();
    for (const event of events) {
      if (event instanceof MissionCreated) {
        await this.audit.record({
          entity: MISSION_AUDIT_ENTITY,
          entityId: mission.id,
          action: 'CREATED',
          fromStatus: null,
          toStatus: MissionStatus.EN_ATTENTE,
          actorId: event.data.actorId,
          metadata: { contractId: event.data.contractId },
        });
        await this.notify([mission.clientId], mission, 'Nouvelle mission', mission.title);
      } else if (event instanceof MissionStatusChanged) {
        await this.audit.record({
          entity: MISSION_AUDIT_ENTITY,
          entityId: mission.id,
          action: 'STATUS_CHANGED',
          fromStatus: event.data.from,
          toStatus: event.data.to,
          actorId: event.data.actorId,
        });
        await this.notify(
          [mission.clientId],
          mission,
          'Mission mise à jour',
          `Statut : ${event.data.to}`,
        );
      } else if (event instanceof ConsultantsAssignedToMission) {
        await this.notify(
          event.data.newlyAssignedIds,
          mission,
          'Nouvelle mission assignée',
          mission.title,
        );
      }
    }
    await this.events.publish(events);
  }

  private notify(userIds: readonly string[], m: Mission, title: string, body: string) {
    return this.notifier.notify(userIds, {
      type: MISSION_NOTIFICATION_TYPE,
      title,
      body,
      data: { missionId: m.id, status: m.status, progress: m.progress },
    });
  }
}
