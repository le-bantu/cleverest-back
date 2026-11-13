/** The mission as the payments context needs to see it. */
export interface MissionForPayment {
  id: string;
  clientId: string;
  title: string;
  consultantIds: string[];
}

/** PORT to the missions context. */
export abstract class PaymentMissionGatewayPort {
  abstract findMission(missionId: string): Promise<MissionForPayment | null>;
  abstract missionIdsForConsultant(consultantId: string): Promise<string[]>;
}

export const PAYMENT_MISSION_GATEWAY = Symbol('PAYMENTS_MISSION_GATEWAY');

/** Who is billed. */
export interface BilledClient {
  clientId: string;
  /** company / display name, falls back to the email */
  name: string;
  email: string | null;
}

/** PORT (read-only) onto the identity data needed on an invoice. */
export abstract class BillingDirectoryPort {
  abstract findClient(clientId: string): Promise<BilledClient | null>;
}

export const BILLING_DIRECTORY = Symbol('PAYMENTS_BILLING_DIRECTORY');
