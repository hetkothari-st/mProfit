/**
 * §7.4 SMS fallback adapter.
 *
 * The user texts VAHAN <regNo> to 07738299899 and pastes the reply. The
 * SMS format is stable enough to regex-parse: labelled fields separated
 * by punctuation, always in the same order. We parse what we can and
 * return `ok: true` even if some fields are missing — the goal is to
 * never lose user-provided data, only to ask them to fill gaps manually.
 *
 * Example SMS bodies we've observed (anonymised):
 *
 *   RC: MH47BT5950, Owner: RAJESH KUMAR, Make/Model: HONDA CITY,
 *   Fuel: PETROL, MFG: 2019, Chassis: ...1234, Engine: ...5678,
 *   Insurance: 12/03/2025, PUC: 01/09/2024, Fitness: --,
 *   Road Tax: 15/06/2030
 *
 *   Vehicle: DL1CAB1234 | HYUNDAI CRETA | Petrol | Owner XYZ |
 *   Ins exp 15-Jan-2025 | PUC 20-Feb-2025
 *
 * Both colon- and pipe-separated variants show up. We normalise in
 * {@link labelledExtract} by scanning case-insensitive prefixes.
 */

import type { VehicleAdapter, VehicleFetchResult, VehicleRecord } from './types.js';

const ID = 'vahan.sms';
const VERSION = '1';

