import { Injectable } from '@nestjs/common';
import { MissionsFacade } from '@modules/missions/application/missions.facade';
import { ContractsFacade } from '@modules/contracts/application/contracts.facade';
import {
  ConsultantCommitmentPort,
  InvoiceMissionGatewayPort,
  MissionForInvoice,
} from '../../domain';

/** Consultant invoices → missions, through the missions public facade only. */
@Injectable()
export class InvoiceMissionsGatewayAdapter extends InvoiceMissionGatewayPort {
  constructor(private readonly missions: MissionsFacade) {
    super();
  }

  async findMission(missionId: string): Promise<MissionForInvoice | null> {
    const m = await this.missions.findSummary(missionId);
    return m ? { id: m.id, quoteId: m.quoteId, consultantIds: m.consultantIds } : null;
  }
}

/** Consultant invoices → contracts, through the contracts public facade only. */
@Injectable()
export class ContractsCommitmentAdapter extends ConsultantCommitmentPort {
  constructor(private readonly contracts: ContractsFacade) {
    super();
  }

  signedAmount(consultantId: string, quoteId: string): Promise<number | null> {
    return this.contracts.signedConsultantAmount(consultantId, quoteId);
  }
}
