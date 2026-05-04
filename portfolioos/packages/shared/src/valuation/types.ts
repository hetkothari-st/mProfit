/**
 * Vehicle valuation shared types — used by API + web.
 *
 * Money is always serialized as a string (Decimal-safe across HTTP boundary).
 * Frontend parses with `decimal.js` before any arithmetic.
 */

export const SLIDERS = [
  'ac',
  'brakes',
  'carExterior',
  'carInterior',
  'electrical',
  'engine',
  'frame',
  'steering',
  'suspension',
  'transmission',
  'wheelAndTyres',
] as const;

export type SliderKey = typeof SLIDERS[number];

export type SliderStop = 'fair' | 'good' | 'veryGood' | 'excellent';

export type SliderState = Record<SliderKey, SliderStop>;

export const SLIDER_LABELS: Record<SliderKey, string> = {
  ac:            'AC',
  brakes:        'Brakes',
  carExterior:   'Car Exterior',
  carInterior:   'Car Interior',
  electrical:    'Electrical',
  engine:        'Engine',
  frame:         'Frame',
  steering:      'Steering',
  suspension:    'Suspension',
  transmission:  'Transmission',
  wheelAndTyres: 'Wheel and Tyres',
};

export const STOP_LABELS: Record<SliderStop, string> = {
  fair:      'Fair',
  good:      'Good',
  veryGood:  'Very Good',
  excellent: 'Excellent',
};

export const STOPS: SliderStop[] = ['fair', 'good', 'veryGood', 'excellent'];

export type TxnType = 'BUY' | 'SELL';
export type PartyType = 'INDIVIDUAL' | 'DEALER';

export type VehicleCategory =
  | 'Hatchback'
  | 'Sedan'
  | 'SUV'
  | 'MUV'
  | 'Coupe'
  | 'Convertible'
  | 'Bike'
  | 'Scooter';

export interface ValuationQuoteInput {
  category?: VehicleCategory | string;
  make: string;
  model: string;
  year: number;
  trim: string;
  kms: number;
  txnType: TxnType;
  partyType: PartyType;
}

export interface ValuationBuckets {
  bad: string;
  fair: string;
  good: string;
  veryGood: string;
  excellent: string;
}

export interface ValuationProjections {
  future1y: string;
  future3y: string;
  future5y: string;
  residualValue: string;
  salvageValue: string;
  clunkerValue: string;
}

export interface ValuationQuoteResult {
  cacheKey: string;
  buckets: ValuationBuckets;
  projections: ValuationProjections;
  sources: string[];
  isEstimated: boolean;
  computedAt: string; // ISO
  expiresAt: string;
}
