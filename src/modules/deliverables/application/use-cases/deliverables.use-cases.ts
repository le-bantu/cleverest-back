import { Inject, Injectable } from '@nestjs/common';
import {
  Clock,
  CLOCK,
  fileExtension,
  normalizePageQuery,
  NotFoundException,
  Page,
} from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith, resolveActor } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { download, DownloadedFile, storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  Deliverable,
  DELIVERABLE_REPOSITORY,
  DeliverableRepository,
  CONSULTANT_ENGAGEMENT,
  ConsultantEngagementPort,
  MISSION_GATEWAY,
  MissionGatewayPort,
} from '../../domain';
import {
  ClientDeliverableView,
  DeliverableRef,
  DeliverableView,
  ListDeliverablesInput,
  toClientDeliverableView,
  toDeliverableView,
  UploadDeliverableInput,
} from '../deliverables.dto';
import {
  DELIVERABLE_PERMISSIONS,
  DeliverableCommitter,
  deliverableViewFor,
  loadVisibleDeliverable,
} from '../deliverable-services';

/** An assigned consultant uploads a deliverable on an active mission. */
@Injectable()
export class UploadDeliverableUseCase implements UseCase<UploadDeliverableInput, DeliverableView> {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
    @Inject(MISSION_GATEWAY) private readonly missions: MissionGatewayPort,
    @Inject(CONSULTANT_ENGAGEMENT) private readonly engagement: ConsultantEngagementPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: DeliverableCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UploadDeliverableInput): Promise<DeliverableView> {
    const by = resolveActor(input.actor, ['CONSULTANT']);
    const mission = await this.missions.findMission(input.missionId);
    if (!mission || !mission.consultantIds.includes(by.userId)) {
      throw new NotFoundException('MISSION_NOT_FOUND', 'Mission not found', {
        id: input.missionId,
      });
    }
    const id = this.deliverables.nextIdentity();
    const file = toStoredRef(
      `deliverables/${mission.id}/${id}${fileExtension(input.file.originalName)}`,
      input.file,
    );
    const deliverable = Deliverable.upload(
      {
        id,
        mission,
        consultantId: by.userId,
        engaged: await this.engagement.isEngaged(by.userId, mission.quoteId),
        file,
      },
      this.clock.now(),
    );
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.committer.commit(deliverable),
    );
    return toDeliverableView(deliverable);
  }
}

/** Admin: all; consultant: own uploads; client: admin-validated deliverables of their missions. */
@Injectable()
export class ListDeliverablesUseCase implements UseCase<
  ListDeliverablesInput,
  Page<DeliverableView | ClientDeliverableView>
> {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
  ) {}

  async execute(
    input: ListDeliverablesInput,
  ): Promise<Page<DeliverableView | ClientDeliverableView>> {
    const by = resolveActor(input.actor);
    const page = await this.deliverables.list(normalizePageQuery(input), {
      consultantId:
        by.kind === 'CONSULTANT' ? by.userId : by.kind === 'ADMIN' ? input.consultantId : undefined,
      clientId: by.kind === 'CLIENT' ? by.userId : undefined,
      adminValidated: by.kind === 'CLIENT' ? true : input.adminValidated,
      missionId: input.missionId,
      clientValidated: input.validated,
      uploadedFrom: input.uploadedFrom,
      uploadedTo: input.uploadedTo,
    });
    return page.map((d) => deliverableViewFor(by, d));
  }
}

@Injectable()
export class GetDeliverableUseCase implements UseCase<
  DeliverableRef,
  DeliverableView | ClientDeliverableView
> {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
  ) {}

  async execute(input: DeliverableRef): Promise<DeliverableView | ClientDeliverableView> {
    const { by, deliverable } = await loadVisibleDeliverable(
      this.deliverables,
      input.actor,
      input.deliverableId,
    );
    return deliverableViewFor(by, deliverable);
  }
}

/** Same visibility rule as GET (a client never downloads an unreleased deliverable). */
@Injectable()
export class DownloadDeliverableUseCase implements UseCase<DeliverableRef, DownloadedFile> {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: DeliverableRef): Promise<DownloadedFile> {
    const { deliverable } = await loadVisibleDeliverable(
      this.deliverables,
      input.actor,
      input.deliverableId,
    );
    return download(this.storage, deliverable.file);
  }
}

/** Admin (`validate-deliverables`) releases a deliverable to the client. */
@Injectable()
export class ValidateDeliverableAsAdminUseCase implements UseCase<DeliverableRef, DeliverableView> {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
    private readonly committer: DeliverableCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DeliverableRef): Promise<DeliverableView> {
    const by = requireAdminWith(input.actor, DELIVERABLE_PERMISSIONS.VALIDATE);
    const { deliverable } = await loadVisibleDeliverable(
      this.deliverables,
      input.actor,
      input.deliverableId,
      ['ADMIN'],
    );
    deliverable.validateByAdmin(by.userId, this.clock.now());
    await this.committer.commit(deliverable);
    return toDeliverableView(deliverable);
  }
}

/** The owning client accepts a released deliverable. */
@Injectable()
export class ValidateDeliverableAsClientUseCase implements UseCase<
  DeliverableRef,
  ClientDeliverableView
> {
  constructor(
    @Inject(DELIVERABLE_REPOSITORY) private readonly deliverables: DeliverableRepository,
    private readonly committer: DeliverableCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: DeliverableRef): Promise<ClientDeliverableView> {
    const { by, deliverable } = await loadVisibleDeliverable(
      this.deliverables,
      input.actor,
      input.deliverableId,
      ['CLIENT'],
    );
    deliverable.validateByClient(by.userId, this.clock.now());
    await this.committer.commit(deliverable);
    return toClientDeliverableView(deliverable);
  }
}
