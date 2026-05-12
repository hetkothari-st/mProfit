/**
 * Indian state metadata for fuel/electricity price lookups.
 *
 * `code` is the 2-letter RTO state prefix (first 2 chars of an RC number,
 * e.g. "MH" for MH47BT5950). Vehicle.rtoCode begins with this — we slice
 * off the leading two characters to default the user's state in the UI.
 *
 * `slug` is the Goodreturns URL slug (lowercase, hyphenated). They use a
 * single all-states price page (`/petrol-price.html`) where state rows are
 * keyed by display name; we match on `slug` after normalising both sides.
 */

export interface FuelState {
  code: string;       // 2-letter RTO prefix
  name: string;       // Display name
  slug: string;       // Lowercase normalised name for scraper matching
}

export const FUEL_STATES: FuelState[] = [
  { code: 'AN', name: 'Andaman and Nicobar Islands', slug: 'andaman-nicobar' },
  { code: 'AP', name: 'Andhra Pradesh', slug: 'andhra-pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh', slug: 'arunachal-pradesh' },
  { code: 'AS', name: 'Assam', slug: 'assam' },
  { code: 'BR', name: 'Bihar', slug: 'bihar' },
  { code: 'CH', name: 'Chandigarh', slug: 'chandigarh' },
  { code: 'CG', name: 'Chhattisgarh', slug: 'chhattisgarh' },
  { code: 'DD', name: 'Daman and Diu', slug: 'daman-diu' },
  { code: 'DL', name: 'Delhi', slug: 'delhi' },
  { code: 'GA', name: 'Goa', slug: 'goa' },
  { code: 'GJ', name: 'Gujarat', slug: 'gujarat' },
  { code: 'HR', name: 'Haryana', slug: 'haryana' },
  { code: 'HP', name: 'Himachal Pradesh', slug: 'himachal-pradesh' },
  { code: 'JK', name: 'Jammu and Kashmir', slug: 'jammu-kashmir' },
  { code: 'JH', name: 'Jharkhand', slug: 'jharkhand' },
  { code: 'KA', name: 'Karnataka', slug: 'karnataka' },
  { code: 'KL', name: 'Kerala', slug: 'kerala' },
  { code: 'LA', name: 'Ladakh', slug: 'ladakh' },
  { code: 'LD', name: 'Lakshadweep', slug: 'lakshadweep' },
  { code: 'MP', name: 'Madhya Pradesh', slug: 'madhya-pradesh' },
  { code: 'MH', name: 'Maharashtra', slug: 'maharashtra' },
  { code: 'MN', name: 'Manipur', slug: 'manipur' },
  { code: 'ML', name: 'Meghalaya', slug: 'meghalaya' },
  { code: 'MZ', name: 'Mizoram', slug: 'mizoram' },
  { code: 'NL', name: 'Nagaland', slug: 'nagaland' },
  { code: 'OD', name: 'Odisha', slug: 'odisha' },
  { code: 'OR', name: 'Odisha', slug: 'odisha' }, // legacy OR prefix
  { code: 'PY', name: 'Puducherry', slug: 'puducherry' },
  { code: 'PB', name: 'Punjab', slug: 'punjab' },
  { code: 'RJ', name: 'Rajasthan', slug: 'rajasthan' },
  { code: 'SK', name: 'Sikkim', slug: 'sikkim' },
  { code: 'TN', name: 'Tamil Nadu', slug: 'tamil-nadu' },
  { code: 'TS', name: 'Telangana', slug: 'telangana' },
  { code: 'TG', name: 'Telangana', slug: 'telangana' }, // alt prefix in some series
  { code: 'TR', name: 'Tripura', slug: 'tripura' },
  { code: 'UP', name: 'Uttar Pradesh', slug: 'uttar-pradesh' },
  { code: 'UK', name: 'Uttarakhand', slug: 'uttarakhand' },
  { code: 'UA', name: 'Uttarakhand', slug: 'uttarakhand' }, // legacy UA prefix
  { code: 'WB', name: 'West Bengal', slug: 'west-bengal' },
];

const BY_CODE = new Map(FUEL_STATES.map((s) => [s.code, s]));
const BY_SLUG = new Map(FUEL_STATES.map((s) => [s.slug, s]));

export function getStateByCode(code: string): FuelState | undefined {
  return BY_CODE.get(code.toUpperCase());
}

export function getStateBySlug(slug: string): FuelState | undefined {
  return BY_SLUG.get(slug.toLowerCase());
}

/** Normalise a Goodreturns row label to our slug (lowercase, hyphenated, alnum only). */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extract state code from an RC's rtoCode (e.g. "MH47" → "MH"). */
export function stateFromRtoCode(rtoCode: string | null | undefined): string | null {
  if (!rtoCode) return null;
  const m = rtoCode.match(/^([A-Z]{2})/);
  return m ? m[1]! : null;
}

/** List of unique states for the frontend dropdown (dedup by slug). */
export function listUniqueStates(): FuelState[] {
  const seen = new Set<string>();
  const out: FuelState[] = [];
  for (const s of FUEL_STATES) {
    if (seen.has(s.slug)) continue;
    seen.add(s.slug);
    out.push(s);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
