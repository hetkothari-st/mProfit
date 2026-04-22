/**
 * §7.5 Challan adapter — echallan.parivahan.gov.in scraper.
 *
 * Fetches the list of outstanding/paid e-challans for an RC. Like the
 * portal adapter (§7.3), the real flow needs OTP + CAPTCHA so it runs
 * interactively only. The weekly cron does NOT run this directly; the
 * monthly challan cron calls {@link scanChallansForVehicle} in the
 * service layer which uses this adapter.
 *
 * Two transports, same parse:
 *
 *   - Live: Playwright headed session (gated by USE_CHALLAN_BROWSER).
 *   - Fixture: JSON file pointed to by CHALLAN_FIXTURE_PATH — used by
 *     §7.5 tests and by dev flows that haven't cleared G6 yet.
 */

import { readFileSync } from 'node:fs';
import { logger } from '../../lib/logger.js';

const ID = 'echallan.parivahan.portal';
const VERSION = '1';

export interface ChallanRow {
  challanNo: string;
  offenceDate: string; // ISO YYYY-MM-DD
  offenceType?: string;
  location?: string;
  amount: string; // decimal string
  status: string; // PENDING | PAID | CONTESTED | CANCELLED
  details?: Record<string, unknown>;
}

export interface ChallanFetchResult {
  ok: boolean;
  source: string;
  sourceVersion: string;
  challans: ChallanRow[];
  error?: string;
  retryable?: boolean;
}

const STATUS_MAP: Record<string, string> = {
  pending: 'PENDING',
  disposed: 'PAID',
  paid: 'PAID',
  'in court': 'CONTESTED',
  contested: 'CONTESTED',
  cancelled: 'CANCELLED',
};

function normaliseStatus(raw: string | undefined): string {
  if (!raw) return 'PENDING';
  const key = raw.trim().toLowerCase();
  return STATUS_MAP[key] ?? raw.trim().toUpperCase();
}

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

function toIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  }
  const dmon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (dmon) {
    const mi = MONTHS.indexOf(dmon[2]!.toUpperCase());
    if (mi >= 0) {
      return `${dmon[3]}-${String(mi + 1).padStart(2, '0')}-${dmon[1]!.padStart(2, '0')}`;
    }
  }
  return undefined;
}

function toDecimalString(raw: string | number | undefined): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).replace(/[₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return s;
}

/**
 * Parse a loosely-typed payload into our ChallanRow shape. Accepts a
 * best-effort dict keyed by the portal's labels — scraper and fixture
 * both normalise to lowercased keys before passing in.
 */
export function parseChallanRow(raw: Record<string, unknown>): ChallanRow | null {
  const getStr = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number') return String(v);
    }
    return undefined;
  };

  const challanNo = getStr('challanno', 'challan_no', 'challan number', 'challan');
  const offenceDate = toIso(getStr('offencedate', 'offence_date', 'date', 'offence date'));
  const amount = toDecimalString(
    getStr('amount', 'fine', 'fineamount', 'fine_amount', 'penalty'),
  );
  if (!challanNo || !offenceDate || !amount) {
    return null;
  }
  return {
    challanNo: challanNo.replace(/\s+/g, ''),
    offenceDate,
    offenceType: getStr('offence', 'offencetype', 'offence_type', 'violation'),
    location: getStr('location', 'place'),
    amount,
    status: normaliseStatus(getStr('status', 'state')),
    details: raw,
  };
}

export function parseChallanPayload(rows: unknown): ChallanRow[] {
  if (!Array.isArray(rows)) return [];
  const out: ChallanRow[] = [];
  for (const entry of rows) {
    if (entry && typeof entry === 'object') {
      const normalised: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
        normalised[k.toLowerCase()] = v;
      }
      const row = parseChallanRow(normalised);
      if (row) out.push(row);
    }
  }
  return out;
}

