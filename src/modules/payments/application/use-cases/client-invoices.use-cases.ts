import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, normalizePageQuery, Page, ValidationException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith, resolveActor } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { NOTIFIER, NotifierPort } from '@shared/application/ports/notifier.port';
import { PDF_GENERATOR, PdfGeneratorPort } from '@shared/application/ports/pdf-generator.port';
import { download, DownloadedFile, storeThenPersist } from '@shared/application/files';
import {
  BILLING_DIRECTORY,
  BillingDirectoryPort,
  CLIENT_INVOICE_REPOSITORY,
  ClientInvoice,
  ClientInvoiceRepository,
  InvoiceNumber,
  InvoiceNumberTaken,
  missionNotFound,
  PAYMENT_MISSION_GATEWAY,
  PAYMENT_REPOSITORY,
  PaymentMissionGatewayPort,
  PaymentRepository,
} from '../../domain';
import {
  ClientInvoiceRef,
  ClientInvoiceView,
  GenerateClientInvoiceInput,
  ListClientInvoicesInput,
  toClientInvoiceView,
} from '../payments.dto';
import {
  clientInvoiceDocument,
  INVOICE_NOTIFICATION_TYPE,
  loadVisibleInvoice,
  loadVisiblePayment,
  PAYMENT_PERMISSIONS,
  PaymentCommitter,
} from '../services/payment-services';

/** Concurrent generations may race for the same number: retry with the next one. */
export const INVOICE_NUMBER_ATTEMPTS = 3;

/**
 * Admin (`validate-payments`) issues the PDF invoice of a VALIDATED payment,
 * numbered `FAC-<year>-<seq>`. One invoice per payment.
 */
@Injectable()
export class GenerateClientInvoiceUseCase implements UseCase<
  GenerateClientInvoiceInput,
  ClientInvoiceView
> {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(CLIENT_INVOICE_REPOSITORY) private readonly invoices: ClientInvoiceRepository,
    @Inject(PAYMENT_MISSION_GATEWAY) private readonly missions: PaymentMissionGatewayPort,
    @Inject(BILLING_DIRECTORY) private readonly directory: BillingDirectoryPort,
    @Inject(PDF_GENERATOR) private readonly pdf: PdfGeneratorPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: PaymentCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: GenerateClientInvoiceInput): Promise<ClientInvoiceView> {
    const by = requireAdminWith(input.actor, PAYMENT_PERMISSIONS.VALIDATE);
    const { payment } = await loadVisiblePayment(this.payments, input.actor, input.paymentId);
    const alreadyExists = await this.invoices.existsForPayment(payment.id);
    const mission = await this.missions.findMission(payment.missionId);
    if (!mission) throw missionNotFound(payment.missionId);
    const client = (await this.directory.findClient(payment.clientId)) ?? {
      clientId: payment.clientId,
      name: payment.clientId,
      email: null,
    };

    const now = this.clock.now();
    const id = this.invoices.nextIdentity();
    for (let attempt = 1; ; attempt++) {
      const number = InvoiceNumber.next(
        now.getUTCFullYear(),
        await this.invoices.lastSequence(now.getUTCFullYear()),
      );
      const pdfFile = {
        key: `client-invoices/${id}.pdf`,
        originalName: `${number.value}.pdf`,
        mimeType: 'application/pdf',
        size: 0,
      };
      // business rules first (validated payment, one invoice) — nothing written yet
      const invoice = ClientInvoice.generateFrom(
        { id, payment, invoiceNumber: number, pdfFile, generatedById: by.userId, alreadyExists },
        now,
      );
      const content = await this.pdf.generate(
        clientInvoiceDocument(invoice, payment, client, mission.title),
      );
      pdfFile.size = content.length;
      try {
        await storeThenPersist(this.storage, pdfFile, content, () => this.invoices.save(invoice));
      } catch (error) {
        if (error instanceof InvoiceNumberTaken && attempt < INVOICE_NUMBER_ATTEMPTS) continue;
        throw error;
      }
      await this.committer.afterInvoice(invoice);
      return toClientInvoiceView(invoice);
    }
  }
}

/** Admin (`validate-payments`) emails the invoice to the client; `sentAt` = last delivery. */
@Injectable()
export class SendClientInvoiceUseCase implements UseCase<ClientInvoiceRef, ClientInvoiceView> {
  constructor(
    @Inject(CLIENT_INVOICE_REPOSITORY) private readonly invoices: ClientInvoiceRepository,
    @Inject(BILLING_DIRECTORY) private readonly directory: BillingDirectoryPort,
    @Inject(NOTIFIER) private readonly notifier: NotifierPort,
    private readonly committer: PaymentCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ClientInvoiceRef): Promise<ClientInvoiceView> {
    const by = requireAdminWith(input.actor, PAYMENT_PERMISSIONS.VALIDATE);
    const { invoice } = await loadVisibleInvoice(this.invoices, input.actor, input.invoiceId);
    const client = await this.directory.findClient(invoice.clientId);
    if (!client?.email) {
      throw new ValidationException('CLIENT_EMAIL_MISSING', 'The client has no email address', {
        clientId: invoice.clientId,
      });
    }
    const number = invoice.invoiceNumber.value;
    // not best effort: the admin must know when the email could not be sent
    await this.notifier.notify(invoice.clientId, {
      type: INVOICE_NOTIFICATION_TYPE,
      title: `Facture ${number}`,
      body: 'Votre facture est disponible dans votre espace.',
      data: { invoiceId: invoice.id, invoiceNumber: number },
      email: {
        to: client.email,
        subject: `The Cleverest — facture ${number}`,
        text:
          `Bonjour ${client.name},\n\nVotre facture ${number} est disponible ` +
          `dans votre espace client (rubrique Factures).\n\nL'équipe The Cleverest`,
      },
    });
    invoice.markSent(by.userId, this.clock.now());
    await this.invoices.save(invoice);
    await this.committer.afterInvoice(invoice);
    return toClientInvoiceView(invoice);
  }
}

/** Client: theirs; admin: all, filtered. */
@Injectable()
export class ListClientInvoicesUseCase implements UseCase<
  ListClientInvoicesInput,
  Page<ClientInvoiceView>
> {
  constructor(
    @Inject(CLIENT_INVOICE_REPOSITORY) private readonly invoices: ClientInvoiceRepository,
  ) {}

  async execute(input: ListClientInvoicesInput): Promise<Page<ClientInvoiceView>> {
    const by = resolveActor(input.actor, ['ADMIN', 'CLIENT']);
    const page = await this.invoices.list(normalizePageQuery(input), {
      clientId: by.kind === 'CLIENT' ? by.userId : input.clientId,
      missionId: input.missionId,
      sent: input.sent,
    });
    return page.map(toClientInvoiceView);
  }
}

@Injectable()
export class DownloadClientInvoiceUseCase implements UseCase<ClientInvoiceRef, DownloadedFile> {
  constructor(
    @Inject(CLIENT_INVOICE_REPOSITORY) private readonly invoices: ClientInvoiceRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: ClientInvoiceRef): Promise<DownloadedFile> {
    const { invoice } = await loadVisibleInvoice(this.invoices, input.actor, input.invoiceId);
    return download(this.storage, invoice.pdfFile);
  }
}
