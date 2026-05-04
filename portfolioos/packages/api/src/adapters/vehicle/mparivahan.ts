/**
 * §7.2 mParivahan / VAHAN adapter — Gate G6 cleared 2026-04-22.
 *
 * Endpoint chain (tried in order, first success wins):
 *  1. VAHAN citizen RC service  — session-primed JSON/XML
 *  2. VAHAN vahanservice rcDetails — session-primed JSON/XML
 *  3. mParivahan Android app endpoint — may be IP-restricted
 *
 * All VAHAN service endpoints require a JSESSIONID cookie from the
 * portal home page before they return data (otherwise they echo back
 * a session-expired XML shell with no vehicle fields).
 *
 * Set VAHAN_DEBUG=true to log raw response bodies when extraction fails.
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
const VERSION = '4';

const BUILTIN_FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'dev.json',
);

const UA =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B Build/SP1A.210812.016) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36';

// ─── XML helper ──────────────────────────────────────────────────────────────

function xmlToFlat(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z_][A-Za-z0-9_.-]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = m[2]!.trim();
    if (v) out[m[1]!] = v;
  }
  return out;
}

// ─── parser ───────────────────────────────────────────────────────────────────

export function parseMparivahanPayload(payload: unknown, regNo: string): VehicleRecord {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const unwrapKeys = ['vehicleData', 'rcVehicleData', 'result', 'data', 'rcData', 'rcDetails'];
  let p: Record<string, unknown> = raw;
  for (const k of unwrapKeys) {
    if (raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k])) {
      p = raw[k] as Record<string, unknown>;
      break;
    }
  }

  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === 'string' && v.trim() && !/^(NA|N\/A|-)$/i.test(v.trim())) return v.trim();
    }
    return undefined;
  };
  const toYear = (v: unknown): number | undefined => {
    if (typeof v === 'number' && v >= 1900 && v <= 2100) return v;
    if (typeof v === 'string') { const m = v.match(/\b(19\d{2}|20\d{2})\b/); return m ? Number(m[1]) : undefined; }
    return undefined;
  };
  const MONTHS: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
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
    const dmon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s,.](\d{4})$/);
    if (dmon) { const mon = MONTHS[dmon[2]!.toLowerCase()]; if (mon) return `${dmon[3]}-${mon}-${dmon[1]!.padStart(2,'0')}`; }
    return undefined;
  };

  let make = get('make','maker_desc','maker','makerDesc','vehicleMake','reg_maker_desc','mfr_name');
  let model = get('model','vehicleModel','vchnum','reg_vch_class_desc','vehicleClass','model_name');
  const compound = get('maker_model','makerModel','reg_maker_model','vehicle_class');
  if (!make && !model && compound) {
    const slash = compound.indexOf('/');
    if (slash > 0) { make = compound.slice(0,slash).trim().toUpperCase(); model = compound.slice(slash+1).trim().toUpperCase(); }
    else { make = compound.toUpperCase(); }
  }

  const chassis = get('chassisNo','chassis','chasisNo','chassisno','reg_chassis_no','rcChassisNo','chassis_no');
  return {
    registrationNo: regNo.replace(/\s+/g,'').toUpperCase(),
    make:  make?.toUpperCase(),
    model: model?.toUpperCase(),
    variant: get('variant','reg_vch_class','bodytype')?.toUpperCase(),
    manufacturingYear: toYear(p['mfgYear']??p['manufacturingYear']??p['yearOfMfg']??p['manufacturing_year']??p['reg_manufacturing_year']??p['mfg_month_yr']??p['mfd_year']),
    fuelType: get('fuelType','fuel','fuel_desc','reg_fuel_desc','rcFuelDesc','fuel_type')?.toUpperCase(),
    color:    get('color','colour','vehicleColor','vehicle_color','reg_color_desc','rcColorDesc','color_desc')?.toUpperCase(),
    chassisLast4: chassis ? chassis.replace(/\s+/g,'').slice(-4).toUpperCase() : undefined,
    rtoCode:  get('rtoCode','rto','rto_code','reg_office_code','rcOfficeCode','office_code'),
    ownerName: get('ownerName','owner','owner_name','reg_owner_name','rcOwnerName','owner_full_name')?.toUpperCase(),
    insuranceExpiry: toIso(p['insuranceExpiry']??p['insExpiry']??p['insuranceUpto']??p['insurance_upto']??p['reg_insurance_upto']??p['rcInsuranceUpto']??p['insurance_expiry']),
    pucExpiry:       toIso(p['pucExpiry']??p['pucUpto']??p['pucc_upto']??p['reg_pucc_upto']??p['rcPuccUpto']??p['pucc_validity_upto']),
    fitnessExpiry:   toIso(p['fitnessExpiry']??p['fitnessUpto']??p['fit_upto']??p['reg_fit_upto']??p['rcFitUpto']??p['fit_valid_upto']),
    roadTaxExpiry:   toIso(p['taxExpiry']??p['taxUpto']??p['roadTaxUpto']??p['tax_upto']??p['reg_tax_upto']??p['rcTaxUpto']??p['tax_valid_upto']),
    permitExpiry:    toIso(p['permitExpiry']??p['permitUpto']??p['permit_upto']??p['reg_permit_upto']??p['rcPermitUpto']),
    // ── Promoted fields (surfaced in dashboard) ──
    rcStatus:         get('rc_status','status','vehicle_status','registration_status','rcStatus')?.toUpperCase(),
    vehicleClass:     get('vehicle_class','vehicle_class_desc','vehicleClass','rcVchClassDesc','reg_vch_class_desc')?.toUpperCase(),
    normsType:        get('norms_type','emission_norms','emission_standard','normsType','rcNormsDesc')?.toUpperCase(),
    seatingCapacity:  p['seating_capacity'] != null && !Number.isNaN(Number(p['seating_capacity'])) ? Number(p['seating_capacity'])
                       : p['seatingCapacity'] != null && !Number.isNaN(Number(p['seatingCapacity'])) ? Number(p['seatingCapacity']) : undefined,
    unloadedWeight:   p['unladen_weight'] != null && !Number.isNaN(Number(p['unladen_weight'])) ? Number(p['unladen_weight'])
                       : p['ulw'] != null && !Number.isNaN(Number(p['ulw'])) ? Number(p['ulw'])
                       : p['unloadedWeight'] != null && !Number.isNaN(Number(p['unloadedWeight'])) ? Number(p['unloadedWeight']) : undefined,
    engineNo:         get('engine_no','engineNo','engine_number','rcEngineNo','reg_engine_no'),
    hypothecation:    get('hypothecation','hp_status','financier','financer','rcFinancier','reg_financier'),
    registrationDate: toIso(p['reg_date'] ?? p['registration_date'] ?? p['regn_dt'] ?? p['rcRegnDt'] ?? p['regDate']),
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

// ─── session establishment ────────────────────────────────────────────────────

interface Session { cookie: string }

async function primeCitizenSession(): Promise<Session | null> {
  try {
    const res = await fetch(
      'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/citizenVahanService/citizenRcDetails.xhtml',
      { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(8_000) },
    );
    const sc = res.headers.get('set-cookie') ?? '';
    const m = sc.match(/JSESSIONID=([^;,\s]+)/i);
    return m ? { cookie: `JSESSIONID=${m[1]}` } : null;
  } catch { return null; }
}

async function primeVahanSession(): Promise<Session | null> {
  try {
    const res = await fetch(
      'https://vahan.parivahan.gov.in/vahanservice/',
      { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(8_000) },
    );
    const sc = res.headers.get('set-cookie') ?? '';
    const m = sc.match(/JSESSIONID=([^;,\s]+)/i);
    return m ? { cookie: `JSESSIONID=${m[1]}` } : null;
  } catch { return null; }
}

// ─── response body handling ───────────────────────────────────────────────────

// HTML structural tag names — 3+ of these in the flat map = HTML page, not data
const HTML_TAG_SET = new Set([
  'title','div','span','a','body','html','head','marquee',
  'h1','h2','h3','p','ul','li','table','tr','td','th',
  'form','input','button','script','style','header','footer',
  'nav','section','article','main','meta','link','noscript',
]);

function tryParseBody(text: string, label: string): Record<string,unknown> {
  const t = text.trimStart();
  let obj: Record<string,unknown>;

  // Reject HTML up-front (<!DOCTYPE or <html> opener)
  if (/^<!DOCTYPE\s/i.test(t) || /^<html[\s>]/i.test(t)) {
    throw new Error(`API_CHANGED: ${label} returned an HTML page (maintenance/login), not vehicle data`);
  }

  if (t.startsWith('{') || t.startsWith('[')) {
    try { obj = JSON.parse(text) as Record<string,unknown>; }
    catch (e) { throw new Error(`API_CHANGED: bad JSON from ${label}: ${e}`); }
  } else if (t.startsWith('<')) {
    const flat = xmlToFlat(text);
    if (Object.keys(flat).length === 0) throw new Error(`API_CHANGED: empty XML from ${label}: ${text.slice(0,200)}`);

    // Detect HTML parsed-as-XML: if ≥3 keys are common HTML tag names, it's a page not data
    const htmlKeyCount = Object.keys(flat).filter(k => HTML_TAG_SET.has(k.toLowerCase())).length;
    if (htmlKeyCount >= 3) {
      throw new Error(`API_CHANGED: ${label} returned HTML (keys include: ${Object.keys(flat).slice(0,8).join(', ')})`);
    }
    obj = flat;
  } else {
    throw new Error(`API_CHANGED: unrecognised body from ${label}: ${text.slice(0,200)}`);
  }

  if (process.env['VAHAN_DEBUG'] === 'true') {
    logger.debug({ label, keys: Object.keys(obj), snippet: text.slice(0,300) }, '[vahan] raw response');
  }
  return obj;
}

function looksLikeVehicleData(obj: Record<string,unknown>): boolean {
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  const vehicleKeys = [
    'make','maker','model','fuel','fueltype','owner','ownername','rto','chassis',
    'color','colour','insurance','pucc','fitness','tax','permit','mfg','manufacturer',
    'vehicle','registration','regno','reg_no',
  ];
  return vehicleKeys.some(vk => keys.some(k => k.includes(vk)));
}

function isErrorResponse(obj: Record<string,unknown>): string | null {
  const errorKeys = ['errormsg','error','message','msg','errMsg','errorMessage','status'];
  for (const k of errorKeys) {
    const v = String(obj[k] ?? obj[k.toLowerCase()] ?? '').trim();
    if (v && /session|expired|invalid|login|unauthori|access.denied|not.found|failure/i.test(v)) {
      return v;
    }
  }
  return null;
}

// ─── endpoints ───────────────────────────────────────────────────────────────

async function postForm(
  url: string,
  fields: Record<string,string>,
  extraHeaders: Record<string,string> = {},
): Promise<string> {
  const body = new URLSearchParams(fields);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/xml, */*; q=0.01',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status} from ${url}`);
  return res.text();
}

