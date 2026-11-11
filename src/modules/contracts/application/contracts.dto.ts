import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { IncomingFile } from '@shared/application/files';

export interface ContractRef {
  actor: ActorContext;
  contractId: string;
}

export interface CreateContractInput {
  actor: ActorContext;
  quoteId: string;
  file: IncomingFile;
}

export interface SignContractInput extends ContractRef {
  file: IncomingFile;
}

export interface ListContractsInput extends Partial<PageQuery> {
  actor: ActorContext;
  quoteId?: string;
  signed?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
}

export type ContractFileVersion = 'original' | 'signed';

export interface DownloadContractInput extends ContractRef {
  version: ContractFileVersion;
}

export interface ContractView {
  id: string;
  quoteId: string;
  clientId: string;
  signed: boolean;
  signedAt: Date | null;
  originalFileName: string;
  signedFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What the missions context may know about a contract. */
export interface ContractSummary {
  id: string;
  quoteId: string;
  clientId: string;
  signed: boolean;
}

// ------------------------------------------------------------ consultant contracts

export interface ConsultantContractRef {
  actor: ActorContext;
  contractId: string;
}

export interface CreateConsultantContractInput {
  actor: ActorContext;
  quoteId: string;
  consultantId: string;
  /** defaults to the subquote price; required on a main quote */
  amount?: number | null;
  file: IncomingFile;
}

export interface SignConsultantContractInput extends ConsultantContractRef {
  file: IncomingFile;
}

export interface ListConsultantContractsInput extends Partial<PageQuery> {
  actor: ActorContext;
  consultantId?: string;
  quoteId?: string;
  /** main quote: contracts on it and on its subquotes */
  rootQuoteId?: string;
  signed?: boolean;
}

export interface DownloadConsultantContractInput extends ConsultantContractRef {
  version: ContractFileVersion;
}

export interface ConsultantContractView {
  id: string;
  quoteId: string;
  rootQuoteId: string;
  consultantId: string;
  amount: number;
  signed: boolean;
  signedAt: Date | null;
  originalFileName: string;
  signedFileName: string | null;
  createdAt: Date;
  updatedAt: Date;
}
