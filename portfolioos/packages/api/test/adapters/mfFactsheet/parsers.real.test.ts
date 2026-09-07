/**
 * REAL-FILE fixture tests — the ones that prove the parsers read what the AMCs
 * actually publish.
 *
 * Every fixture exercised here (`portfolio-real-2026-07.csv` in each AMC's
 * folder) was captured on 2026-09-07 from a live monthly portfolio disclosure
 * downloaded from that AMC's own site. Provenance per file is recorded in
 * `test/fixtures/mf/factsheet/README.md`.
 *
 * ---------------------------------------------------------------------------
 * Why this file exists separately from `parsers.test.ts`
 * ---------------------------------------------------------------------------
 *
 * The synthetic fixtures pin the parsers' behaviour against the shape we
 * ASSUMED. They passed while six of the ten parsers could not read their AMC's
 * file at all, because the fixture and the parser were written from the same
 * wrong assumption — the fixture agreed with the code instead of with reality.
 *
 * These tests cannot do that. If an AMC changes its format, the captured file
 * stops matching and this suite goes red, which is the only signal that
 * actually means "the adapter is broken".
 *
 * The single most important assertion here is the weights sum: it is the check
 * that six of the ten previously failed at 1.0 instead of ~100, because their
 * disclosures store the weight as a FRACTION with a percent NUMBER FORMAT. See
 * `cellToText` in `v1Support.ts` for the extraction rule that resolves it.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal } from '@portfolioos/shared';
import { csvToGrid } from '../../../src/adapters/mfFactsheet/normalise.js';
import { parseSbiPortfolio } from '../../../src/adapters/mfFactsheet/sbi.parse.js';
import { parseIciciPortfolio } from '../../../src/adapters/mfFactsheet/icici.parse.js';
import { parseHdfcPortfolio } from '../../../src/adapters/mfFactsheet/hdfc.parse.js';
import { parseNipponPortfolio } from '../../../src/adapters/mfFactsheet/nippon.parse.js';
import { parseKotakPortfolio } from '../../../src/adapters/mfFactsheet/kotak.parse.js';
import { parseAxisPortfolio } from '../../../src/adapters/mfFactsheet/axis.parse.js';
import { parseUtiPortfolio } from '../../../src/adapters/mfFactsheet/uti.parse.js';
import { parseAbslPortfolio } from '../../../src/adapters/mfFactsheet/absl.parse.js';
import { parseMiraePortfolio } from '../../../src/adapters/mfFactsheet/mirae.parse.js';
import { parseDspPortfolio } from '../../../src/adapters/mfFactsheet/dsp.parse.js';
import type {
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
} from '../../../src/adapters/mfFactsheet/types.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (amc: string) =>
  resolve(here, '../../fixtures/mf/factsheet', amc, 'portfolio-real-2026-07.csv');

/** Every capture is the July 2026 disclosure, published end of July 2026. */
const JUL_2026 = new Date(Date.UTC(2026, 6, 31));

interface RealCase {
  amc: string;
  amcCode: string;
  /** The scheme whose sheet was captured, for a readable failure message. */
  scheme: string;
  parse: (i: PortfolioParseInput) => MfFactsheetResult<PortfolioRaw>;
  /** How the AMC stores the weight column in the source workbook. */
  storedAs: 'PERCENT' | 'FRACTION';
}

