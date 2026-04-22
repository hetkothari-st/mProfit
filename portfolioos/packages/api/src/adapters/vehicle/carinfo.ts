/**
 * CarInfo.app scraper — RC details + challan list.
 *
 * CarInfo (carinfo.app) is an Indian vehicle information portal that sources
 * data from the VAHAN/mParivahan government database. Their public pages
 * embed the full vehicle JSON inside Next.js's __NEXT_DATA__ script tag,
 * which is accessible via a plain HTTPS GET — no API key, no login, no CAPTCHA.
 *
 * Two page types handled:
 *   /rc-details/{REGNO}     → VehicleRecord
 *   /challan-details/{REGNO} → ChallanRow[]
 *
 * Robustness strategy:
 *   1. Try __NEXT_DATA__ (standard Next.js page router)
 *   2. Try JSON-LD / application/json script tags (app-router sites)
 *   3. Try regex extraction of window.__INITIAL_STATE__ or similar
 *   If none yield vehicle data → throw so chain falls through.
 *
 * Set CARINFO_DEBUG=true to log raw pageProps keys for debugging.
 */

import { logger } from '../../lib/logger.js';
import { parseChallanRow, type ChallanRow } from './challan.js';
import type {
  VehicleAdapter,
  VehicleFetchResult,
  VehicleRecord,
} from './types.js';

export const CARINFO_ADAPTER_ID = 'vahan.carinfo.scraper';
export const CARINFO_VERSION = '1';

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36';

const BASE = 'https://www.carinfo.app';

// ─── Next.js data extraction ──────────────────────────────────────────────────

interface NextData {
  props?: {
    pageProps?: Record<string, unknown>;
  };
}

function extractNextData(html: string): Record<string, unknown> | null {
  // Standard Next.js page-router __NEXT_DATA__ tag
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([^<]+)<\/script>/i);
  if (m) {
    try {
      const nd = JSON.parse(m[1]!) as NextData;
      if (nd.props?.pageProps) return nd.props.pageProps;
    } catch { /* fall through */ }
  }

  // App-router: look for large JSON blocks that contain vehicle-related keys
  const jsonBlocks = [...html.matchAll(/<script[^>]*>\s*(\{[^<]{200,})\s*<\/script>/gi)];
  for (const block of jsonBlocks) {
    try {
      const obj = JSON.parse(block[1]!) as Record<string, unknown>;
      if (obj['rcData'] || obj['vehicleData'] || obj['owner_name'] || obj['maker_desc']) return obj;
    } catch { /* continue */ }
  }

  return null;
}

