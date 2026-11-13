/** The mission as the consultant-invoices context needs to see it. */
export interface MissionForInvoice {
  id: string;
  /** main quote — the consultant contract cap applies per (consultant, main quote) */
  quoteId: string;
  consultantIds: string[];
}

/** PORT to the missions context. */
export abstract class InvoiceMissionGatewayPort {
  abstract findMission(missionId: string): Promise<MissionForInvoice | null>;
}

export const INVOICE_MISSION_GATEWAY = Symbol('CONSULTANT_INVOICES_MISSION_GATEWAY');

/** PORT to the contracts context. */
export abstract class ConsultantCommitmentPort {
  /** sum of the consultant's SIGNED contracts on the main quote; null when none is signed */
  abstract signedAmount(consultantId: string, quoteId: string): Promise<number | null>;
}

export const CONSULTANT_COMMITMENT = Symbol('CONSULTANT_INVOICES_COMMITMENT');