const CASES: readonly RealCase[] = [
  { amc: 'sbi', amcCode: 'SBI', scheme: 'SBI ESG Exclusionary Strategy Fund', parse: parseSbiPortfolio, storedAs: 'PERCENT' },
  { amc: 'icici', amcCode: 'ICICI_PRU', scheme: 'ICICI Prudential Balanced Advantage Fund', parse: parseIciciPortfolio, storedAs: 'FRACTION' },
  { amc: 'hdfc', amcCode: 'HDFC', scheme: 'HDFC Flexi Cap Fund', parse: parseHdfcPortfolio, storedAs: 'PERCENT' },
  { amc: 'nippon', amcCode: 'NIPPON', scheme: 'Nippon India Growth Mid Cap Fund', parse: parseNipponPortfolio, storedAs: 'FRACTION' },
  { amc: 'kotak', amcCode: 'KOTAK', scheme: 'Kotak Nifty200 Value 30 Index Fund', parse: parseKotakPortfolio, storedAs: 'PERCENT' },
  { amc: 'axis', amcCode: 'AXIS', scheme: 'Axis Nifty 500 Index Fund', parse: parseAxisPortfolio, storedAs: 'FRACTION' },
  { amc: 'uti', amcCode: 'UTI', scheme: 'UTI Unit Linked Insurance Plan', parse: parseUtiPortfolio, storedAs: 'PERCENT' },
  { amc: 'absl', amcCode: 'ABSL', scheme: "Aditya Birla Sun Life Equity Hybrid '95 Fund", parse: parseAbslPortfolio, storedAs: 'FRACTION' },
  { amc: 'mirae', amcCode: 'MIRAE', scheme: 'Mirae Asset Small Cap Fund', parse: parseMiraePortfolio, storedAs: 'FRACTION' },
  { amc: 'dsp', amcCode: 'DSP', scheme: 'DSP Flexi Cap Fund', parse: parseDspPortfolio, storedAs: 'FRACTION' },
];

async function parseReal(c: RealCase): Promise<MfFactsheetResult<PortfolioRaw>> {
  const rows = csvToGrid(await readFile(fixture(c.amc), 'utf-8'));
  return c.parse({ schemeCode: c.scheme, rows, expectedAsOf: JUL_2026 });
}

describe.each(CASES)('$amcCode — real July 2026 disclosure', (c) => {
  it('parses the real file into a stored snapshot', async () => {
    const res = await parseReal(c);
    // Surface the real reason rather than a bare `false !== true`.
    if (!res.ok) throw new Error(`${c.amcCode} ${res.reason}: ${res.detail}`);
    expect(res.ok).toBe(true);
  });

  it('reports the as-of date the document itself states (31 Jul 2026)', async () => {
    const res = await parseReal(c);
    if (!res.ok) throw new Error(`${res.reason}: ${res.detail}`);
    expect(res.data.asOf.toISOString().slice(0, 10)).toBe('2026-07-31');
  });

  it('weights sum inside the 97-103% band', async () => {
    const res = await parseReal(c);
    if (!res.ok) throw new Error(`${res.reason}: ${res.detail}`);
    const sum = res.data.holdings.reduce((a, h) => a.plus(new Decimal(h.weightPct)), new Decimal(0));
    // The regression this pins: a fraction-stored weight column read raw sums
    // to ~1, not ~100. Six of the ten AMCs store it that way.
    expect(sum.gte(97), `${c.amcCode} weights summed to ${sum.toString()}`).toBe(true);
    expect(sum.lte(103), `${c.amcCode} weights summed to ${sum.toString()}`).toBe(true);
  });

  it('finds a real number of holdings, none of them a subtotal row', async () => {
    const res = await parseReal(c);
    if (!res.ok) throw new Error(`${res.reason}: ${res.detail}`);
    expect(res.data.holdings.length).toBeGreaterThan(5);
    for (const h of res.data.holdings) {
      expect(h.securityName.length).toBeGreaterThan(0);
      // A subtotal that slipped through would be individually plausible and
      // would quietly inflate every concentration metric.
      expect(h.securityName).not.toMatch(/^(sub\s*total|grand\s*total|total\b)/i);
    }
  });

  it('stamps the AMC code the registry routes on', async () => {
    const res = await parseReal(c);
    if (!res.ok) throw new Error(`${res.reason}: ${res.detail}`);
    expect(res.data.amcCode).toBe(c.amcCode);
  });
});
