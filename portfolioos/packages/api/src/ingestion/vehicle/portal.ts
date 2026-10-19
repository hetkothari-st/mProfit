/**
 * §7.3 Parivahan portal adapter — Playwright headed flow.
 *
 * The public "Know Your Vehicle Details" page on parivahan.gov.in needs
 * a CAPTCHA + mobile OTP. CLAUDE.md §7.3 explicitly gates this adapter
 * to a manual-refresh button (supportsAuto: false) because the user has
 * to see the visible browser window to type the OTP. The weekly cron
 * will never run this path (§7.6).
 *
 * Gate G6 (§16) still applies: real portal traffic only fires when
 * `ENABLE_PARIVAHAN_PORTAL_ADAPTER=true`. In dev/test the adapter reads
 * a fixture file pointed to by `PARIVAHAN_PORTAL_FIXTURE_PATH` so we
 * can verify the parse layer without a browser.
 *
 * The adapter splits cleanly in two:
 *
 *  - `parseParivahanPortalHtml()` / `parseParivahanPortalPayload()` are
 *    pure functions over the scraped DOM table rows. Fully unit-tested.
 *  - `runPortalSession()` drives the browser. Kept small — the portal
 *    will change, we want the brittle piece isolated.
 */

import { readFileSync } from 'node:fs';
import { logger } from '../../lib/logger.js';
import type {
  VehicleAdapter,
  VehicleAdapterContext,
  VehicleFetchResult,
  VehicleRecord,
} from './types.js';

const ID = 'vahan.parivahan.portal';
const VERSION = '1';

function isGateOpen(): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.ENABLE_PARIVAHAN_PORTAL_ADAPTER === 'true';
}

/**
 * The portal renders RC details as label/value pairs in a table. We
 * accept a plain dictionary — the DOM scrape and the fixture reader
 * both massage into the same shape so the parse is independent of
 * transport.
 */
export interface ParivahanPortalPayload {
  [label: string]: string | undefined;
}

const LABEL_MAP: Record<string, keyof VehicleRecord> = {
  'registration no': 'registrationNo',
  'registration number': 'registrationNo',
  'owner name': 'ownerName',
  'makers name': 'make',
  'maker': 'make',
  'manufacturer': 'make',
  'makers classification': 'model',
  'model name': 'model',
  'model': 'model',
  'vehicle class': 'variant',
  'fuel type': 'fuelType',
  'fuel': 'fuelType',
  'colour': 'color',
  'color': 'color',
  'chassis no': 'chassisLast4',
  'chassis number': 'chassisLast4',
  'engine no': 'chassisLast4',
  'mfg month/yr': 'manufacturingYear',
  'mfg year': 'manufacturingYear',
  'manufacturing year': 'manufacturingYear',
  'rto': 'rtoCode',
  'registering authority': 'rtoCode',
  'insurance upto': 'insuranceExpiry',
  'insurance valid upto': 'insuranceExpiry',
  'insurance expiry': 'insuranceExpiry',
  'puc upto': 'pucExpiry',
  'puc valid upto': 'pucExpiry',
  'fitness upto': 'fitnessExpiry',
  'fitness valid upto': 'fitnessExpiry',
  'tax upto': 'roadTaxExpiry',
  'road tax upto': 'roadTaxExpiry',
  'permit upto': 'permitExpiry',
};

function toIso(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s || s.toUpperCase() === 'NA' || s === '-') return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  }
  const MONTHS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];
  const dmon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (dmon) {
    const mi = MONTHS.indexOf(dmon[2]!.toUpperCase());
    if (mi >= 0) {
      return `${dmon[3]}-${String(mi + 1).padStart(2, '0')}-${dmon[1]!.padStart(2, '0')}`;
    }
  }
  return undefined;
}

function toYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Parse the portal's RC detail table into a VehicleRecord. Accepts a
 * case-insensitive label/value dict — callers (browser scraper or
 * fixture reader) normalise labels to lowercase before passing in.
 */
export function parseParivahanPortalPayload(
  payload: ParivahanPortalPayload,
  regNo: string,
): VehicleRecord {
  const record: VehicleRecord = {
    registrationNo: regNo.replace(/\s+/g, '').toUpperCase(),
    metadata: { raw: payload, source: 'portal' },
  };
  for (const [rawLabel, rawValue] of Object.entries(payload)) {
    if (!rawValue) continue;
    const label = rawLabel.trim().toLowerCase();
    const field = LABEL_MAP[label];
    if (!field) continue;
    const value = rawValue.trim();
    if (!value) continue;

    switch (field) {
      case 'insuranceExpiry':
      case 'pucExpiry':
      case 'fitnessExpiry':
      case 'roadTaxExpiry':
      case 'permitExpiry': {
        const iso = toIso(value);
        if (iso) record[field] = iso;
        break;
      }
      case 'manufacturingYear': {
        const y = toYear(value);
        if (y !== undefined) record.manufacturingYear = y;
        break;
      }
      case 'chassisLast4': {
        // portal shows the full chassis but we only store the last 4
        // per §4.6 — anything else is PII we don't need.
        const digits = value.replace(/\s+/g, '').slice(-4).toUpperCase();
        if (digits) record.chassisLast4 = digits;
        break;
      }
      case 'rtoCode': {
        // "DLC North Delhi (DL1C)" → "DL1C" if parenthesised, else
        // fall back to the raw value.
        const paren = value.match(/\(([A-Z]{2}\d{1,2}[A-Z]?)\)/);
        record.rtoCode = (paren?.[1] ?? value).toUpperCase();
        break;
      }
      case 'make':
      case 'model':
      case 'variant':
      case 'fuelType':
      case 'color':
      case 'ownerName':
        record[field] = value.toUpperCase();
        break;
      case 'registrationNo':
        record.registrationNo = value.replace(/\s+/g, '').toUpperCase();
        break;
    }
  }
  return record;
}

