import { Inject, Injectable } from '@nestjs/common';
import { normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { resolveActor } from '@shared/application/actor';
import { MISSION_REPOSITORY, MissionRepository, parseMissionStatus } from '../../domain';
import { ListMissionsInput } from '../missions.dto';
import { ClientMissionView, MissionView } from '../mission.views';
import { viewFor } from '../services/mission-access';

/** Admin: all missions; consultant: assigned ones; client: missions of their quotes. */
@Injectable()
export class ListMissionsUseCase implements UseCase<
  ListMissionsInput,
  Page<MissionView | ClientMissionView>
> {
  constructor(@Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository) {}

  async execute(input: ListMissionsInput): Promise<Page<MissionView | ClientMissionView>> {
    const by = resolveActor(input.actor);
    const page = await this.missions.list(normalizePageQuery(input), {
      consultantId: by.kind === 'CONSULTANT' ? by.userId : undefined,
      clientId: by.kind === 'CLIENT' ? by.userId : undefined,
      status: input.status ? parseMissionStatus(input.status) : undefined,
      title: input.title?.trim() || undefined,
      contractId: input.contractId,
      deliveryDateFrom: input.deliveryDateFrom,
      deliveryDateTo: input.deliveryDateTo,
    });
    return page.map((m) => viewFor(by, m));
  }
}
