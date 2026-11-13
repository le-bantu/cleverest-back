import { Inject, Injectable } from '@nestjs/common';
import { StoredFileRef } from '@shared/kernel';
import { PendingWrite } from '@shared/application/pending-write';
import { ContractCommitter } from './services/contract-committer';
import {
  Contract,
  CONSULTANT_CONTRACT_REPOSITORY,
  ConsultantContractRepository,
  CONTRACT_REPOSITORY,
  ContractRepository,
} from '../domain';
import { ContractSummary } from './contracts.dto';

/** Public API of the contracts context (used by missions, deliverables). */
@Injectable()
export class ContractsFacade {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly consultantContracts: ConsultantContractRepository,
    private readonly committer: ContractCommitter,
  ) {}

  /**
   * Contract of a deal closed outside the platform: drawn up from the quote
   * just validated (same transaction) and signed at once with the PDF the
   * client signed offline (original = signed document).
   */
  prepareSignedContract(
    input: {
      quote: { id: string; clientId: string; requestNumber: string; price: number | null };
      signedFile: StoredFileRef;
      adminId: string;
    },
    now: Date,
  ): PendingWrite & { contractId: string } {
    const contract = Contract.create(
      {
        id: this.contracts.nextIdentity(),
        quote: {
          ...input.quote,
          status: 'VALIDÉ_ADMIN',
          isSubquote: false,
          readyForContract: true,
          parentQuoteId: null,
          consultantIds: [],
          priceValidated: true,
        },
        originalFile: input.signedFile,
        createdById: input.adminId,
        alreadyExists: false,
      },
      now,
    );
    contract.sign(input.quote.clientId, input.signedFile, now);
    return {
      contractId: contract.id,
      persist: (tx) => this.contracts.save(contract, tx),
      finalize: () => this.committer.afterCommit(contract),
    };
  }

  async findSummary(contractId: string): Promise<ContractSummary | null> {
    const c = await this.contracts.findById(contractId);
    return c ? { id: c.id, quoteId: c.quoteId, clientId: c.clientId, signed: c.signed } : null;
  }

  /** Has the consultant SIGNED their contract on this main quote (or one of its subquotes)? */
  hasSignedConsultantContract(consultantId: string, mainQuoteId: string): Promise<boolean> {
    return this.consultantContracts.hasSigned(consultantId, mainQuoteId);
  }

  /** What Cleverest committed to pay the consultant on this main quote (signed contracts); null if none. */
  signedConsultantAmount(consultantId: string, mainQuoteId: string): Promise<number | null> {
    return this.consultantContracts.signedAmount(consultantId, mainQuoteId);
  }
}