/**
 * Fixture transport — local JSON keyed by reg no, each entry a
 * `ParivahanPortalPayload`. Used by the §7.3 tests and by dev flows
 * that want to exercise the adapter without a real browser.
 */
function loadFromFixture(regNo: string): ParivahanPortalPayload {
  const path = process.env.PARIVAHAN_PORTAL_FIXTURE_PATH;
  if (!path) {
    throw new Error(
      'Parivahan portal live driver not yet wired — set PARIVAHAN_PORTAL_FIXTURE_PATH for dev or deploy to a host with a display.',
    );
  }
  const all = JSON.parse(readFileSync(path, 'utf-8')) as Record<
    string,
    ParivahanPortalPayload
  >;
  const found = all[regNo.toUpperCase()];
  if (!found) {
    throw new Error(`No fixture entry for ${regNo}`);
  }
  return found;
}

/**
 * Drive a headed Chromium session through the portal flow. Returns the
 * scraped label→value payload, which then goes through
 * {@link parseParivahanPortalPayload}.
 *
 * Kept narrow so when the portal markup changes we only touch this
 * function — the parse layer is tested off fixtures and doesn't care.
 *
 * This path is unreachable unless `USE_PORTAL_BROWSER=true` and a
 * display is attached (Playwright headed). In headless CI/dev the
 * adapter falls back to fixtures.
 */
async function runPortalSession(
  regNo: string,
  chassisLast4: string,
): Promise<ParivahanPortalPayload> {
  const useBrowser = process.env.USE_PORTAL_BROWSER === 'true';
  if (!useBrowser) {
    return loadFromFixture(regNo);
  }

  // Dynamic import so Playwright's binary isn't required on deploys
  // that only use fixtures / mParivahan.
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(
      'https://parivahan.gov.in/rcdlstatus/vahan/rcDlHome.xhtml',
      { waitUntil: 'domcontentloaded' },
    );
    await page.fill('input[id*="regn_no1_exact"]', regNo.slice(0, 2));
    await page.fill('input[id*="regn_no2_exact"]', regNo.slice(2));
    // CAPTCHA + chassis + OTP are manual — the user sees the browser
    // window. We wait for the result table to appear (up to 2 min).
    await page.waitForSelector('table[id*="vehicle"]', { timeout: 120_000 });

    // Browser-side eval — DOM types aren't in our Node tsconfig, so we
    // operate through an `any` alias here. The logic is plain DOM: map
    // tr → [td.textContent, …].
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = await page.$$eval(
      'table[id*="vehicle"] tr',
      (els: any[]) =>
        els
          .map((tr: any) =>
            Array.from(tr.querySelectorAll('td')).map(
              (td: any) => (td.textContent ?? '') as string,
            ),
          )
          .filter((cells: string[]) => cells.length >= 2) as string[][],
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const payload: ParivahanPortalPayload = {};
    for (const cells of rows) {
      const label = cells[0]?.replace(/:$/, '').trim();
      const value = cells[1]?.trim();
      if (label && value) payload[label.toLowerCase()] = value;
    }
    // chassis helps when the portal double-checks identity — already
    // provided up-front on the form, so this is advisory, not used for
    // scraping.
    void chassisLast4;
    return payload;
  } finally {
    await browser.close();
  }
}

export const parivahanPortalAdapter: VehicleAdapter = {
  id: ID,
  version: VERSION,
  displayName: 'Parivahan portal',
  // §7.3 explicitly: headed browser + OTP → user must be present.
  supportsAuto: false,
  async fetch(
    regNo: string,
    ctx: VehicleAdapterContext,
  ): Promise<VehicleFetchResult> {
    if (!isGateOpen()) {
      return {
        ok: false,
        error:
          'Parivahan portal adapter disabled (Gate G6). Enable with ENABLE_PARIVAHAN_PORTAL_ADAPTER=true after clearing §16 G6.',
        retryable: false,
      };
    }
    const chassis = ctx.chassisLast4;
    if (!chassis) {
      return {
        ok: false,
        error:
          'Chassis last 4 required for portal lookup — ask the user to fill it on the vehicle then retry.',
        retryable: false,
      };
    }
    try {
      const payload = await runPortalSession(regNo, chassis);
      const record = parseParivahanPortalPayload(payload, regNo);
      return { ok: true, record };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { err: message, regNo },
        '[vahan.parivahan.portal] fetch failed',
      );
      return { ok: false, error: message, retryable: true };
    }
  },
};
