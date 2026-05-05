/**
 * Owned-property (Real Estate) DTOs and input shapes shared across the
 * API and the web client. Money fields are strings on the wire (per §3.2);
 * parse via `toDecimal` before any arithmetic.
 */

export const PROPERTY_TYPES = [
  'APARTMENT',
  'INDEPENDENT_HOUSE',
  'VILLA',
  'PLOT_LAND',
  'COMMERCIAL_OFFICE',
  'COMMERCIAL_SHOP',
  'AGRICULTURAL',
  'PARKING_GARAGE',
  'UNDER_CONSTRUCTION',
  'OTHER',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_STATUSES = [
  'SELF_OCCUPIED',
  'SECOND_HOME',
  'VACANT',
  'RENTED_OUT',
  'UNDER_CONSTRUCTION',
  'SOLD',
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const OWNERSHIP_TYPES = ['SOLE', 'JOINT', 'HUF', 'COMPANY'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export const MAINTENANCE_FREQUENCIES = [
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
] as const;
export type MaintenanceFrequency = (typeof MAINTENANCE_FREQUENCIES)[number];

export interface OwnedPropertyDTO {
  id: string;
  userId: string;
  portfolioId: string | null;

  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;

  propertyType: PropertyType;
  status: PropertyStatus;

  builtUpSqft: string | null;
  carpetSqft: string | null;
  plotAreaSqft: string | null;
  floors: number | null;

  ownershipType: OwnershipType;
  ownershipPercent: string;
  coOwners: string | null;

  purchaseDate: string | null;
  purchasePrice: string | null;
  stampDuty: string | null;
  registrationFee: string | null;
  brokerage: string | null;
  otherCosts: string | null;

  currentValue: string | null;
  currentValueSource: string | null;
  currentValueAsOf: string | null;

  loanId: string | null;
  insurancePolicyId: string | null;
  rentalPropertyId: string | null;

  annualPropertyTax: string | null;
  propertyTaxDueMonth: number | null;
  societyName: string | null;
  monthlyMaintenance: string | null;
  maintenanceFrequency: MaintenanceFrequency | null;

  ownerName: string | null;
  electricityConsumerNo: string | null;
  waterConnectionNo: string | null;
  gasConnectionNo: string | null;
  khataNo: string | null;
  surveyNo: string | null;

  builderName: string | null;
  projectName: string | null;
  reraRegNo: string | null;
  expectedPossessionDate: string | null;
  paymentSchedulePaidPct: string | null;

  leaseholdEndDate: string | null;

  saleDate: string | null;
  salePrice: string | null;
  saleBrokerage: string | null;

  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  APARTMENT: 'Apartment',
  INDEPENDENT_HOUSE: 'Independent house',
  VILLA: 'Villa',
  PLOT_LAND: 'Plot / Land',
  COMMERCIAL_OFFICE: 'Commercial — office',
  COMMERCIAL_SHOP: 'Commercial — shop',
  AGRICULTURAL: 'Agricultural',
  PARKING_GARAGE: 'Parking / Garage',
  UNDER_CONSTRUCTION: 'Under construction',
  OTHER: 'Other',
};

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  SELF_OCCUPIED: 'Self-occupied',
  SECOND_HOME: 'Second home',
  VACANT: 'Vacant',
  RENTED_OUT: 'Rented out',
  UNDER_CONSTRUCTION: 'Under construction',
  SOLD: 'Sold',
};

export interface CreateOwnedPropertyInput {
  name: string;
  propertyType: PropertyType;
  status?: PropertyStatus;
  portfolioId?: string | null;

  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string;

  builtUpSqft?: string | null;
  carpetSqft?: string | null;
  plotAreaSqft?: string | null;
  floors?: number | null;

  ownershipType?: OwnershipType;
  ownershipPercent?: string;
  coOwners?: string | null;

  purchaseDate?: string | null;
  purchasePrice?: string | null;
  stampDuty?: string | null;
  registrationFee?: string | null;
  brokerage?: string | null;
  otherCosts?: string | null;

  currentValue?: string | null;
  currentValueSource?: string | null;
  currentValueAsOf?: string | null;

  loanId?: string | null;
  insurancePolicyId?: string | null;
  rentalPropertyId?: string | null;

  annualPropertyTax?: string | null;
  propertyTaxDueMonth?: number | null;
  societyName?: string | null;
  monthlyMaintenance?: string | null;
  maintenanceFrequency?: MaintenanceFrequency | null;

  ownerName?: string | null;
  electricityConsumerNo?: string | null;
  waterConnectionNo?: string | null;
  gasConnectionNo?: string | null;
  khataNo?: string | null;
  surveyNo?: string | null;

  builderName?: string | null;
  projectName?: string | null;
  reraRegNo?: string | null;
  expectedPossessionDate?: string | null;
  paymentSchedulePaidPct?: string | null;

  leaseholdEndDate?: string | null;

  notes?: string | null;
  isActive?: boolean;
}

export type UpdateOwnedPropertyInput = Partial<CreateOwnedPropertyInput>;

export interface MarkSoldInput {
  saleDate: string;
  salePrice: string;
  saleBrokerage?: string | null;
}

export interface RefreshValueInput {
  currentValue: string;
  currentValueSource?: string | null;
}

export interface PropertyCapitalGainDTO {
  propertyId: string;
  saleDate: string;
  salePrice: string;
  saleBrokerage: string;
  netSaleProceeds: string; // salePrice − saleBrokerage
  totalCostBasis: string;  // purchasePrice + stampDuty + registrationFee + brokerage + otherCosts
  holdingMonths: number;
  isLongTerm: boolean;     // ≥ 24 months for property

  /** Owner's share factor applied to gains (ownershipPercent / 100). */
  ownershipShare: string;

  /** Non-indexed gain (used in 12.5% regime under Finance Act 2024). */
  nonIndexedGain: string;
  estimatedTaxNonIndexed: string;

  /** LTCG-only: indexed cost + indexed gain (20% regime, pre-23-Jul-2024 buys). */
  ciiBuyYear: number | null;
  ciiSellYear: number | null;
  buyFY: string | null;
  sellFY: string | null;
  indexedCost: string | null;
  indexedGain: string | null;
  estimatedTaxIndexed: string | null;

  /** True when the buy date is on/before 2024-07-23 — user may pick either method. */
  hasIndexationChoice: boolean;
}
