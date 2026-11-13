import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, fileExtension, StoredFileRef } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { UNIT_OF_WORK, UnitOfWorkPort } from '@shared/application/ports/unit-of-work.port';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { IncomingFile, toStoredRef } from '@shared/application/files';
import {
  CLIENT_ONBOARDING,
  ClientOnboardingPort,
  CLOSED_DEAL,
  ClosedDealPort,
  Commission,
  COMMISSION_REPOSITORY,
  CommissionRepository,
  PROSPECT_REPOSITORY,
  prospectNotFound,
  ProspectRepository,
} from '../../domain';
import { ConversionResult, ConvertProspectInput, toProspectView } from '../apporteurs.dto';
import { APPORTEUR_PERMISSIONS, ApporteurCommitter } from '../apporteur-services';

export const CLIENT_ACCOUNT_NOTIFICATION_TYPE = 'account';

/**
 * Admin (`manage-users`) converts a pending prospect into a deal closed
 * outside the platform, in ONE transaction:
 * client account (reused if it exists) + quote SIGNÉ_CLIENT + signed contract
 * + mission + commission EN_ATTENTE + prospect CONVERTI.
 * Every business rule is checked before anything is written; if any write
 * fails, nothing is kept (database rollback + uploaded files removed).
 */
@Injectable()
export class ConvertProspectUseCase implements UseCase<ConvertProspectInput, ConversionResult> {
  constructor(
    @Inject(PROSPECT_REPOSITORY) private readonly prospects: ProspectRepository,
    @Inject(COMMISSION_REPOSITORY) private readonly commissions: CommissionRepository,
    @Inject(CLIENT_ONBOARDING) private readonly onboarding: ClientOnboardingPort,
    @Inject(CLOSED_DEAL) private readonly deals: ClosedDealPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ApporteurCommitter,
    private readonly notifier: BestEffortNotifier,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: ConvertProspectInput): Promise<ConversionResult> {
    const by = requireAdminWith(input.actor, APPORTEUR_PERMISSIONS.CONVERT);
    const prospect = await this.prospects.findById(input.prospectId);
    if (!prospect) throw prospectNotFound(input.prospectId);
    const email = prospect.assertConvertible();
    const now = this.clock.now();

    // 1. prepare every write (rules checked, nothing persisted yet)
    const client = await this.onboarding.prepareClient({
      email,
      name: prospect.displayName,
      phone: prospect.contactPhone,
    });
    const base = `conversions/${prospect.id}`;
    const signedContract = this.ref(`${base}/contrat-signe`, input.signedContract);
    const missionContract = this.ref(`${base}/contrat-mission`, input.contractMission);
    const deal = await this.deals.prepareDeal(
      {
        clientId: client.clientId,
        quoteTitle: input.quoteTitle,
        description:
          input.description?.trim() ||
          `Affaire apportée : ${prospect.displayName} (${prospect.name})`,
        quoteType: input.quoteType ?? 'CONSULTATION',
        price: input.price,
        signedContract,
        missionTitle: input.missionTitle,
        missionDescription: input.missionDescription ?? null,
        deliveryDate: input.deliveryDate ?? null,
        missionContractFile: missionContract,
        adminId: by.userId,
      },
      now,
    );
    const commission = Commission.createForConversion(
      {
        id: this.commissions.nextIdentity(),
        apporteurId: prospect.apporteurId,
        prospectId: prospect.id,
        clientId: client.clientId,
        missionId: deal.missionId,
        clientName: prospect.displayName,
        missionTitle: input.missionTitle.trim(),
        amount: input.commissionAmount,
        actorId: by.userId,
      },
      now,
    );
    prospect.convert(by.userId, { clientId: client.clientId, missionId: deal.missionId }, now);

    // 2. files, then ONE transaction
    const files: Array<[StoredFileRef, IncomingFile]> = [
      [signedContract, input.signedContract],
      [missionContract, input.contractMission],
    ];
    try {
      for (const [ref, file] of files) {
        await this.storage.put({
          key: ref.key,
          content: file.buffer,
          contentType: ref.mimeType ?? undefined,
        });
      }
      await this.uow.run(async (tx) => {
        await client.persist(tx);
        await deal.persist(tx);
        await this.commissions.save(commission, tx);
        await this.prospects.save(prospect, tx);
      });
    } catch (error) {
      for (const [ref] of files) await this.storage.delete(ref.key).catch(() => undefined);
      throw error;
    }

    // 3. side effects, once committed
    await client.finalize();
    await deal.finalize();
    await this.committer.afterCommission(commission);
    await this.committer.afterProspect(prospect);
    if (client.temporaryPassword) {
      await this.notifier.notify([client.clientId], {
        type: CLIENT_ACCOUNT_NOTIFICATION_TYPE,
        title: 'Bienvenue chez The Cleverest',
        body: 'Votre espace client a été créé.',
        email: {
          to: client.email,
          subject: 'The Cleverest — votre espace client',
          text:
            `Bonjour,\n\nVotre espace client The Cleverest a été créé.\n` +
            `Identifiant : ${client.email}\nMot de passe temporaire : ${client.temporaryPassword}\n\n` +
            `Merci de le changer dès votre première connexion.\n\nL'équipe The Cleverest`,
        },
      });
    }

    return {
      prospect: toProspectView(prospect),
      clientId: client.clientId,
      clientCreated: client.created,
      quoteId: deal.quoteId,
      contractId: deal.contractId,
      missionId: deal.missionId,
      commissionId: commission.id,
    };
  }

  private ref(keyWithoutExt: string, file: IncomingFile): StoredFileRef {
    return toStoredRef(`${keyWithoutExt}${fileExtension(file.originalName)}`, file);
  }
}
