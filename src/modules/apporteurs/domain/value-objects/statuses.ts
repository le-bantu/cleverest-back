import { ValidationException } from '@shared/kernel';

export enum ProspectStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  CONVERTI = 'CONVERTI',
  REJETE = 'REJETÉ',
}

export enum CommissionStatus {
  EN_ATTENTE = 'EN_ATTENTE',
  VALIDEE = 'VALIDÉE',
  PAYEE = 'PAYÉE',
}

export const ALL_PROSPECT_STATUSES: readonly ProspectStatus[] = Object.values(ProspectStatus);
export const ALL_COMMISSION_STATUSES: readonly CommissionStatus[] = Object.values(CommissionStatus);

/** Forward-only: EN_ATTENTE → VALIDÉE → PAYÉE. */
export const COMMISSION_NEXT: ReadonlyMap<CommissionStatus, CommissionStatus> = new Map([
  [CommissionStatus.EN_ATTENTE, CommissionStatus.VALIDEE],
  [CommissionStatus.VALIDEE, CommissionStatus.PAYEE],
]);

export const parseCommissionStatus = (value: string): CommissionStatus => {
  if (!(ALL_COMMISSION_STATUSES as string[]).includes(value)) {
    throw new ValidationException('INVALID_COMMISSION_STATUS', `Unknown status "${value}"`);
  }
  return value as CommissionStatus;
};
