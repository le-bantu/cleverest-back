import { ValidationException } from '@shared/kernel';

export enum QuoteType {
  CONSULTATION = 'CONSULTATION',
  ABONNEMENT = 'ABONNEMENT',
}

export const ALL_QUOTE_TYPES: readonly QuoteType[] = Object.values(QuoteType);

export const parseQuoteType = (value: string): QuoteType => {
  if (!(ALL_QUOTE_TYPES as string[]).includes(value)) {
    throw new ValidationException('INVALID_QUOTE_TYPE', `Unknown quote type "${value}"`);
  }
  return value as QuoteType;
};