function loadFromFixture(regNo: string): unknown {
  const path = process.env.CHALLAN_FIXTURE_PATH;
  if (!path) {
    // No fixture configured — return empty list so dev runs cleanly
    // without needing CHALLAN_FIXTURE_PATH set.
    logger.info({ regNo }, '[echallan] no CHALLAN_FIXTURE_PATH — returning empty challan list');
    return [];
  }
  const all = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  const found = all[regNo.toUpperCase()];
  if (found === undefined) {
    // Fixture exists but no entry for this reg — treat as "no challans".
    return [];
  }
  return found;
}

/**
 * Playwright driver — gated by USE_CHALLAN_BROWSER=true. Returns the
 * raw row list; parsing happens in {@link parseChallanPayload}.
 *
 * The echallan flow: nav → enter RC + chassis → solve CAPTCHA →
 * receive OTP → enter → table renders. We give the user 3 min to
 * complete the interactive steps before giving up.
 */
async function runChallanSession(
  regNo: string,
  chassisLast4: string,
): Promise<unknown> {
  const useBrowser = process.env.USE_CHALLAN_BROWSER === 'true';
  if (!useBrowser) {
    return loadFromFixture(regNo);
  }
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('https://echallan.parivahan.gov.in/index/accused-challan', {
      waitUntil: 'domcontentloaded',
    });
    await page.fill('input[name="reg_no"]', regNo);
    await page.fill('input[name="chassis_no"]', chassisLast4);
    // CAPTCHA + OTP handled manually by the user in the visible window.
    await page.waitForSelector('table.challan-list tbody tr', { timeout: 180_000 });
    // Browser-side eval — DOM types aren't in our Node tsconfig, so we
    // operate through an `any` alias here (same trick as portal.ts).
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = await page.$$eval(
      'table.challan-list tbody tr',
      (els: any[]) =>
        els.map((tr: any) => {
          const cells = Array.from(tr.querySelectorAll('td')).map(
            (td: any) => (td.textContent ?? '').trim() as string,
          );
          return {
            challanno: cells[0] ?? '',
            offencedate: cells[1] ?? '',
            offence: cells[2] ?? '',
            location: cells[3] ?? '',
            amount: cells[4] ?? '',
            status: cells[5] ?? '',
          };
        }),
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return rows;
  } finally {
    await browser.close();
  }
}

export async function fetchChallansForRegNo(
  regNo: string,
  chassisLast4: string | undefined | null,
): Promise<ChallanFetchResult> {
  // 1. APIMall commercial API — auto-capable, no chassis needed
  const { fetchChallansViaApimall } = await import('./apimall.js');
  const apimallResult = await fetchChallansViaApimall(regNo);
  if (apimallResult.ok) return apimallResult;
  // If APIMall key is missing it returns retryable:false — log and fall through
  logger.debug({ err: apimallResult.error, regNo }, '[echallan] APIMall fallback to portal');

  // 2. Playwright portal — needs chassis + OTP
  const gateOpen =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_CHALLAN_ADAPTER === 'true';
  if (!gateOpen) {
    return {
      ok: false,
      source: ID,
      sourceVersion: VERSION,
      challans: [],
      error:
        'Challan adapter disabled (Gate G6). Enable with ENABLE_CHALLAN_ADAPTER=true after clearing §16 G6.',
      retryable: false,
    };
  }
  if (!chassisLast4) {
    return {
      ok: false,
      source: ID,
      sourceVersion: VERSION,
      challans: [],
      error: 'Chassis last 4 required for portal challan lookup.',
      retryable: false,
    };
  }
  try {
    const raw = await runChallanSession(regNo.toUpperCase(), chassisLast4);
    const challans = parseChallanPayload(raw);
    return { ok: true, source: ID, sourceVersion: VERSION, challans };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, regNo }, '[echallan] fetch failed');
    return {
      ok: false,
      source: ID,
      sourceVersion: VERSION,
      challans: [],
      error: message,
      retryable: true,
    };
  }
}

export const CHALLAN_ADAPTER_ID = ID;
export const CHALLAN_ADAPTER_VERSION = VERSION;
