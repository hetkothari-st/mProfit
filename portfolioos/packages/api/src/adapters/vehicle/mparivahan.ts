/**
 * §7.2 mParivahan API adapter — Gate G6 cleared by user on 2026-04-22.
 *
 * Tries three endpoints in order; each returns a flat key→value object
 * which parseMparivahanPayload converts into a VehicleRecord.
 *
 * Endpoint chain:
 *  1. VAHAN RC-details JSON  (vahanservice, JSON-first)
 *  2. VAHAN unregistered auth (vahanservice, returns XML — parsed inline)
 *  3. mParivahan app RC endpoint (may be IP-blocked outside mobile networks)
 *
 * Dev: fixture fast-path fires when the reg no is in dev.json so tests
 *      never hit the network.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { logger } from '../../lib/logger.js';
import type {
  VehicleAdapter,
  VehicleFetchResult,
  VehicleRecord,
} from './types.js';

const ID = 'vahan.mparivahan.api';
const VERSION = '3';

const BUILTIN_FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'dev.json',
);

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';

// ─── XML helper ──────────────────────────────────────────────────────────────

/**
 * Flat XML-to-object extractor. Handles predictable single-depth XML like
 * what vahan.parivahan.gov.in returns. Does not need an XML parser package.
 */
function xmlToFlat(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Match <tag>value</tag> — non-greedy, skips nested elements (uses innerText
  // approach: last text content wins for nested tags which is fine here).
  const re = /<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = m[2]!.trim();
    if (v) out[m[1]!] = v;
  }
  return out;
}

// ─── payload parser ───────────────────────────────────────────────────────────