function toIsoDate(raw: string): string | undefined {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s || s === '--' || /^n\/?a$/i.test(s)) return undefined;
  // Already ISO.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY.
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const mm = dmy[2]!.padStart(2, '0');
    const dd = dmy[1]!.padStart(2, '0');
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) {
      return `${dmy[3]}-${mm}-${dd}`;
    }
  }
  // DD-MMM-YYYY (e.g. 15-Jan-2025).
  const alpha = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3})[-/\s](\d{4})$/);
  if (alpha) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mo = months[alpha[2]!.toLowerCase()];
    if (mo) return `${alpha[3]}-${mo}-${alpha[1]!.padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * Split the SMS body into labelled chunks. VAHAN SMS replies use either
 * `Label: value, Label: value` or `Label value | Label value` — both are
 * tokenisable by splitting on the delimiters and then by colon / first
 * space.
 */
function tokenise(body: string): Array<{ label: string; value: string }> {
  const parts = body
    .split(/[|,\n;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const tokens: Array<{ label: string; value: string }> = [];
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon > 0) {
      tokens.push({
        label: part.slice(0, colon).trim().toLowerCase(),
        value: part.slice(colon + 1).trim(),
      });
      continue;
    }
    // Space-separated: first word is the label alias, rest is value.
    // Only treat this as labelled if the first word is in our alias set;
    // otherwise skip — avoids mis-parsing free text.
    const firstSpace = part.indexOf(' ');
    if (firstSpace > 0) {
      const label = part.slice(0, firstSpace).trim().toLowerCase();
      tokens.push({ label, value: part.slice(firstSpace + 1).trim() });
    }
  }
  return tokens;
}

type Field = keyof Pick<
  VehicleRecord,
  | 'make'
  | 'model'
  | 'variant'
  | 'fuelType'
  | 'color'
  | 'chassisLast4'
  | 'ownerName'
  | 'insuranceExpiry'
  | 'pucExpiry'
  | 'fitnessExpiry'
  | 'roadTaxExpiry'
  | 'permitExpiry'
>;

const ALIASES: Record<Field, string[]> = {
  make: ['make', 'manufacturer', 'brand'],
  model: ['model', 'make/model'],
  variant: ['variant'],
  fuelType: ['fuel', 'fueltype', 'fuel type'],
  color: ['color', 'colour'],
  chassisLast4: ['chassis', 'chassis no', 'chassisno'],
  ownerName: ['owner', 'ownername', 'owner name', 'registered owner'],
  insuranceExpiry: [
    'insurance',
    'ins',
    'ins exp',
    'insurance expiry',
    'insurance valid till',
  ],
  pucExpiry: ['puc', 'puc valid till', 'puc expiry'],
  fitnessExpiry: ['fitness', 'fitness valid till', 'fitness upto'],
  roadTaxExpiry: ['tax', 'road tax', 'tax upto', 'roadtax'],
  permitExpiry: ['permit', 'permit upto', 'permit valid till'],
};

function labelledExtract(
  tokens: Array<{ label: string; value: string }>,
  field: Field,
): string | undefined {
  const aliases = ALIASES[field];
  for (const tok of tokens) {
    if (aliases.includes(tok.label)) {
      const v = tok.value.trim();
      if (!v || v === '--') return undefined;
      return v;
    }
  }
  return undefined;
}

function extractChassisLast4(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Chassis values come through as `...1234`, `XXXX1234`, or full
  // `MA3ABCD12345678`. We only store the last 4.
  const digits = raw.match(/([A-Z0-9]{4})\s*$/i);
  return digits?.[1]?.toUpperCase();
}

function extractMakeModel(
  tokens: Array<{ label: string; value: string }>,
): { make?: string; model?: string } {
  // Two common formats:
  //   Make: HONDA, Model: CITY
  //   Make/Model: HONDA CITY
  const makeAlone = labelledExtract(tokens, 'make');
  const modelAlone = labelledExtract(tokens, 'model');
  if (makeAlone && modelAlone && makeAlone !== modelAlone) {
    return { make: makeAlone.toUpperCase(), model: modelAlone.toUpperCase() };
  }
  const combined = makeAlone ?? modelAlone;
  if (!combined) return {};
  const parts = combined.trim().split(/\s+/);
  if (parts.length === 1) return { make: parts[0]!.toUpperCase() };
  return {
    make: parts[0]!.toUpperCase(),
    model: parts.slice(1).join(' ').toUpperCase(),
  };
}

function extractYear(body: string): number | undefined {
  // Prefer labelled — `MFG: 2019` or `Year: 2019` — before falling back
  // to a free scan (which would pick any 4-digit number).
  const tokens = tokenise(body);
  const labelled = tokens.find((t) => t.label === 'mfg' || t.label === 'year' || t.label === 'manufacturing');
  const raw = labelled?.value ?? '';
  const y = raw.match(/\b(19\d{2}|20\d{2})\b/);
  return y ? Number(y[1]) : undefined;
}

/**
 * Fallback scan for bare fuel-type tokens that appear without a `Fuel:`
 * label — common in pipe-delimited VAHAN SMS replies that list fuel as
 * a standalone token. Whitelist is tight to avoid grabbing random words.
 */
function extractBareFuel(body: string): string | undefined {
  const m = body.toUpperCase().match(/\b(PETROL|DIESEL|CNG|LPG|ELECTRIC|EV|HYBRID|HYDROGEN)\b/);
  return m?.[1];
}

export function parseVahanSms(regNo: string, body: string): VehicleFetchResult {
  const normalisedReg = regNo.replace(/\s+/g, '').toUpperCase();
  if (!normalisedReg) {
    return { ok: false, error: 'Registration number is required', retryable: false };
  }
  if (!body || body.trim().length < 10) {
    return {
      ok: false,
      error: 'SMS body is empty or too short to parse',
      retryable: false,
      rawPayload: body,
    };
  }

  const tokens = tokenise(body);

  // Sanity check: the SMS should mention the reg number somewhere.
  // Partial match tolerated (some SMS formats insert spaces).
  const upperBody = body.toUpperCase().replace(/\s+/g, '');
  if (!upperBody.includes(normalisedReg)) {
    return {
      ok: false,
      error: `SMS does not appear to reference ${normalisedReg}`,
      retryable: false,
      rawPayload: body,
    };
  }

  const { make, model } = extractMakeModel(tokens);
  const record: VehicleRecord = {
    registrationNo: normalisedReg,
    make,
    model,
    variant: labelledExtract(tokens, 'variant')?.toUpperCase(),
    fuelType: labelledExtract(tokens, 'fuelType')?.toUpperCase() ?? extractBareFuel(body),
    color: labelledExtract(tokens, 'color')?.toUpperCase(),
    chassisLast4: extractChassisLast4(labelledExtract(tokens, 'chassisLast4')),
    ownerName: labelledExtract(tokens, 'ownerName')?.toUpperCase(),
    manufacturingYear: extractYear(body),
    insuranceExpiry: toIsoDate(labelledExtract(tokens, 'insuranceExpiry') ?? ''),
    pucExpiry: toIsoDate(labelledExtract(tokens, 'pucExpiry') ?? ''),
    fitnessExpiry: toIsoDate(labelledExtract(tokens, 'fitnessExpiry') ?? ''),
    roadTaxExpiry: toIsoDate(labelledExtract(tokens, 'roadTaxExpiry') ?? ''),
    permitExpiry: toIsoDate(labelledExtract(tokens, 'permitExpiry') ?? ''),
    metadata: { source: 'sms', rawBody: body },
  };

  // Warn rather than fail when nothing survived parsing — the user at
  // least successfully supplied an RC number.
  const warnings: string[] = [];
  const extracted = Object.values(record).filter(
    (v) => v !== undefined && v !== null && v !== normalisedReg,
  ).length;
  if (extracted <= 1) {
    warnings.push(
      'SMS format not recognised. Only the registration number was saved — fill the rest manually.',
    );
  }

  return { ok: true, record, warnings };
}

export const smsVehicleAdapter: VehicleAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'VAHAN SMS',
  supportsAuto: false,
  async fetch(regNo, ctx) {
    if (!ctx.smsBody) {
      return {
        ok: false,
        error: 'SMS adapter requires smsBody in context',
        retryable: false,
      };
    }
    return parseVahanSms(regNo, ctx.smsBody);
  },
};
