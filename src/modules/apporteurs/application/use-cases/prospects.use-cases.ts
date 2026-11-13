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
import { Prospect, PROSPECT_REPOSITORY, prospectNotFound, ProspectRepository } from '../../domain';
import {
  CreateProspectInput,
  ListProspectsInput,
  ProspectRef,
  ProspectView,
  RejectProspectInput,
  toProspectView,
  UploadProspectDocumentInput,
} from '../apporteurs.dto';
import { ApporteurCommitter, loadVisibleProspect } from '../apporteur-services';

@Injectable()
export class CreateProspectUseCase implements UseCase<CreateProspectInput, ProspectView> {
  constructor(
    @Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository,
    private readonly committer: ApporteurCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateProspectInput): Promise<ProspectView> {
    const by = resolveActor(input.actor, ['APPORTEUR']);
    const prospect = Prospect.create(
      {
        id: this.prospects.nextIdentity(),
        apporteurId: by.userId,
        name: input.name,
        company: input.company,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
      },
      this.clock.now(),
    );
    await this.prospects.save(prospect);
    await this.committer.afterProspect(prospect);
    return toProspectView(prospect);
  }
}

/** Apporteur: theirs; admin: all, filtered. */
@Injectable()
export class ListProspectsUseCase implements UseCase<ListProspectsInput, Page<ProspectView>> {
  constructor(@Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository) {}

  async execute(input: ListProspectsInput): Promise<Page<ProspectView>> {
    const by = resolveActor(input.actor, ['ADMIN', 'APPORTEUR']);
    const page = await this.prospects.list(normalizePageQuery(input), {
      apporteurId: by.kind === 'APPORTEUR' ? by.userId : input.apporteurId,
      status: input.status,
    });
    return page.map(toProspectView);
  }
}

@Injectable()
export class GetProspectUseCase implements UseCase<ProspectRef, ProspectView> {
  constructor(@Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository) {}

  async execute(input: ProspectRef): Promise<ProspectView> {
    const { prospect } = await loadVisibleProspect(this.prospects, input.actor, input.prospectId);
    return toProspectView(prospect);
  }
}

/** The owning apporteur attaches (or replaces) the prospect's document while it is pending. */
@Injectable()
export class UploadProspectDocumentUseCase implements UseCase<
  UploadProspectDocumentInput,
  ProspectView
> {
  constructor(
    @Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UploadProspectDocumentInput): Promise<ProspectView> {
    const by = resolveActor(input.actor, ['APPORTEUR']);
    const prospect = await this.prospects.findById(input.prospectId);
    if (!prospect) throw prospectNotFound(input.prospectId);
    const now = this.clock.now();
    const file = toStoredRef(
      `prospects/${prospect.id}/${now.getTime()}${fileExtension(input.file.originalName)}`,
      input.file,
    );
    const previous = prospect.attachDocument(by.userId, file, now);
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.prospects.save(prospect),
    );
    if (previous) await this.storage.delete(previous.key).catch(() => undefined);
    return toProspectView(prospect);
  }
}

@Injectable()
export class DownloadProspectDocumentUseCase implements UseCase<ProspectRef, DownloadedFile> {
  constructor(
    @Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: ProspectRef): Promise<DownloadedFile> {
    const { prospect } = await loadVisibleProspect(this.prospects, input.actor, input.prospectId);
    if (!prospect.document) {
      throw new NotFoundException('PROSPECT_DOCUMENT_NOT_FOUND', 'No document for this prospect', {
        id: prospect.id,
      });
    }
    return download(this.storage, prospect.document);
  }
}

/** Admin (`manage-users`) turns a lead down: EN_ATTENTE → REJETÉ. */
@Injectable()
export class RejectProspectUseCase implements UseCase<RejectProspectInput, ProspectView> {
  constructor(
    @Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository,
    private readonly committer: ApporteurCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: RejectProspectInput): Promise<ProspectView> {
    const by = requireAdminWith(input.actor, 'manage-users');
    const prospect = await this.prospects.findById(input.prospectId);
    if (!prospect) throw prospectNotFound(input.prospectId);
    prospect.reject(by.userId, input.reason, this.clock.now());
    await this.prospects.save(prospect);
    await this.committer.afterProspect(prospect);
    return toProspectView(prospect);
  }
}
