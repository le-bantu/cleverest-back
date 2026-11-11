import { Contract } from '../../domain';
import { ContractView } from '../contracts.dto';

export const toContractView = (c: Contract): ContractView => ({
  id: c.id,
  quoteId: c.quoteId,
  clientId: c.clientId,
  signed: c.signed,
  signedAt: c.signedAt,
  originalFileName: c.originalFile.originalName,
  signedFileName: c.signedFile?.originalName ?? null,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});
