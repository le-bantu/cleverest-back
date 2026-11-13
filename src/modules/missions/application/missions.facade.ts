import { Inject, Injectable } from '@nestjs/common';
import { StoredFileRef } from '@shared/kernel';
import { PendingWrite } from '@shared/application/pending-write';
import { ACTIVE_MISSION_STATUSES, Mission, MISSION_REPOSITORY, MissionRepository } from '../domain';
import { MissionCommitter } from './services/mission-committer';
import { MissionSummary } from './missions.dto';

/** Public API of the missions context (used by deliverables, payments, consultant-invoices). */
@Injectable()
export class MissionsFacade {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    private readonly committer: MissionCommitter,
  ) {}

  /** A mission opened on a contract signed in the same transaction (apporteur conversion). */
  prepareMission(
    input: {
      contract: { id: string; quoteId: string; clientId: string };
      title: string;
      description?: string | null;
      deliveryDate?: Date | null;
      contractFile: StoredFileRef;
      adminId: string;
    },
    now: Date,
  ): PendingWrite & { missionId: string } {
    const mission = Mission.create(
      {
        id: this.missions.nextIdentity(),
        contract: { ...input.contract, signed: true },
        title: input.title,
        description: input.description,
        deliveryDate: input.deliveryDate,
        contractFile: input.contractFile,
        createdById: input.adminId,
      },
      now,
    );
    return {
      missionId: mission.id,
      persist: (tx) => this.missions.save(mission, tx),
      finalize: () => this.committer.afterCommit(mission),
    };
  }

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