export function parseMparivahanPayload(payload: unknown, regNo: string): VehicleRecord {
  const raw = (payload ?? {}) as Record<string, unknown>;
  // Unwrap common wrapper keys
  const p: Record<string, unknown> =
    (raw['vehicleData'] && typeof raw['vehicleData'] === 'object'
      ? raw['vehicleData']
      : raw['rcVehicleData'] && typeof raw['rcVehicleData'] === 'object'
        ? raw['rcVehicleData']
        : raw['result'] && typeof raw['result'] === 'object'
          ? raw['result']
          : raw) as Record<string, unknown>;

  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === 'string' && v.trim() && v.trim().toUpperCase() !== 'NA') return v.trim();
    }
    return undefined;
  };
  const toYear = (v: unknown): number | undefined => {
    if (typeof v === 'number' && v >= 1900 && v <= 2100) return v;
    if (typeof v === 'string') {
      const m = v.match(/\b(19\d{2}|20\d{2})\b/);
      return m ? Number(m[1]) : undefined;
    }
    return undefined;
  };
  const toIso = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const s = v.trim();
    if (!s || /^(NA|N\/A|-)$/i.test(s)) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2,'0')}-${dmy[1]!.padStart(2,'0')}`;
    const ymd = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    // "31 Jan 2026" / "31-Jan-2026"
    const MONTHS: Record<string, string> = {
      jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
      jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
    };
    const dmon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
    if (dmon) {
      const mon = MONTHS[dmon[2]!.toLowerCase()];
      if (mon) return `${dmon[3]}-${mon}-${dmon[1]!.padStart(2,'0')}`;
    }
    return undefined;
  };

  let make = get('make','maker_desc','maker','makerDesc','vehicleMake','reg_maker_desc');
  let model = get('model','vehicleModel','vchnum','reg_vch_class_desc','vehicleClass');
  // "MARUTI SUZUKI/SWIFT VXI" compound field
  const compound = get('maker_model','makerModel','reg_maker_model');
  if (!make && !model && compound) {
    const slash = compound.indexOf('/');
    if (slash > 0) {
      make = compound.slice(0, slash).trim().toUpperCase();
      model = compound.slice(slash + 1).trim().toUpperCase();
    } else {
      make = compound.toUpperCase();
    }
  }

  const chassis = get('chassisNo','chassis','chasisNo','chassisno','reg_chassis_no','rcChassisNo');
  return {
    registrationNo: regNo.replace(/\s+/g,'').toUpperCase(),
    make: make?.toUpperCase(),
    model: model?.toUpperCase(),
    variant: get('variant','reg_vch_class')?.toUpperCase(),
    manufacturingYear: toYear(
      p['mfgYear'] ?? p['manufacturingYear'] ?? p['yearOfMfg'] ??
      p['manufacturing_year'] ?? p['reg_manufacturing_year'] ?? p['mfg_month_yr'],
    ),
    fuelType: get('fuelType','fuel','fuel_desc','reg_fuel_desc','rcFuelDesc')?.toUpperCase(),
    color:    get('color','colour','vehicleColor','vehicle_color','reg_color_desc','rcColorDesc')?.toUpperCase(),
    chassisLast4: chassis ? chassis.replace(/\s+/g,'').slice(-4).toUpperCase() : undefined,
    rtoCode:  get('rtoCode','rto','rto_code','reg_office_code','rcOfficeCode'),
    ownerName: get('ownerName','owner','owner_name','reg_owner_name','rcOwnerName')?.toUpperCase(),
    insuranceExpiry: toIso(p['insuranceExpiry'] ?? p['insExpiry'] ?? p['insuranceUpto'] ??
      p['insurance_upto'] ?? p['reg_insurance_upto'] ?? p['rcInsuranceUpto']),
    pucExpiry:      toIso(p['pucExpiry'] ?? p['pucUpto'] ?? p['pucc_upto'] ??
      p['reg_pucc_upto'] ?? p['rcPuccUpto']),
    fitnessExpiry:  toIso(p['fitnessExpiry'] ?? p['fitnessUpto'] ?? p['fit_upto'] ??
      p['reg_fit_upto'] ?? p['rcFitUpto']),
    roadTaxExpiry:  toIso(p['taxExpiry'] ?? p['taxUpto'] ?? p['roadTaxUpto'] ??
      p['tax_upto'] ?? p['reg_tax_upto'] ?? p['rcTaxUpto']),
    permitExpiry:   toIso(p['permitExpiry'] ?? p['permitUpto'] ?? p['permit_upto'] ??
      p['reg_permit_upto'] ?? p['rcPermitUpto']),
    metadata: { raw: p, source: 'mparivahan' },
  };
}

// ─── fixture fast-path ────────────────────────────────────────────────────────

function tryFixture(regNo: string): unknown | null {
  const path = process.env['MPARIVAHAN_FIXTURE_PATH'] ?? BUILTIN_FIXTURE_PATH;
  if (!existsSync(path)) return null;
  try {
    const all = JSON.parse(readFileSync(path,'utf-8')) as Record<string,unknown>;
    return all[regNo.toUpperCase()] ?? null;
  } catch { return null; }
}

// ─── endpoint helpers ─────────────────────────────────────────────────────────

async function postForm(
  url: string,
  fields: Record<string,string>,
  extraHeaders: Record<string,string> = {},
): Promise<{ text: string; ct: string }> {
  const body = new URLSearchParams(fields);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}: ${url}`);
  const text = await res.text();
  return { text, ct: res.headers.get('content-type') ?? '' };
}

function tryParseBody(text: string, url: string): Record<string,unknown> {
  const t = text.trimStart();
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      return JSON.parse(text) as Record<string,unknown>;
    } catch (e) {
      throw new Error(`API_CHANGED: bad JSON from ${url}: ${e}`);
    }
  }
  if (t.startsWith('<')) {
    const flat = xmlToFlat(text);
    if (Object.keys(flat).length === 0) {
      throw new Error(`API_CHANGED: empty XML from ${url}: ${text.slice(0,200)}`);
    }
    return flat;
  }
  throw new Error(`API_CHANGED: unrecognised body from ${url}: ${text.slice(0,200)}`);
}

/** Detect a "not found / invalid" response vs actual data */
function isNotFound(obj: Record<string,unknown>): boolean {
  const msg = String(obj['msg'] ?? obj['message'] ?? obj['status'] ?? obj['error'] ?? '').toUpperCase();
  return /INVALID|NOT FOUND|NO RECORD|NO DATA|FAILURE/.test(msg) && !obj['make'] && !obj['maker_desc'] && !obj['vehicleData'];
}

