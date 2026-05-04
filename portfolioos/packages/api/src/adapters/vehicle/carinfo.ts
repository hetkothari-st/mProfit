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

export function extractNextData(html: string): Record<string, unknown> | null {
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

// HTML tag names — if obj keys are mostly these, it's an HTML parse, not data
const HTML_KEYS = new Set(['title','div','span','a','body','html','head','marquee','h1','h2','h3','p','ul','li','table','tr','td','th','form','input','button','script','style','header','footer','nav','section','article','main']);

/**
 * Exact known vehicle-data keys from VAHAN / CarInfo / mParivahan responses.
 * Using exact key names avoids false positives from unrelated keys that happen
 * to contain short substrings like "color" (e.g. "customBackgroundColor").
 * At least 2 must be present to consider the object vehicle-shaped.
 */
const VEHICLE_DATA_KEYS = new Set([
  // Owner / registration
  'owner_name','ownerName','owner','registered_owner_name','reg_owner_name','vehicle_owner_name',
  'reg_no','regNo','registration_no','regnNo','vehicleRegNo',
  // Make / model
  'maker_desc','make','manufacturer','mfr_name','makerDesc',
  'model','vehicleModel','vehicle_model','model_name','vchnum',
  'maker_model','makerModel',
  // Fuel / color / chassis
  'fuel_desc','fuelType','fuel_type','vehicle_fuel_type','fuel',
  'color_desc','colour','color','vehicle_color','vehicle_colour','color_code',
  'chassis_no','chassisNo','chassis','chasisNo','vehicle_chassis_number',
  // Expiry dates
  'insurance_upto','insuranceExpiry','insExpiry','insurance_valid_upto','insurance_expiry',
  'pucc_upto','pucExpiry','pucc_validity_upto','puc_valid_upto',
  'fit_upto','fitnessExpiry','fitness_upto','fitness_valid_upto','fit_valid_upto',
  'tax_upto','taxExpiry','road_tax_upto','roadTaxExpiry','tax_valid_upto',
  'permit_upto','permitExpiry','permit_valid_upto',
  // Other RC fields
  'mfg_year','mfgYear','manufacturingYear','yearOfMfg','manufacturing_year','mfg_month_yr',
  'rto_code','rtoCode','office_code','registering_authority',
  'engine_no','engineNo','engine_number',
  'rc_status','vehicle_status','registration_status',
  'body_type','bodytype','vehicle_class','vehicle_class_desc',
  'hypothecation','hp_status','financier',
  'norms_type','emission_norms','emission_standard',
  'seating_capacity','seatingCapacity',
  'reg_date','registration_date','regn_dt',
]);

function looksLikeVehicleObj(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  // Reject HTML-shaped objects
  const lowerKeys = keys.map(k => k.toLowerCase());
  const htmlCount = lowerKeys.filter(k => HTML_KEYS.has(k)).length;
  if (htmlCount >= 3) return false;
  // Need at least 2 exact known vehicle-data keys
  const exactMatches = keys.filter(k => VEHICLE_DATA_KEYS.has(k)).length;
  return exactMatches >= 2;
}

/**
 * Recursively searches an object for a sub-object that looks like vehicle data.
 * Depth-limited to 4 levels to avoid runaway recursion on large state trees.
 */
export function findVehicleObject(obj: Record<string, unknown>, depth = 0): Record<string, unknown> | null {
  if (depth > 4) return null;

  // Direct match
  if (depth > 0 && looksLikeVehicleObj(obj)) return obj;

  // Priority keys to check first (most likely carriers of RC data)
  const priorityKeys = [
    'rc', 'rcData', 'vehicleData', 'rcDetails', 'vehicleDetails',
    'rcInfo', 'rcResult', 'vehicleInfo', 'xdataprops',
    'data', 'result', 'details', 'vehicle',
  ];
  for (const k of priorityKeys) {
    const v = obj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const child = v as Record<string, unknown>;
      if (looksLikeVehicleObj(child)) return child;
      const deeper = findVehicleObject(child, depth + 1);
      if (deeper) return deeper;
    }
  }

  // loaderData — Remix framework: all route loaders' return values keyed by route id
  // e.g. { loaderData: { "routes/rc-details.$reg": { rc: {...} } } }
  const loaderData = obj['loaderData'];
  if (loaderData && typeof loaderData === 'object' && !Array.isArray(loaderData)) {
    const ld = loaderData as Record<string, unknown>;
    // If loaderData itself is a flat vehicle data dict, return it directly
    if (looksLikeVehicleObj(ld)) return ld;
    // Otherwise treat as Remix route map: each value is a route's loader return
    for (const routeVal of Object.values(ld)) {
      if (routeVal && typeof routeVal === 'object' && !Array.isArray(routeVal)) {
        const found = findVehicleObject(routeVal as Record<string, unknown>, depth + 1);
        if (found) return found;
      }
    }
  }

  // initialState — Redux / Zustand: {someReducer: {rcData: {...}}}
  const initialState = obj['initialState'];
  if (initialState && typeof initialState === 'object' && !Array.isArray(initialState)) {
    for (const reducerVal of Object.values(initialState as Record<string, unknown>)) {
      if (reducerVal && typeof reducerVal === 'object' && !Array.isArray(reducerVal)) {
        const found = findVehicleObject(reducerVal as Record<string, unknown>, depth + 1);
        if (found) return found;
      }
    }
  }

  // Sweep all remaining keys at this level
  for (const [k, v] of Object.entries(obj)) {
    if (priorityKeys.includes(k) || k === 'loaderData' || k === 'initialState') continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const child = v as Record<string, unknown>;
      if (looksLikeVehicleObj(child)) return child;
    }
  }

  return null;
}

