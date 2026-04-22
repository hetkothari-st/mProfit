/**
 * APIMall vehicle adapters — RC verification + challan lookup.
 *
 * APIMall (apimall.in) is a commercial Indian API marketplace. The user
 * pointed to these two products:
 *   https://apimall.in/products/vehicle-rc/vehicle-rc-verification-api
 *   https://apimall.in/products/challan/vehicle-challan-details-api
 *
 * Required env vars (set after activating the products on apimall.in):
 *   APIMALL_API_KEY      — API key from your APIMall dashboard
 *   APIMALL_RC_URL       — endpoint URL from dashboard (defaults below are
 *                          best-guess; override if yours differs)
 *   APIMALL_CHALLAN_URL  — challan endpoint (same note)
 *
 * Response field names come from the sample JSON shown on the product page.
 * The adapter is disabled (returns {ok:false, retryable:false}) when
 * APIMALL_API_KEY is not set, so it is safe to deploy without the key —
 * the chain just skips it.
 */

import { logger } from '../../lib/logger.js';
import type {
  VehicleAdapter,
  VehicleAdapterContext,
  VehicleFetchResult,
  VehicleRecord,
} from './types.js';
import type { ChallanFetchResult, ChallanRow } from './challan.js';

// ─── config ───────────────────────────────────────────────────────────────────

const DEFAULT_RC_URL =
  'https://api.apimall.in/v1/vehicle/rc-verification';
const DEFAULT_CHALLAN_URL =
  'https://api.apimall.in/v1/vehicle/challan-details';

function getConfig(): { key: string; rcUrl: string; challanUrl: string } | null {
  const key = process.env['APIMALL_API_KEY'];
  if (!key) return null;
  return {
    key,
    rcUrl: process.env['APIMALL_RC_URL'] ?? DEFAULT_RC_URL,
    challanUrl: process.env['APIMALL_CHALLAN_URL'] ?? DEFAULT_CHALLAN_URL,
  };
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function apimallPost(
  url: string,
  apiKey: string,
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API_CHANGED: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }

  let json: unknown;
  try { json = JSON.parse(text); } catch {
    throw new Error(`API_CHANGED: non-JSON response — ${text.slice(0, 200)}`);
  }
  return (json ?? {}) as Record<string, unknown>;
}

// ─── RC parser ────────────────────────────────────────────────────────────────

/**
 * Field names taken directly from apimall.in RC product sample response.
 * Also handles common alternative keys in case the live response differs
 * from the sample (API versioning drift).
 */