async function getUrl(
  url: string,
  extraHeaders: Record<string,string> = {},
): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/xml, */*; q=0.01',
      'User-Agent': UA,
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP_${res.status} from ${url}`);
  return res.text();
}

interface Attempt {
  name: string;
  run: () => Promise<Record<string,unknown>>;
}

function buildAttempts(regNo: string, vahanSess: Session | null, citizenSess: Session | null): Attempt[] {
  const vs: Record<string, string> = vahanSess ? { 'Cookie': vahanSess.cookie } : {};
  const cs: Record<string, string> = citizenSess ? { 'Cookie': citizenSess.cookie } : {};
  return [
    // 1. Citizen RC service (GET, session-primed)
    {
      name: 'citizen-get',
      run: async () => {
        const text = await getUrl(
          `https://vahan.parivahan.gov.in/vahanservice/vahan/ui/citizenVahanService/getCitizenRCDetails.do?regNo=${encodeURIComponent(regNo)}`,
          { 'Referer': 'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/citizenVahanService/citizenRcDetails.xhtml', ...cs },
        );
        return tryParseBody(text, 'citizen-get');
      },
    },
    // 2. Citizen RC service (POST, session-primed)
    {
      name: 'citizen-post',
      run: async () => {
        const text = await postForm(
          'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/citizenVahanService/getCitizenRCDetails.do',
          { regNo, regnNo: regNo },
          { 'Referer': 'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/citizenVahanService/citizenRcDetails.xhtml', ...cs },
        );
        return tryParseBody(text, 'citizen-post');
      },
    },
    // 3. VAHAN rcDetails (session-primed)
    {
      name: 'rcDetails',
      run: async () => {
        const text = await postForm(
          'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/loginManager/rcDetails.do',
          { regNo, regnNo: regNo },
          { 'Referer': 'https://vahan.parivahan.gov.in/vahanservice/', 'Origin': 'https://vahan.parivahan.gov.in', ...vs },
        );
        return tryParseBody(text, 'rcDetails');
      },
    },
    // 4. VAHAN unregistered (session-primed)
    {
      name: 'unregistered',
      run: async () => {
        const text = await postForm(
          'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/loginManager/unRegistered/getAuthReg.do',
          { reg_no: regNo, regNo },
          { 'Referer': 'https://vahan.parivahan.gov.in/vahanservice/', 'Origin': 'https://vahan.parivahan.gov.in', ...vs },
        );
        return tryParseBody(text, 'unregistered');
      },
    },
    // 5. mParivahan Android app (may be IP-gated to mobile networks)
    {
      name: 'mparivahan-app',
      run: async () => {
        const text = await postForm(
          'https://app.parivahan.gov.in/RCStatus/checkrcstatusaction/getRCDetail.do',
          { reg_no: regNo },
          { 'Origin': 'https://app.parivahan.gov.in', 'Referer': 'https://app.parivahan.gov.in/RCStatus/' },
        );
        return tryParseBody(text, 'mparivahan-app');
      },
    },
  ];
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

    // Prime sessions in parallel — failures are silent (each endpoint degrades gracefully)
    const [vahanSess, citizenSess] = await Promise.all([
      primeVahanSession(),
      primeCitizenSession(),
    ]);
    logger.debug({ vahanSess: !!vahanSess, citizenSess: !!citizenSess }, '[vahan.mparivahan] sessions');

    const errors: string[] = [];
    let apiChangedCount = 0;

    for (const { name, run } of buildAttempts(clean, vahanSess, citizenSess)) {
      try {
        const obj = await run();

        const errMsg = isErrorResponse(obj);
        if (errMsg) { errors.push(`${name}: server error — ${errMsg}`); continue; }

        if (!looksLikeVehicleData(obj)) {
          const keys = Object.keys(obj).slice(0,8).join(', ');
          logger.debug({ name, keys }, '[vahan.mparivahan] no vehicle fields');
          errors.push(`${name}: no vehicle fields (keys: ${keys || 'none'})`);
          continue;
        }

        const allVals = Object.values(obj).map(v => String(v ?? '').toUpperCase()).join(' ');
        if (/INVALID\s+VEHICLE|NOT\s+FOUND|NO\s+RECORD|VEHICLE\s+NOT/.test(allVals) &&
            !allVals.includes('MARUTI') && !allVals.includes('HYUNDAI') && !allVals.includes('HONDA')) {
          return { ok: false, error: `Vehicle ${clean} not found in government records`, retryable: false };
        }

        const record = parseMparivahanPayload(obj, clean);
        if (!record.make && !record.ownerName && !record.fuelType && !record.registrationNo) {
          errors.push(`${name}: parsed but all fields empty`);
          continue;
        }

        logger.info({ regNo: clean, endpoint: name }, '[vahan.mparivahan] OK');
        return { ok: true, record };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ err: msg, regNo: clean, endpoint: name }, `[vahan.mparivahan] ${name} failed`);
        // API_CHANGED means this endpoint structure changed — skip to next, don't abort
        if (msg.startsWith('API_CHANGED')) apiChangedCount++;
        errors.push(`${name}: ${msg}`);
      }
    }

    const totalAttempts = buildAttempts(clean, vahanSess, citizenSess).length;
    logger.warn({ regNo: clean, errors }, '[vahan.mparivahan] all endpoints failed');
    return {
      ok: false,
      error: `All endpoints failed — ${errors.join(' · ')}`,
      // Non-retryable only if every single endpoint returned API_CHANGED
      retryable: apiChangedCount < totalAttempts,
      rawPayload: null,
    };
  },
};
