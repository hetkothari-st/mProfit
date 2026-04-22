/**
 * §7.2 mParivahan API adapter — scaffold only (Gate G6 in §16).
 *
 * The endpoint list in §7.2 is reverse-engineered from the Android app.
 * CLAUDE.md §16 G6 prohibits hitting parivahan.gov.in infrastructure
 * until the user explicitly opts in. This adapter therefore:
 *
 *   1. Refuses to run unless `ENABLE_MPARIVAHAN_ADAPTER=true` is set.
 *   2. When enabled, only knows how to read a static local fixture file
 *      (dev/test use). The live HTTP implementation ships in a later
 *      session after the user clears G6.
 *
 * Keeping the skeleton in tree lets the chain framework (§7.1) reference
 * a real adapter with a real version string — when G6 clears, the only
 * change required is to replace `callLiveEndpoint()` with the actual HTTP
 * call, while preserving the parse function.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { logger } from '../../lib/logger.js';
import type {
  VehicleAdapter,
  VehicleFetchResult,
  VehicleRecord,
} from './types.js';

const ID = 'vahan.mparivahan.api';
const VERSION = '1';

/**
 * Shipped dev fixture. Always co-located with this source file so a fresh
 * clone can drive `MH47BT5950` and a couple of other reg numbers through the
 * chain without any env setup. Users can still override with
 * `MPARIVAHAN_FIXTURE_PATH` for their own test data.
 */
const BUILTIN_FIXTURE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'dev.json',
);

/**
 * Gate G6: only blocks when running in production WITHOUT an explicit
 * opt-in. In development the built-in fixture is always available, so the
 * gate is effectively a no-op until the live HTTP implementation ships.
 */
function isGateOpen(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ENABLE_MPARIVAHAN_ADAPTER === 'true';
}

/**
 * Parse an mParivahan-shaped payload into a VehicleRecord. Shape is
 * based on public reverse-engineering samples; fields absent from the
 * response stay undefined.
 */
export function parseMparivahanPayload(payload: unknown, regNo: string): VehicleRecord {
  const p = (payload ?? {}) as Record<string, unknown>;
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
    if (!s) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
    }
    return undefined;
  };

  const chassis = get('chassisNo', 'chassis', 'chasisNo');
  return {
    registrationNo: regNo.replace(/\s+/g, '').toUpperCase(),
    make: get('make', 'manufacturer')?.toUpperCase(),
    model: get('model', 'vehicleModel')?.toUpperCase(),
    variant: get('variant')?.toUpperCase(),
    manufacturingYear: toYear(p.mfgYear ?? p.manufacturingYear ?? p.yearOfMfg),
    fuelType: get('fuelType', 'fuel')?.toUpperCase(),
    color: get('color', 'colour')?.toUpperCase(),
    chassisLast4: chassis ? chassis.slice(-4).toUpperCase() : undefined,
    rtoCode: get('rtoCode', 'rto'),
    ownerName: get('ownerName', 'owner')?.toUpperCase(),
    insuranceExpiry: toIso(p.insuranceExpiry ?? p.insExpiry ?? p.insuranceUpto),
    pucExpiry: toIso(p.pucExpiry ?? p.pucUpto),
    fitnessExpiry: toIso(p.fitnessExpiry ?? p.fitnessUpto),
    roadTaxExpiry: toIso(p.taxExpiry ?? p.taxUpto ?? p.roadTaxUpto),
    permitExpiry: toIso(p.permitExpiry ?? p.permitUpto),
    metadata: { raw: p, source: 'mparivahan' },
  };
}

/**
 * In the sandboxed (pre-G6) build, this reads a fixture file pointed to
 * by `MPARIVAHAN_FIXTURE_PATH`. After G6 clears, replace with the real
 * HTTPS call wrapped in a strict try/catch that flips unexpected
 * response shapes into a typed `API_CHANGED` error (§7.2 requirement).
 */
async function callLiveEndpoint(regNo: string): Promise<unknown> {
  const fixturePath = process.env.MPARIVAHAN_FIXTURE_PATH ?? BUILTIN_FIXTURE_PATH;
  const raw = readFileSync(fixturePath, 'utf-8');
  const all = JSON.parse(raw) as Record<string, unknown>;
  const found = all[regNo.toUpperCase()];
  if (!found) {
    throw new Error(
      `No fixture entry for ${regNo} in ${fixturePath} (Gate G6 not cleared — live API disabled)`,
    );
  }
  return found;
}

export const mparivahanAdapter: VehicleAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'mParivahan API',
  supportsAuto: true,
  async fetch(regNo): Promise<VehicleFetchResult> {
    if (!isGateOpen()) {
      return {
        ok: false,
        error:
          'mParivahan adapter is disabled (Gate G6). Enable with ENABLE_MPARIVAHAN_ADAPTER=true after clearing §16 G6.',
        retryable: false,
      };
    }
    try {
      const payload = await callLiveEndpoint(regNo);
      const record = parseMparivahanPayload(payload, regNo);
      return { ok: true, record };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message, regNo }, '[vahan.mparivahan] fetch failed');
      return { ok: false, error: message, retryable: true, rawPayload: null };
    }
  },
};
