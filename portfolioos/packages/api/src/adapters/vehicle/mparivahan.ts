/**
 * §7.2 mParivahan API adapter — Gate G6 cleared by user on 2026-04-22.
 *
 * Live endpoint: reverse-engineered from the mParivahan Android app.
 * Wraps every HTTP call in try/catch; returns a typed API_CHANGED error
 * on unexpected response shapes so the chain can fall through gracefully.
 *
 * Dev behaviour: if MPARIVAHAN_FIXTURE_PATH or the built-in fixture file
 * has an entry for the requested reg number it is used (fast, offline).
 * Otherwise falls through to the live HTTPS call.
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
const VERSION = '2';  // bumped when live HTTP replaced the fixture stub

/** §7.2 — RC status endpoint exposed by the mParivahan Android app */
const RC_ENDPOINT = 'https://app.parivahan.gov.in/RCStatus/checkrcstatusaction/getRCDetail.do';

/** Fallback endpoint if primary is down */
const RC_ENDPOINT_V2 = 'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/loginManager/unRegistered/getAuthReg.do';

const BUILTIN_FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'dev.json',
);

const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 12; SM-A526B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// ─── parser ──────────────────────────────────────────────────────────────────

export function parseMparivahanPayload(payload: unknown, regNo: string): VehicleRecord {
  // Unwrap vehicleData wrapper if present (live API response shape)
  const raw = (payload ?? {}) as Record<string, unknown>;
  const p: Record<string, unknown> =
    raw['vehicleData'] && typeof raw['vehicleData'] === 'object'
      ? (raw['vehicleData'] as Record<string, unknown>)
      : raw;

  const get = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
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
    if (!s || s === 'NA' || s === 'N/A') return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
    }
    // YYYY/MM/DD
    const ymd = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    return undefined;
  };

  // make/model — live API sometimes merges these into maker_model
  let make = get('make', 'maker_desc', 'manufacturer');
  let model = get('model', 'vehicleModel', 'vchnum');
  const makerModel = get('maker_model');
  if (!make && !model && makerModel) {
    const parts = makerModel.split('/');
    make = parts[0]?.trim().toUpperCase();
    model = parts.slice(1).join('/').trim().toUpperCase() || undefined;
  }

  const chassis = get('chassisNo', 'chassis', 'chasisNo', 'chassisno');
  return {
    registrationNo: regNo.replace(/\s+/g, '').toUpperCase(),
    make: make?.toUpperCase(),
    model: model?.toUpperCase(),
    variant: get('variant')?.toUpperCase(),
    manufacturingYear: toYear(p['mfgYear'] ?? p['manufacturingYear'] ?? p['yearOfMfg'] ?? p['manufacturing_year']),
    fuelType: get('fuelType', 'fuel', 'fuel_desc')?.toUpperCase(),
    color: get('color', 'colour', 'vehicleColor', 'vehicle_color')?.toUpperCase(),
    chassisLast4: chassis ? chassis.slice(-4).toUpperCase() : undefined,
    rtoCode: get('rtoCode', 'rto', 'rto_code'),
    ownerName: get('ownerName', 'owner', 'owner_name')?.toUpperCase(),
    insuranceExpiry: toIso(p['insuranceExpiry'] ?? p['insExpiry'] ?? p['insuranceUpto'] ?? p['insurance_upto']),
    pucExpiry: toIso(p['pucExpiry'] ?? p['pucUpto'] ?? p['pucc_upto']),
    fitnessExpiry: toIso(p['fitnessExpiry'] ?? p['fitnessUpto'] ?? p['fit_upto']),
    roadTaxExpiry: toIso(p['taxExpiry'] ?? p['taxUpto'] ?? p['roadTaxUpto'] ?? p['tax_upto']),
    permitExpiry: toIso(p['permitExpiry'] ?? p['permitUpto'] ?? p['permit_upto']),
    metadata: { raw: p, source: 'mparivahan' },
  };
}

// ─── fixture fast-path ────────────────────────────────────────────────────────

