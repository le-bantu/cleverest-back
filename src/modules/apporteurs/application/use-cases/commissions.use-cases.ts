import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith, resolveActor } from '@shared/application/actor';
import {
  COMMISSION_REPOSITORY,
  commissionNotFound,
  CommissionRepository,
  parseCommissionStatus,
} from '../../domain';
import {
  CommissionRef,
  CommissionView,
  ListCommissionsInput,
  SetCommissionAmountInput,
  toCommissionView,
  UpdateCommissionStatusInput,
} from '../apporteurs.dto';
import {
  APPORTEUR_PERMISSIONS,
  ApporteurCommitter,
  loadVisibleCommission,
} from '../apporteur-services';

/** Apporteur: theirs; admin: all, filtered. */
@Injectable()
export class ListCommissionsUseCase implements UseCase<ListCommissionsInput, Page<CommissionView>> {
  constructor(@Inject(COMMISSION_REPOSITORY) private readonly commissions: CommissionRepository) {}

  async execute(input: ListCommissionsInput): Promise<Page<CommissionView>> {
    const by = resolveActor(input.actor, ['ADMIN', 'APPORTEUR']);
    const page = await this.commissions.list(normalizePageQuery(input), {
      apporteurId: by.kind === 'APPORTEUR' ? by.userId : input.apporteurId,
      status: input.status,
      missionId: input.missionId,
    });
    return page.map(toCommissionView);
  }
}

@Injectable()
export class GetCommissionUseCase implements UseCase<CommissionRef, CommissionView> {
  constructor(@Inject(COMMISSION_REPOSITORY) private readonly commissions: CommissionRepository) {}

  async execute(input: CommissionRef): Promise<CommissionView> {
    const { commission } = await loadVisibleCommission(
      this.commissions,
      input.actor,
      input.commissionId,
    );
    return toCommissionView(commission);
  }
}

/** Admin (`pay-apporteurs`): EN_ATTENTE → VALIDÉE → PAYÉE. */
@Injectable()
export class UpdateCommissionStatusUseCase implements UseCase<
  UpdateCommissionStatusInput,
  CommissionView
> {
  constructor(
    @Inject(COMMISSION_REPOSITORY) private readonly commissions: CommissionRepository,
    private readonly committer: ApporteurCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UpdateCommissionStatusInput): Promise<CommissionView> {
    const by = requireAdminWith(input.actor, APPORTEUR_PERMISSIONS.PAY);
    const target = parseCommissionStatus(input.status);
    const commission = await this.commissions.findById(input.commissionId);
    if (!commission) throw commissionNotFound(input.commissionId);
    commission.updateStatus(target, by.userId, this.clock.now());
    await this.commissions.save(commission);
    await this.committer.afterCommission(commission);
    return toCommissionView(commission);
  }
}

/** Admin (`pay-apporteurs`) sets the amount while the commission is pending. */
@Injectable()
export class SetCommissionAmountUseCase implements UseCase<
  SetCommissionAmountInput,
  CommissionView
> {
  constructor(
    @Inject(COMMISSION_REPOSITORY) private readonly commissions: CommissionRepository,
    private readonly committer: ApporteurCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SetCommissionAmountInput): Promise<CommissionView> {
    const by = requireAdminWith(input.actor, APPORTEUR_PERMISSIONS.PAY);
    const commission = await this.commissions.findById(input.commissionId);
    if (!commission) throw commissionNotFound(input.commissionId);
    const previous = commission.amount;
    commission.setAmount(input.amount, this.clock.now());
    await this.commissions.save(commission);
    await this.committer.auditAmount(commission, previous, by.userId);
    return toCommissionView(commission);
  }
}
