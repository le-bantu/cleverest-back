/** The contract as the missions context needs to see it. */
export interface ContractForMission {
  id: string;
  quoteId: string;
  clientId: string;
  signed: boolean;
}

/** PORT to the contracts context. */
export abstract class ContractGatewayPort {
  abstract findContract(contractId: string): Promise<ContractForMission | null>;
}

export const CONTRACT_GATEWAY = Symbol('MISSIONS_CONTRACT_GATEWAY');