export function parseApimallRcResponse(data: Record<string, unknown>, regNo: string): VehicleRecord {
  const d = data;

  const str = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === 'string' && v.trim() && !/^(NA|N\/A|null|undefined|-)$/i.test(v.trim())) {
        return v.trim();
      }
    }
    return undefined;
  };

  const MONTHS: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  };
  const toIso = (v: string | undefined): string | undefined => {
    if (!v) return undefined;
    const s = v.trim();
    if (!s || /^(NA|N\/A|-)$/i.test(s)) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2,'0')}-${dmy[1]!.padStart(2,'0')}`;
    // YYYY/MM/DD
    const ymd = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
    // "31-Jan-2026" / "31 Jan 2026"
    const dmon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s,.](\d{4})$/);
    if (dmon) {
      const mon = MONTHS[dmon[2]!.toLowerCase()];
      if (mon) return `${dmon[3]}-${mon}-${dmon[1]!.padStart(2,'0')}`;
    }
    return undefined;
  };

  // Unwrap nested data object if present
  const root: Record<string, unknown> =
    (d['data'] && typeof d['data'] === 'object' && !Array.isArray(d['data']))
      ? d['data'] as Record<string, unknown>
      : d;

  const s = (...keys: string[]) => {
    for (const k of keys) {
      const v = root[k];
      if (typeof v === 'string' && v.trim() && !/^(NA|N\/A|null|undefined|-)$/i.test(v.trim())) {
        return v.trim();
      }
    }
    return undefined;
  };

  const chassis = s('chassisNo', 'chassis_no', 'chassisNumber');
  const mfgRaw = s('mfg_date', 'manufacturingDate', 'mfd_date');
  let mfgYear: number | undefined;
  if (mfgRaw) {
    const m = mfgRaw.match(/\b(19\d{2}|20\d{2})\b/);
    if (m) mfgYear = Number(m[1]);
  }

  return {
    registrationNo: (s('regNo', 'reg_no', 'registration_no') ?? regNo).replace(/\s+/g, '').toUpperCase(),
    make: s('maker', 'make', 'manufacturer', 'vehicle_manufacturer_name')?.toUpperCase(),
    model: s('makerModal', 'model', 'maker_model', 'vehicle_model')?.toUpperCase(),
    variant: s('bodyTypeDesc', 'body_type', 'vehicleClass', 'vehicle_class_desc')?.toUpperCase(),
    manufacturingYear: mfgYear,
    fuelType: s('fuelType', 'fuel_type', 'fuel_desc')?.toUpperCase(),
    color: s('color', 'colour', 'vehicle_color')?.toUpperCase(),
    chassisLast4: chassis ? chassis.replace(/\s+/g, '').slice(-4).toUpperCase() : undefined,
    rtoCode: s('rto', 'rto_code', 'office_code'),
    ownerName: s('ownerName', 'owner_name', 'reg_owner_name')?.toUpperCase(),
    insuranceExpiry: toIso(s('insUpto', 'insurance_upto', 'ins_upto', 'insurance_validity')),
    pucExpiry: toIso(s('pucUpto', 'pucc_upto', 'puc_validity', 'pucNo')),
    fitnessExpiry: toIso(s('fitnessUpto', 'fit_upto', 'fitness_upto', 'fitness_validity')),
    roadTaxExpiry: toIso(s('taxUpto', 'tax_upto', 'road_tax_upto', 'tax_validity')),
    permitExpiry: toIso(s('permitUpto', 'permit_upto', 'permit_validity')),
    metadata: { raw: root, source: 'apimall' },
  };
  // suppress unused str warning
  void str;
}

// ─── challan parser ───────────────────────────────────────────────────────────

function toChallanStatus(raw: string): string {
  const u = raw.toUpperCase();
  if (u.includes('PAID')) return 'PAID';
  if (u.includes('PENDING') || u.includes('UNPAID')) return 'PENDING';
  if (u.includes('COURT')) return 'CONTESTED';
  if (u.includes('CANCEL')) return 'CANCELLED';
  return 'PENDING';
}

function toIsoDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const dmy = raw.trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
  return new Date().toISOString().slice(0, 10);
}

export function parseApimallChallanResponse(
  data: Record<string, unknown>,
): ChallanRow[] {
  const root: Record<string, unknown> =
    (data['data'] && typeof data['data'] === 'object' && !Array.isArray(data['data']))
      ? data['data'] as Record<string, unknown>
      : data;

  const rows: ChallanRow[] = [];

  const groups = ['paidChallans', 'pendingChallans', 'physicalCourtChallans', 'virtualCourtChallans'];
  for (const group of groups) {
    const g = root[group] as Record<string, unknown> | undefined;
    if (!g) continue;
    const items = (g['data'] ?? g['challans'] ?? []) as Record<string, unknown>[];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const get = (...keys: string[]) => {
        for (const k of keys) {
          const v = item[k];
          if (typeof v === 'string' && v.trim()) return v.trim();
          if (typeof v === 'number') return String(v);
        }
        return undefined;
      };
      const challanNo = get('challan_no', 'challanNo', 'challan_number', 'id');
      if (!challanNo) continue;
      rows.push({
        challanNo,
        offenceDate: toIsoDate(get('challan_date', 'offence_date', 'date_of_challan', 'date')),
        offenceType: get('offence_type', 'offence', 'violation_type'),
        location: get('state_of_offence', 'location', 'place'),
        amount: get('fine_imposed', 'amount', 'challan_amount', 'fine') ?? '0',
        status: toChallanStatus(group === 'paidChallans' ? 'paid' : group === 'pendingChallans' ? 'pending' : 'court'),
        details: item,
      });
    }
  }
  return rows;
}

// ─── RC adapter ───────────────────────────────────────────────────────────────

const RC_ID = 'vahan.apimall.rc';
const RC_VERSION = '1';

export const apimallRcAdapter: VehicleAdapter = {
  id: RC_ID,
  version: RC_VERSION,
  displayName: 'APIMall RC verification',
  supportsAuto: true,

  async fetch(regNo: string, _ctx: VehicleAdapterContext): Promise<VehicleFetchResult> {
    const cfg = getConfig();
    if (!cfg) {
      return {
        ok: false,
        error: 'APIMall adapter not configured — set APIMALL_API_KEY in .env',
        retryable: false,
      };
    }

    try {
      const data = await apimallPost(cfg.rcUrl, cfg.key, { regNo: regNo.toUpperCase() });

      if (!data['success'] && !data['data']) {
        const msg = String(data['message'] ?? data['error'] ?? 'unknown error');
        if (/invalid|not found|no record/i.test(msg)) {
          return { ok: false, error: `Vehicle not found: ${msg}`, retryable: false };
        }
        throw new Error(`API_CHANGED: unexpected shape — ${JSON.stringify(data).slice(0, 200)}`);
      }

      const record = parseApimallRcResponse(data, regNo);
      if (!record.make && !record.ownerName && !record.fuelType) {
        throw new Error(`API_CHANGED: parsed response has no vehicle fields — ${JSON.stringify(data).slice(0, 300)}`);
      }

      logger.info({ regNo, endpoint: cfg.rcUrl }, '[vahan.apimall] RC OK');
      return { ok: true, record };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, regNo }, '[vahan.apimall] RC failed');
      return { ok: false, error: msg, retryable: !msg.startsWith('API_CHANGED'), rawPayload: null };
    }
  },
};

// ─── challan adapter ──────────────────────────────────────────────────────────

export async function fetchChallansViaApimall(
  regNo: string,
): Promise<ChallanFetchResult> {
  const cfg = getConfig();
  if (!cfg) {
    return {
      ok: false,
      source: 'vahan.apimall.challan',
      sourceVersion: '1',
      challans: [],
      error: 'APIMall adapter not configured — set APIMALL_API_KEY in .env',
      retryable: false,
    };
  }

  try {
    const data = await apimallPost(cfg.challanUrl, cfg.key, { regNo: regNo.toUpperCase() });
    const challans = parseApimallChallanResponse(data);
    logger.info({ regNo, count: challans.length }, '[vahan.apimall] challan OK');
    return { ok: true, source: 'vahan.apimall.challan', sourceVersion: '1', challans };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err: msg, regNo }, '[vahan.apimall] challan failed');
    return {
      ok: false,
      source: 'vahan.apimall.challan',
      sourceVersion: '1',
      challans: [],
      error: msg,
      retryable: !msg.startsWith('API_CHANGED'),
    };
  }
}
