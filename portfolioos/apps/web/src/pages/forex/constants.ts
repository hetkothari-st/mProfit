// Currencies the UI picker exposes. Kept aligned with packages/api/src/priceFeeds/fx.service.ts
// SUPPORTED_FX_CURRENCIES — when the backend list grows, update both.
export const SUPPORTED_CCY = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AED',
  'SGD',
  'AUD',
  'CAD',
  'CHF',
  'HKD',
  'CNY',
] as const;
export type SupportedCcy = (typeof SUPPORTED_CCY)[number];

export const LRS_PURPOSES = [
  'INVESTMENT',
  'EDUCATION',
  'TRAVEL',
  'GIFT',
  'MAINTENANCE',
  'MEDICAL',
  'OTHER',
] as const;
export type LrsPurpose = (typeof LRS_PURPOSES)[number];