function findChallanArray(pageProps: Record<string, unknown>): unknown[] | null {
  const candidates = [
    'challanData', 'challans', 'challanList', 'data', 'challanDetails',
    'pendingChallans', 'challanInfo',
  ];
  const searchIn = (obj: Record<string, unknown>): unknown[] | null => {
    for (const k of candidates) {
      const v = obj[k];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const inner = (v as Record<string,unknown>)['challans'] ?? (v as Record<string,unknown>)['data'];
        if (Array.isArray(inner)) return inner;
      }
    }
    return null;
  };

  const direct = searchIn(pageProps);
  if (direct) return direct;

  // Search inside loaderData (Remix)
  const ld = pageProps['loaderData'];
  if (ld && typeof ld === 'object' && !Array.isArray(ld)) {
    for (const routeVal of Object.values(ld as Record<string,unknown>)) {
      if (routeVal && typeof routeVal === 'object' && !Array.isArray(routeVal)) {
        const found = searchIn(routeVal as Record<string,unknown>);
        if (found) return found;
      }
    }
  }

  // Search inside initialState
  const is = pageProps['initialState'];
  if (is && typeof is === 'object' && !Array.isArray(is)) {
    for (const reducerVal of Object.values(is as Record<string,unknown>)) {
      if (reducerVal && typeof reducerVal === 'object' && !Array.isArray(reducerVal)) {
        const found = searchIn(reducerVal as Record<string,unknown>);
        if (found) return found;
      }
    }
  }

  return null;
}

// ─── VehicleRecord mapping ────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

export function toIso(v: unknown): string | undefined {
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

export function toYear(v: unknown): number | undefined {
  if (typeof v === 'number' && v >= 1900 && v <= 2100) return v;
  if (typeof v === 'string') { const m = v.match(/\b(19\d{2}|20\d{2})\b/); return m ? Number(m[1]) : undefined; }
  return undefined;
}

export function get(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim() && !/^(NA|N\/A|null|undefined|-)$/i.test(v.trim())) return v.trim();
  }
  return undefined;
}

export function mapToVehicleRecord(raw: Record<string, unknown>, regNo: string): VehicleRecord {
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
    // ── Promoted to top-level: surfaced in dashboard, also written to columns ──
    rcStatus:         get(raw,'rc_status','status','vehicle_status','registration_status')?.toUpperCase(),
    vehicleClass:     get(raw,'vehicle_class','vehicle_class_desc')?.toUpperCase(),
    normsType:        get(raw,'norms_type','emission_norms','emission_standard')?.toUpperCase(),
    seatingCapacity:  raw['seating_capacity'] != null && !Number.isNaN(Number(raw['seating_capacity'])) ? Number(raw['seating_capacity']) : undefined,
    unloadedWeight:   raw['unladen_weight'] != null && !Number.isNaN(Number(raw['unladen_weight'])) ? Number(raw['unladen_weight'])
                       : raw['ulw'] != null && !Number.isNaN(Number(raw['ulw'])) ? Number(raw['ulw'])
                       : raw['unloaded_weight'] != null && !Number.isNaN(Number(raw['unloaded_weight'])) ? Number(raw['unloaded_weight']) : undefined,
    engineNo:         get(raw,'engine_no','engineNo','engine_number'),
    hypothecation:    get(raw,'hypothecation','hp_status','financier','financer'),
    registrationDate: toIso(raw['reg_date'] ?? raw['registration_date'] ?? raw['regn_dt']),
    metadata: { raw, source: 'carinfo' },
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
