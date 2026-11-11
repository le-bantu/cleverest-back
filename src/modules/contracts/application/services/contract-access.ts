import { ActorRef, resolveActor } from '@shared/application/actor';
import { ActorContext } from '@shared/application/use-case';
import { Contract, CONTRACT_REPOSITORY, contractNotFound, ContractRepository } from '../../domain';

export { CONTRACT_REPOSITORY };

export const CONTRACT_PERMISSIONS = { MANAGE: 'manage-quotes' } as const;

/**
 * Loads a contract the actor may see: any admin, or the owning client.
 * Anyone else gets a 404 (no existence leak).
 */
export const loadVisibleContract = async (
  contracts: ContractRepository,
  actor: ActorContext,
  contractId: string,
): Promise<{ by: ActorRef; contract: Contract }> => {
  const by = resolveActor(actor, ['ADMIN', 'CLIENT']);
  const contract = await contracts.findById(contractId);
  if (!contract || (by.kind === 'CLIENT' && !contract.isOwnedBy(by.userId))) {
    throw contractNotFound(contractId);
  }
  return { by, contract };
};