function tryFixture(regNo: string): unknown | null {
  const fixturePath = process.env['MPARIVAHAN_FIXTURE_PATH'] ?? BUILTIN_FIXTURE_PATH;
  if (!existsSync(fixturePath)) return null;
  try {
    const all = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Record<string, unknown>;
    return all[regNo.toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

// ─── live HTTP ────────────────────────────────────────────────────────────────

/**
 * POST to the mParivahan RC status endpoint.
 * Returns parsed JSON or throws with an `API_CHANGED` prefix when the
 * response shape is unexpected — the chain adapter treats that as non-retryable.
 */
async function fetchFromPrimary(regNo: string): Promise<unknown> {
  const body = new URLSearchParams({ reg_no: regNo.toUpperCase() });
  const res = await fetch(RC_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Origin': 'https://app.parivahan.gov.in',
      'Referer': 'https://app.parivahan.gov.in/RCStatus/',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`API_CHANGED: HTTP ${res.status} from mParivahan primary`);
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('json') && !ct.includes('javascript')) {
    const text = await res.text();
    // If it returned HTML, the endpoint likely moved or is behind a CAPTCHA
    if (text.trimStart().startsWith('<')) {
      throw new Error('API_CHANGED: mParivahan primary returned HTML instead of JSON');
    }
    throw new Error(`API_CHANGED: unexpected content-type "${ct}"`);
  }
  const json = await res.json() as Record<string, unknown>;

  // Accept either { vehicleData: {...} } or flat object with reg_no field
  if (!json['vehicleData'] && !json['reg_no'] && !json['make'] && !json['maker_desc']) {
    if (json['msg'] && String(json['msg']).toUpperCase().includes('INVALID')) {
      throw new Error(`Vehicle registration ${regNo} not found or invalid`);
    }
    throw new Error(`API_CHANGED: mParivahan returned unrecognised shape: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function fetchFromFallback(regNo: string): Promise<unknown> {
  const body = new URLSearchParams({ regNo: regNo.toUpperCase() });
  const res = await fetch(RC_ENDPOINT_V2, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      'Accept': 'application/json, */*',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`API_CHANGED: HTTP ${res.status} from mParivahan fallback`);
  return res.json();
}

// ─── adapter ──────────────────────────────────────────────────────────────────

export const mparivahanAdapter: VehicleAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'mParivahan API',
  supportsAuto: true,

  async fetch(regNo): Promise<VehicleFetchResult> {
    const clean = regNo.replace(/\s+/g, '').toUpperCase();

    // 1. Fixture fast-path (dev / test)
    const fixtureHit = tryFixture(clean);
    if (fixtureHit !== null) {
      logger.debug({ regNo: clean }, '[vahan.mparivahan] fixture hit');
      return { ok: true, record: parseMparivahanPayload(fixtureHit, clean) };
    }

    // 2. Live API — primary endpoint
    try {
      const payload = await fetchFromPrimary(clean);
      const record = parseMparivahanPayload(payload, clean);
      logger.info({ regNo: clean }, '[vahan.mparivahan] live primary OK');
      return { ok: true, record };
    } catch (primaryErr) {
      const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      logger.warn({ err: primaryMsg, regNo: clean }, '[vahan.mparivahan] primary failed, trying fallback');

      // Don't retry known-bad shapes on the same endpoint
      if (primaryMsg.startsWith('API_CHANGED')) {
        return { ok: false, error: primaryMsg, retryable: false, rawPayload: null };
      }

      // 3. Fallback endpoint
      try {
        const payload2 = await fetchFromFallback(clean);
        const record = parseMparivahanPayload(payload2, clean);
        logger.info({ regNo: clean }, '[vahan.mparivahan] live fallback OK');
        return { ok: true, record };
      } catch (fallbackErr) {
        const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        logger.warn({ err: fallbackMsg, regNo: clean }, '[vahan.mparivahan] fallback also failed');
        return {
          ok: false,
          error: `primary: ${primaryMsg} | fallback: ${fallbackMsg}`,
          retryable: true,
          rawPayload: null,
        };
      }
    }
  },
};
