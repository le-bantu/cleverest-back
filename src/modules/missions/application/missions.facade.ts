import { Inject, Injectable } from '@nestjs/common';
import { ACTIVE_MISSION_STATUSES, MISSION_REPOSITORY, MissionRepository } from '../domain';
import { MissionSummary } from './missions.dto';

/** Public API of the missions context (used by deliverables, payments, consultant-invoices). */
@Injectable()
export class MissionsFacade {
  constructor(@Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository) {}

  async findSummary(missionId: string): Promise<MissionSummary | null> {
    const m = await this.missions.findById(missionId);
    if (!m) return null;
    return {
      id: m.id,
      quoteId: m.quoteId,
      clientId: m.clientId,
      title: m.title,
      consultantIds: m.consultantIds,
      status: m.status,
      active: ACTIVE_MISSION_STATUSES.includes(m.status),
    };
  }

  /** missions the consultant is currently assigned to */
  missionIdsForConsultant(consultantId: string): Promise<string[]> {
    return this.missions.idsForConsultant(consultantId);
  }
}