// ─── three-endpoint chain ─────────────────────────────────────────────────────

/**
 * Endpoint 1 — VAHAN RC-details service (returns JSON or XML, handles both).
 * This is the most stable government endpoint.
 */
async function tryVahanRcDetails(regNo: string): Promise<Record<string,unknown>> {
  const { text } = await postForm(
    'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/loginManager/rcDetails.do',
    { regNo, regnNo: regNo },
    {
      'Referer': 'https://vahan.parivahan.gov.in/vahanservice/',
      'Origin': 'https://vahan.parivahan.gov.in',
    },
  );
  return tryParseBody(text, 'rcDetails');
}

/**
 * Endpoint 2 — VAHAN unregistered-auth service (returns XML typically).
 */
async function tryVahanUnregistered(regNo: string): Promise<Record<string,unknown>> {
  const { text } = await postForm(
    'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/loginManager/unRegistered/getAuthReg.do',
    { reg_no: regNo, regNo },
    {
      'Referer': 'https://vahan.parivahan.gov.in/vahanservice/',
      'Origin': 'https://vahan.parivahan.gov.in',
    },
  );
  return tryParseBody(text, 'unregistered');
}

/**
 * Endpoint 3 — mParivahan Android app RC-status endpoint.
 * May be IP-restricted to mobile/BSNL networks.
 */
async function tryMparivahanApp(regNo: string): Promise<Record<string,unknown>> {
  const { text } = await postForm(
    'https://app.parivahan.gov.in/RCStatus/checkrcstatusaction/getRCDetail.do',
    { reg_no: regNo },
    {
      'Origin': 'https://app.parivahan.gov.in',
      'Referer': 'https://app.parivahan.gov.in/RCStatus/',
    },
  );
  return tryParseBody(text, 'mparivahan-app');
}

// ─── adapter ──────────────────────────────────────────────────────────────────

export const mparivahanAdapter: VehicleAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'mParivahan / VAHAN API',
  supportsAuto: true,

  async fetch(regNo): Promise<VehicleFetchResult> {
    const clean = regNo.replace(/\s+/g,'').toUpperCase();

    // Fixture fast-path
    const hit = tryFixture(clean);
    if (hit !== null) {
      logger.debug({ regNo: clean }, '[vahan.mparivahan] fixture hit');
      return { ok: true, record: parseMparivahanPayload(hit, clean) };
    }

    const attempts: Array<[string, () => Promise<Record<string,unknown>>]> = [
      ['rcDetails',     () => tryVahanRcDetails(clean)],
      ['unregistered',  () => tryVahanUnregistered(clean)],
      ['mparivahan-app',() => tryMparivahanApp(clean)],
    ];

    const errors: string[] = [];
    for (const [name, fn] of attempts) {
      try {
        const obj = await fn();
        if (isNotFound(obj)) {
          return { ok: false, error: `Vehicle ${clean} not found in government records`, retryable: false };
        }
        const record = parseMparivahanPayload(obj, clean);
        // Require at least make or owner to be present — otherwise the API
        // returned data but it's empty/garbage.
        if (!record.make && !record.ownerName && !record.fuelType) {
          errors.push(`${name}: response parsed but no vehicle fields extracted`);
          continue;
        }
        logger.info({ regNo: clean, endpoint: name }, '[vahan.mparivahan] OK');
        return { ok: true, record };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err: msg, regNo: clean, endpoint: name }, `[vahan.mparivahan] ${name} failed`);
        // API_CHANGED → stop trying this adapter entirely
        if (msg.startsWith('API_CHANGED')) {
          return { ok: false, error: msg, retryable: false, rawPayload: null };
        }
        errors.push(`${name}: ${msg}`);
      }
    }

    return {
      ok: false,
      error: `All endpoints failed — ${errors.join(' · ')}`,
      retryable: true,
      rawPayload: null,
    };
  },
};
