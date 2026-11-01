import { InputError } from './input.js';

// All supported currencies use two decimal places. No exchange conversion.
export const CURRENCIES = [
  'RUB',
  'USD',
  'EUR',
  'INR',
  'GBP',
  'CNY',
  'KZT',
  'BYN',
  'UAH',
  'GEL',
  'TRY',
  'AED',
] as const;
export function currencyCode(value: unknown): string {
  if (value === undefined) return 'RUB';
  if (
    typeof value !== 'string' ||
    !CURRENCIES.includes(value as (typeof CURRENCIES)[number])
  )
    throw new InputError(400, 'Выберите валюту из списка.');
  return value;
}