function findVehicleObject(pageProps: Record<string, unknown>): Record<string, unknown> | null {
  // Common top-level keys CarInfo uses
  const candidates = [
    'rcData', 'vehicleData', 'rcDetails', 'data', 'vehicleDetails',
    'rcInfo', 'rcResult', 'vehicleInfo',
  ];
  for (const k of candidates) {
    const v = pageProps[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  // If pageProps itself looks like vehicle data
  if (pageProps['owner_name'] || pageProps['maker_desc'] || pageProps['reg_no']) return pageProps;
  return null;
}

function findChallanArray(pageProps: Record<string, unknown>): unknown[] | null {
  const candidates = [
    'challanData', 'challans', 'challanList', 'data', 'challanDetails',
    'pendingChallans', 'challanInfo',
  ];
  for (const k of candidates) {
    const v = pageProps[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = (v as Record<string, unknown>)['challans'] ?? (v as Record<string, unknown>)['data'];
      if (Array.isArray(inner)) return inner;
    }
  }
  return null;
}

// ─── VehicleRecord mapping ────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s || /^(NA|N\/A|null|undefined|-)$/i.test(s)) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2,'0')}-${dmy[1]!.padStart(2,'0')}`;
  const mdy = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1]}-${mdy[2]}`; // MM-DD-YYYY sometimes
  const dmon = s.match(/^(\d{1,2})[-\s.,]([A-Za-z]{3})[-\s.,](\d{4})$/);
  if (dmon) { const mon = MONTHS[dmon[2]!.toLowerCase()]; if (mon) return `${dmon[3]}-${mon}-${dmon[1]!.padStart(2,'0')}`; }
  return undefined;
}

function toYear(v: unknown): number | undefined {
  if (typeof v === 'number' && v >= 1900 && v <= 2100) return v;
  if (typeof v === 'string') { const m = v.match(/\b(19\d{2}|20\d{2})\b/); return m ? Number(m[1]) : undefined; }
  return undefined;
}

function get(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() && !/^(NA|N\/A|null|undefined|-)$/i.test(v.trim())) return v.trim();
  }
  return undefined;
}

function mapToVehicleRecord(raw: Record<string, unknown>, regNo: string): VehicleRecord {
  let make = get(raw,
    'maker_desc','make','manufacturer','vehicleMake','reg_maker_desc',
    'vehicle_manufacturer_name',
  );
  let model = get(raw,
    'model','vehicleModel','vchnum','vehicle_model','reg_vch_class_desc',
    'vehicle_class_desc',
  );
  // CarInfo often stores as "MARUTI SUZUKI" / "SWIFT VXI" or combined "MARUTI/SWIFT"
  const compound = get(raw, 'maker_model','makerModel','vehicle_class','vehicle_type');
  if (!make && !model && compound) {
    const slash = compound.indexOf('/');
    if (slash > 0) { make = compound.slice(0,slash).trim(); model = compound.slice(slash+1).trim(); }
    else make = compound;
  }

  const chassis = get(raw,
    'chassis_no','chassisNo','chassis','rcChassisNo','vehicle_chassis_number',
  );

  return {
    registrationNo: (get(raw,'reg_no','regNo','registration_no') ?? regNo).replace(/\s+/g,'').toUpperCase(),
    make: make?.toUpperCase(),
    model: model?.toUpperCase(),
    variant: get(raw,'variant','body_type','bodytype','vehicle_type_desc')?.toUpperCase(),
    manufacturingYear: toYear(
      raw['manufacturing_year'] ?? raw['mfg_year'] ?? raw['mfgYear'] ??
      raw['yearOfMfg'] ?? raw['mfg_month_yr'],
    ),
    fuelType: get(raw,'fuel_desc','fuelType','fuel','fuel_type','vehicle_fuel_type')?.toUpperCase(),
    color: get(raw,'color_desc','color','colour','vehicle_color','vehicle_colour')?.toUpperCase(),
    chassisLast4: chassis ? chassis.replace(/\s+/g,'').slice(-4).toUpperCase() : undefined,
    rtoCode: get(raw,'office_code','rtoCode','rto','rto_code','registering_authority'),
    ownerName: get(raw,
      'owner_name','ownerName','owner','vehicle_owner_name',
      'registered_owner_name','reg_owner_name',
    )?.toUpperCase(),
    insuranceExpiry: toIso(raw['insurance_upto'] ?? raw['insuranceExpiry'] ?? raw['insurance_valid_upto'] ?? raw['insExpiry'] ?? raw['insurance_expiry']),
    pucExpiry:      toIso(raw['pucc_upto'] ?? raw['pucExpiry'] ?? raw['pucc_validity_upto'] ?? raw['puc_valid_upto']),
    fitnessExpiry:  toIso(raw['fit_upto'] ?? raw['fitnessExpiry'] ?? raw['fitness_upto'] ?? raw['fitness_valid_upto']),
    roadTaxExpiry:  toIso(raw['tax_upto'] ?? raw['taxExpiry'] ?? raw['road_tax_upto'] ?? raw['roadTaxExpiry']),
    permitExpiry:   toIso(raw['permit_upto'] ?? raw['permitExpiry'] ?? raw['permit_valid_upto']),
    metadata: {
      raw,
      source: 'carinfo',
      // Extra fields CarInfo exposes that we surface in metadata
      registrationDate:  toIso(raw['reg_date'] ?? raw['registration_date'] ?? raw['regn_dt']),
      engineNo:          get(raw,'engine_no','engineNo','engine_number'),
      hypothecation:     get(raw,'hypothecation','hp_status','financier'),
      rcStatus:          get(raw,'rc_status','status','vehicle_status'),
      vehicleClass:      get(raw,'vehicle_class','vehicle_class_desc'),
      normsType:         get(raw,'norms_type','emission_norms','emission_standard'),
      seatingCapacity:   raw['seating_capacity'] != null ? Number(raw['seating_capacity']) : undefined,
    },
  };
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Referer': BASE,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status} fetching ${url}`);
  return res.text();
}

