import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, fileExtension, normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith, resolveActor } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { download, DownloadedFile, storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  CONSULTANT_COMMITMENT,
  CONSULTANT_INVOICE_REPOSITORY,
  ConsultantCommitmentPort,
  ConsultantInvoice,
  consultantInvoiceNotFound,
  ConsultantInvoiceRepository,
  INVOICE_MISSION_GATEWAY,
  InvoiceMissionGatewayPort,
  invoiceMissionNotFound,
} from '../../domain';
import {
  ConsultantInvoiceRef,
  ConsultantInvoiceView,
  ListConsultantInvoicesInput,
  SubmitConsultantInvoiceInput,
  toConsultantInvoiceView,
} from '../consultant-invoices.dto';
import {
  CONSULTANT_INVOICE_PERMISSIONS,
  ConsultantInvoiceCommitter,
} from '../consultant-invoice-services';

/** An assigned consultant with a signed consultant contract uploads an invoice. */
@Injectable()
export class SubmitConsultantInvoiceUseCase implements UseCase<
  SubmitConsultantInvoiceInput,
  ConsultantInvoiceView
> {
  constructor(
    @Inject(CONSULTANT_INVOICE_REPOSITORY) private readonly invoices: ConsultantInvoiceRepository,
    @Inject(INVOICE_MISSION_GATEWAY) private readonly missions: InvoiceMissionGatewayPort,
    @Inject(CONSULTANT_COMMITMENT) private readonly commitments: ConsultantCommitmentPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ConsultantInvoiceCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SubmitConsultantInvoiceInput): Promise<ConsultantInvoiceView> {
    const by = resolveActor(input.actor, ['CONSULTANT']);
    const mission = await this.missions.findMission(input.missionId);
    if (!mission) throw invoiceMissionNotFound(input.missionId);
    const id = this.invoices.nextIdentity();
    const file = toStoredRef(
      `consultant-invoices/${mission.id}/${id}${fileExtension(input.file.originalName)}`,
      input.file,
    );
    const [signedAmount, alreadyInvoiced] = await Promise.all([
      this.commitments.signedAmount(by.userId, mission.quoteId),
      this.invoices.totalInvoiced(by.userId, mission.quoteId),
    ]);
    const invoice = ConsultantInvoice.submit(
      {
        id,
        mission,
        consultantId: by.userId,
        amount: input.amount,
        commitment: { signedAmount, alreadyInvoiced },
        file,
      },
      this.clock.now(),
    );
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.committer.commit(invoice),
    );
    return toConsultantInvoiceView(invoice);
  }
}

/** Consultant: theirs; admin: all, filtered. */
@Injectable()
export class ListConsultantInvoicesUseCase implements UseCase<
  ListConsultantInvoicesInput,
  Page<ConsultantInvoiceView>
> {
  constructor(
    @Inject(CONSULTANT_INVOICE_REPOSITORY) private readonly invoices: ConsultantInvoiceRepository,
  ) {}

  async execute(input: ListConsultantInvoicesInput): Promise<Page<ConsultantInvoiceView>> {
    const by = resolveActor(input.actor, ['ADMIN', 'CONSULTANT']);
    const page = await this.invoices.list(normalizePageQuery(input), {
      consultantId: by.kind === 'CONSULTANT' ? by.userId : input.consultantId,
      missionId: input.missionId,
      isPaid: input.isPaid,
      uploadedFrom: input.uploadedFrom,
      uploadedTo: input.uploadedTo,
    });
    return page.map(toConsultantInvoiceView);
  }
}

/** The author or an admin; anyone else gets a 404. */
@Injectable()
export class DownloadConsultantInvoiceUseCase implements UseCase<
  ConsultantInvoiceRef,
  DownloadedFile
> {
  constructor(
    @Inject(CONSULTANT_INVOICE_REPOSITORY) private readonly invoices: ConsultantInvoiceRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: ConsultantInvoiceRef): Promise<DownloadedFile> {
    const by = resolveActor(input.actor, ['ADMIN', 'CONSULTANT']);
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice || !invoice.isVisibleTo(by)) throw consultantInvoiceNotFound(input.invoiceId);
    return download(this.storage, invoice.file);
  }
}

/** Admin with `pay-consultants` (checked here, not only by the guard). */
@Injectable()
export class MarkConsultantInvoicePaidUseCase implements UseCase<
  ConsultantInvoiceRef,
  ConsultantInvoiceView
> {
  constructor(
    @Inject(CONSULTANT_INVOICE_REPOSITORY) private readonly invoices: ConsultantInvoiceRepository,
    private readonly committer: ConsultantInvoiceCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ConsultantInvoiceRef): Promise<ConsultantInvoiceView> {
    const by = requireAdminWith(input.actor, CONSULTANT_INVOICE_PERMISSIONS.PAY);
    const invoice = await this.invoices.findById(input.invoiceId);
    if (!invoice) throw consultantInvoiceNotFound(input.invoiceId);
    invoice.markPaid(by.userId, this.clock.now());
    await this.committer.commit(invoice);
    return toConsultantInvoiceView(invoice);
  }
}
