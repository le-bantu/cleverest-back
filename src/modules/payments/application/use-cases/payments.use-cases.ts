import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, fileExtension, normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith, resolveActor } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { download, DownloadedFile, storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  missionNotFound,
  Payment,
  PAYMENT_MISSION_GATEWAY,
  PAYMENT_REPOSITORY,
  PaymentMissionGatewayPort,
  PaymentRepository,
} from '../../domain';
import {
  ConsultantPaymentView,
  ListPaymentsInput,
  PaymentRef,
  PaymentView,
  SubmitPaymentInput,
  toConsultantPaymentView,
  toPaymentView,
} from '../payments.dto';
import {
  loadVisiblePayment,
  PAYMENT_PERMISSIONS,
  PaymentCommitter,
} from '../services/payment-services';

/** The client declares a payment (bank transfer proof) on one of their missions. */
@Injectable()
export class SubmitPaymentUseCase implements UseCase<SubmitPaymentInput, PaymentView> {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_MISSION_GATEWAY) private readonly missions: PaymentMissionGatewayPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: PaymentCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SubmitPaymentInput): Promise<PaymentView> {
    const by = resolveActor(input.actor, ['CLIENT']);
    const mission = await this.missions.findMission(input.missionId);
    if (!mission) throw missionNotFound(input.missionId);
    const id = this.payments.nextIdentity();
    const file = toStoredRef(
      `payments/${mission.id}/${id}${fileExtension(input.file.originalName)}`,
      input.file,
    );
    const payment = Payment.submit(
      { id, mission, clientId: by.userId, amount: input.amount, proofFile: file },
      this.clock.now(),
    );
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.payments.save(payment),
    );
    await this.committer.afterPayment(payment);
    return toPaymentView(payment);
  }
}

/**
 * One list for every audience: client = theirs; consultant = payments of the
 * missions they work on (reduced view); admin = all, with client/consultant filters.
 */
@Injectable()
export class ListPaymentsUseCase implements UseCase<
  ListPaymentsInput,
  Page<PaymentView | ConsultantPaymentView>
> {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_MISSION_GATEWAY) private readonly missions: PaymentMissionGatewayPort,
  ) {}

  async execute(input: ListPaymentsInput): Promise<Page<PaymentView | ConsultantPaymentView>> {
    const by = resolveActor(input.actor);
    const consultantId =
      by.kind === 'CONSULTANT' ? by.userId : by.kind === 'ADMIN' ? input.consultantId : undefined;
    const page = await this.payments.list(normalizePageQuery(input), {
      clientId: by.kind === 'CLIENT' ? by.userId : by.kind === 'ADMIN' ? input.clientId : undefined,
      missionIds: consultantId
        ? await this.missions.missionIdsForConsultant(consultantId)
        : undefined,
      missionId: input.missionId,
      isValidated: input.isValidated,
      uploadedFrom: input.uploadedFrom,
      uploadedTo: input.uploadedTo,
    });
    return page.map((p) =>
      by.kind === 'CONSULTANT' ? toConsultantPaymentView(p) : toPaymentView(p),
    );
  }
}

@Injectable()
export class GetPaymentUseCase implements UseCase<PaymentRef, PaymentView> {
  constructor(@Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository) {}

  async execute(input: PaymentRef): Promise<PaymentView> {
    const { payment } = await loadVisiblePayment(this.payments, input.actor, input.paymentId);
    return toPaymentView(payment);
  }
}

/** Proof of transfer, for the owning client or an admin. */
@Injectable()
export class DownloadPaymentProofUseCase implements UseCase<PaymentRef, DownloadedFile> {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: PaymentRef): Promise<DownloadedFile> {
    const { payment } = await loadVisiblePayment(this.payments, input.actor, input.paymentId);
    return download(this.storage, payment.proofFile);
  }
}

/** Admin with `validate-payments` (checked here, not only by the guard). */
@Injectable()
export class ValidatePaymentUseCase implements UseCase<PaymentRef, PaymentView> {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    private readonly committer: PaymentCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: PaymentRef): Promise<PaymentView> {
    const by = requireAdminWith(input.actor, PAYMENT_PERMISSIONS.VALIDATE);
    const { payment } = await loadVisiblePayment(this.payments, input.actor, input.paymentId);
    payment.validate(by.userId, this.clock.now());
    await this.payments.save(payment);
    await this.committer.afterPayment(payment);
    return toPaymentView(payment);
  }
}