// ─── Public fetch functions ───────────────────────────────────────────────────

export async function fetchCarInfoRC(regNo: string): Promise<VehicleRecord> {
  const clean = regNo.replace(/\s+/g,'').toUpperCase();
  const url = `${BASE}/rc-details/${encodeURIComponent(clean)}`;
  const html = await fetchPage(url);

  const pageProps = extractNextData(html);
  if (!pageProps) throw new Error('CarInfo: could not find __NEXT_DATA__ or embedded JSON in RC page');

  if (process.env['CARINFO_DEBUG'] === 'true') {
    logger.debug({ url, keys: Object.keys(pageProps) }, '[carinfo] RC pageProps keys');
  }

  // Detect "vehicle not found" pages
  const notFound = pageProps['notFound'] === true || pageProps['error'] || pageProps['statusCode'] === 404;
  if (notFound) throw new Error(`CarInfo: vehicle ${clean} not found`);

  const vehicleObj = findVehicleObject(pageProps);
  if (!vehicleObj) throw new Error(`CarInfo: no vehicle object in pageProps (keys: ${Object.keys(pageProps).slice(0,10).join(', ')})`);

  const record = mapToVehicleRecord(vehicleObj, clean);
  if (!record.make && !record.ownerName && !record.fuelType) {
    throw new Error(`CarInfo: page loaded but no vehicle fields extracted (keys: ${Object.keys(vehicleObj).slice(0,10).join(', ')})`);
  }
  return record;
}

export async function fetchCarInfoChallans(regNo: string): Promise<ChallanRow[]> {
  const clean = regNo.replace(/\s+/g,'').toUpperCase();
  // CarInfo uses both /challan-details/ and /echallan/ — try both
  const urls = [
    `${BASE}/challan-details/${encodeURIComponent(clean)}`,
    `${BASE}/echallan/${encodeURIComponent(clean)}`,
  ];

  for (const url of urls) {
    try {
      const html = await fetchPage(url);
      const pageProps = extractNextData(html);
      if (!pageProps) continue;

      if (process.env['CARINFO_DEBUG'] === 'true') {
        logger.debug({ url, keys: Object.keys(pageProps) }, '[carinfo] challan pageProps keys');
      }

      const arr = findChallanArray(pageProps);
      if (!arr) continue;

      const challans: ChallanRow[] = [];
      for (const item of arr) {
        if (item && typeof item === 'object') {
          const normalised: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            normalised[k.toLowerCase()] = v;
          }
          const row = parseChallanRow(normalised);
          if (row) challans.push(row);
        }
      }
      return challans;
    } catch (err) {
      logger.warn({ err, url }, '[carinfo] challan URL failed, trying next');
    }
  }
  return []; // No challans found (or page has zero challans — both valid)
}

// ─── VehicleAdapter interface ─────────────────────────────────────────────────

export const carinfoAdapter: VehicleAdapter = {
  id: CARINFO_ADAPTER_ID,
  version: CARINFO_VERSION,
  displayName: 'CarInfo.app',
  supportsAuto: true,

  async fetch(regNo): Promise<VehicleFetchResult> {
    try {
      const record = await fetchCarInfoRC(regNo);
      return { ok: true, record };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, regNo }, '[carinfo] RC fetch failed');
      return { ok: false, error: msg, retryable: !msg.startsWith('CarInfo: vehicle') };
    }
  },
};
