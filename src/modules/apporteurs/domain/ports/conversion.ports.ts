import { StoredFileRef } from '@shared/kernel';

/** A write prepared by another context, persisted inside the conversion transaction. */
export interface PreparedWrite {
  persist(tx: unknown): Promise<void>;
  /** audit / events once the transaction committed */
  finalize(): Promise<void>;
}

export interface PreparedClient extends PreparedWrite {
  clientId: string;
  /** false when an existing client account is reused */
  created: boolean;
  email: string;
  temporaryPassword: string | null;
}

/** PORT to identity-access: the client account of the converted prospect. */
export abstract class ClientOnboardingPort {
  abstract prepareClient(input: {
    email: string;
    name: string;
    phone: string | null;
  }): Promise<PreparedClient>;
}

export const CLIENT_ONBOARDING = Symbol('APPORTEURS_CLIENT_ONBOARDING');

export interface ClosedDealRequest {
  clientId: string;
  quoteTitle: string;
  description: string;
  quoteType: string;
  /** validated price of the deal (EUR) */
  price: number;
  /** contract signed offline by the client (PDF) */
  signedContract: StoredFileRef;
  missionTitle: string;
  missionDescription: string | null;
  deliveryDate: Date | null;
  missionContractFile: StoredFileRef;
  adminId: string;
}

export interface PreparedDeal extends PreparedWrite {
  quoteId: string;
  contractId: string;
  missionId: string;
}

/** PORT to quotes + contracts + missions: quote SIGNÉ_CLIENT, signed contract, mission. */
export abstract class ClosedDealPort {
  abstract prepareDeal(request: ClosedDealRequest, now: Date): Promise<PreparedDeal>;
}

export const CLOSED_DEAL = Symbol('APPORTEURS_CLOSED_DEAL');
