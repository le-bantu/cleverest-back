import { Injectable } from '@nestjs/common';
import { IdentityFacade } from '@modules/identity-access/application/identity.facade';
import { QuotesFacade } from '@modules/quotes/application/quotes.facade';
import { ContractsFacade } from '@modules/contracts/application/contracts.facade';
import { MissionsFacade } from '@modules/missions/application/missions.facade';
import {
  ClientOnboardingPort,
  ClosedDealPort,
  ClosedDealRequest,
  PreparedClient,
  PreparedDeal,
} from '../../domain';

/** Apporteurs → identity-access, through its public facade. */
@Injectable()
export class IdentityClientOnboardingAdapter extends ClientOnboardingPort {
  constructor(private readonly identity: IdentityFacade) {
    super();
  }

  prepareClient(input: {
    email: string;
    name: string;
    phone: string | null;
  }): Promise<PreparedClient> {
    return this.identity.prepareClientAccount(input);
  }
}

/**
 * Apporteurs → quotes + contracts + missions, through their public facades:
 * the regular state machines and invariants apply; writes are deferred to
 * the caller's transaction.
 */
@Injectable()
export class FacadesClosedDealAdapter extends ClosedDealPort {
  constructor(
    private readonly quotes: QuotesFacade,
    private readonly contracts: ContractsFacade,
    private readonly missions: MissionsFacade,
  ) {
    super();
  }

  async prepareDeal(r: ClosedDealRequest, now: Date): Promise<PreparedDeal> {
    const quote = await this.quotes.prepareClosedDealQuote(
      {
        clientId: r.clientId,
        title: r.quoteTitle,
        description: r.description,
        type: r.quoteType,
        price: r.price,
        adminId: r.adminId,
      },
      now,
    );
    const { id: quoteId, requestNumber, price } = quote.validated;
    const contract = this.contracts.prepareSignedContract(
      {
        quote: { id: quoteId, clientId: r.clientId, requestNumber, price },
        signedFile: r.signedContract,
        adminId: r.adminId,
      },
      now,
    );
    const mission = this.missions.prepareMission(
      {
        contract: { id: contract.contractId, quoteId, clientId: r.clientId },
        title: r.missionTitle,
        description: r.missionDescription,
        deliveryDate: r.deliveryDate,
        contractFile: r.missionContractFile,
        adminId: r.adminId,
      },
      now,
    );
    const steps = [quote, contract, mission];
    return {
      quoteId,
      contractId: contract.contractId,
      missionId: mission.missionId,
      persist: async (tx) => {
        for (const step of steps) await step.persist(tx);
      },
      finalize: async () => {
        for (const step of steps) await step.finalize();
      },
    };
  }
}
