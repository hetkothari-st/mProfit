/**
 * Fixture tests for the seven AMC parsers added by Task 1.6 — Nippon, Kotak,
 * Axis, UTI, ABSL, Mirae and DSP.
 *
 * Split out from `parsers.test.ts` rather than folded into it because the three
 * Task 1.5 AMCs happen to agree on every unit and every phrasing, so that file's
 * table can hard-code "market values are in lakh" and "the exit load is 365
 * days". These seven deliberately do NOT agree — the whole reason there is one
 * adapter per AMC is that the disclosures differ — so every assertion that
 * depends on a per-AMC convention is a column in the table below rather than a
 * literal in the test body. Merging the two tables would mean either weakening
 * those assertions to the intersection of all ten AMCs, or carrying seven
 * near-duplicate columns that mean nothing for the first three.
 *
 * As with Task 1.5, every fixture under `test/fixtures/mf/factsheet/<amc>/` is
 * synthetic — see the README in that folder. These tests pin the PARSERS'
 * behaviour, not the AMCs' real formats.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal } from '@portfolioos/shared';
import { csvToGrid, buildAmfiMarketCapLookup } from '../../../src/adapters/mfFactsheet/normalise.js';
import {
  parseNipponPortfolio,
  parseNipponSchemeFacts,
} from '../../../src/adapters/mfFactsheet/nippon.parse.js';
import {
  parseKotakPortfolio,
  parseKotakSchemeFacts,
} from '../../../src/adapters/mfFactsheet/kotak.parse.js';
import {
  parseAxisPortfolio,
  parseAxisSchemeFacts,
} from '../../../src/adapters/mfFactsheet/axis.parse.js';
import {
  parseUtiPortfolio,
  parseUtiSchemeFacts,
} from '../../../src/adapters/mfFactsheet/uti.parse.js';
import {
  parseAbslPortfolio,
  parseAbslSchemeFacts,
} from '../../../src/adapters/mfFactsheet/absl.parse.js';
import {
  parseMiraePortfolio,
  parseMiraeSchemeFacts,
} from '../../../src/adapters/mfFactsheet/mirae.parse.js';
import {
  parseDspPortfolio,
  parseDspSchemeFacts,
} from '../../../src/adapters/mfFactsheet/dsp.parse.js';
import type {
  MfFactsheetResult,
  PortfolioParseInput,
  PortfolioRaw,
  SchemeFactsParseInput,
  SchemeFactsRaw,
} from '../../../src/adapters/mfFactsheet/types.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtureDir = (amc: string) => resolve(here, '../../fixtures/mf/factsheet', amc);

async function grid(amc: string, file: string): Promise<string[][]> {
  return csvToGrid(await readFile(resolve(fixtureDir(amc), file), 'utf-8'));
}
async function text(amc: string, file: string): Promise<string> {
  return readFile(resolve(fixtureDir(amc), file), 'utf-8');
}

const MAR_2026 = new Date(Date.UTC(2026, 2, 31));

/** A tiny AMFI list, so the market-cap path is exercised without a database. */
const capLookup = buildAmfiMarketCapLookup(new Date(Date.UTC(2026, 0, 1)), [
  { isin: 'INE040A01034', bucket: 'LARGE' },
  { isin: 'INE090A01021', bucket: 'LARGE' },
  { isin: 'INE002A01018', bucket: 'LARGE' },
  { isin: 'INE467B01029', bucket: 'MID' },
  { isin: 'INE044A01036', bucket: 'SMALL' },
]);

interface AmcUnderTest {
  amc: string;
  amcCode: string;
  adapterId: string;
  parsePortfolio: (i: PortfolioParseInput) => MfFactsheetResult<PortfolioRaw>;
  parseFacts: (i: SchemeFactsParseInput) => MfFactsheetResult<SchemeFactsRaw>;
  /** The regular-plan TER printed in `factsheet-normal.txt`. */
  regularTer: string;
  directTer: string;
  /** The month-end AUM printed in `factsheet-normal.txt`, in crore. */
  aumCrore: string;
  managerCount: number;
  /**
   * The units the fixture's market-value column is quoted in — the single
   * per-AMC fact with no downstream check behind it. Every fixture holds the
   * SAME economic position (HDFC Bank at ₹23.4567 crore), written in the AMC's
   * own units, so `234567000` is the right answer for all seven and a unit
   * mistake in the spec shows up as a factor of 100 or 100,000.
   */
  marketValueUnit: 'LAKH' | 'CRORE' | 'RUPEE';
  /**
   * Expected issuer for the first G-Sec row of `portfolio-debt-normal.csv`.
   * ABSL is the only AMC that discloses an `Issuer` COLUMN; for the rest the
   * issuer is derived from the coupon-prefixed instrument name, which strips to
   * "GOI".
   */
  gsecIssuer: string;
  /**
   * `daysUpTo` of the single exit-load rung. 365 for AMCs that phrase the
   * window in days or years, 360 for those that phrase it in MONTHS —
   * `parseExitLoad` converts months at the conventional 30 days, which is a
   * shared decision and deliberately not special-cased per AMC.
   */
  exitLoadDays: number;
}

const AMCS: readonly AmcUnderTest[] = [
  {
    amc: 'nippon',
    amcCode: 'NIPPON',
    adapterId: 'mf.factsheet.nippon',
    parsePortfolio: parseNipponPortfolio,
    parseFacts: parseNipponSchemeFacts,
    regularTer: '1.62',
    directTer: '0.78',
    aumCrore: '34567.89',
    managerCount: 1,
    marketValueUnit: 'LAKH',
    gsecIssuer: 'GOI',
    exitLoadDays: 365,
  },
  {
    amc: 'kotak',
    amcCode: 'KOTAK',
    adapterId: 'mf.factsheet.kotak',
    parsePortfolio: parseKotakPortfolio,
    parseFacts: parseKotakSchemeFacts,
    regularTer: '1.72',
    directTer: '0.62',
    aumCrore: '12400.00',
    managerCount: 1,
    marketValueUnit: 'CRORE',
    gsecIssuer: 'GOI',
    exitLoadDays: 365,
  },
  {
    amc: 'axis',
    amcCode: 'AXIS',
    adapterId: 'mf.factsheet.axis',
    parsePortfolio: parseAxisPortfolio,
    parseFacts: parseAxisSchemeFacts,
    regularTer: '1.68',
    directTer: '0.61',
    aumCrore: '21345.60',
    managerCount: 2,
    marketValueUnit: 'RUPEE',
    gsecIssuer: 'GOI',
    exitLoadDays: 365,
  },
  {
    amc: 'uti',
    amcCode: 'UTI',
    adapterId: 'mf.factsheet.uti',
    parsePortfolio: parseUtiPortfolio,
    parseFacts: parseUtiSchemeFacts,
    regularTer: '1.29',
    directTer: '0.99',
    aumCrore: '3456.78',
    managerCount: 1,
    marketValueUnit: 'LAKH',
    gsecIssuer: 'GOI',
    exitLoadDays: 360,
  },
  {
    amc: 'absl',
    amcCode: 'ABSL',
    adapterId: 'mf.factsheet.absl',
    parsePortfolio: parseAbslPortfolio,
    parseFacts: parseAbslSchemeFacts,
    regularTer: '1.85',
    directTer: '0.95',
    aumCrore: '9900.12',
    managerCount: 2,
    marketValueUnit: 'LAKH',
    // The only AMC with a disclosed issuer column — the walker must prefer it
    // over `deriveIssuer(securityName)`.
    gsecIssuer: 'Government of India',
    exitLoadDays: 365,
  },
  {
    amc: 'mirae',
    amcCode: 'MIRAE',
    adapterId: 'mf.factsheet.mirae',
    parsePortfolio: parseMiraePortfolio,
    parseFacts: parseMiraeSchemeFacts,
    regularTer: '1.55',
    directTer: '0.54',
    aumCrore: '45210.30',
    managerCount: 2,
    marketValueUnit: 'LAKH',
    gsecIssuer: 'GOI',
    exitLoadDays: 365,
  },
  {
    amc: 'dsp',
    amcCode: 'DSP',
    adapterId: 'mf.factsheet.dsp',
    parsePortfolio: parseDspPortfolio,
    parseFacts: parseDspSchemeFacts,
    regularTer: '1.71',
    directTer: '0.71',
    aumCrore: '15432.10',
    managerCount: 1,
    marketValueUnit: 'LAKH',
    gsecIssuer: 'GOI',
    exitLoadDays: 360,
  },
];

for (const amc of AMCS) {
  describe(`${amc.amcCode} portfolio parser`, () => {
    it('parses the normal equity disclosure', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '200001',
        rows: await grid(amc.amc, 'portfolio-equity-normal.csv'),
        expectedAsOf: MAR_2026,
        marketCapLookup: capLookup,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      const p = result.data;
      expect(p.amcCode).toBe(amc.amcCode);
      expect(p.sourceAdapter).toBe(amc.adapterId);
      expect(p.sourceAdapterVer).toBe('1.0.0');
      expect(p.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      // Every fixture states its as-of in a DIFFERENT format — "31-Mar-2026",
      // "31/03/2026", "31-03-2026", "March 31, 2026" — and all four must land
      // on the same UTC midnight. A month-swapped read of "31/03" would be
      // caught here and nowhere else downstream.
      expect(p.asOf.toISOString()).toBe('2026-03-31T00:00:00.000Z');

      // 10 equity + TREPS + net receivables. Sub Total / Grand Total skipped.
      expect(p.holdings).toHaveLength(12);
      expect(p.totalHoldings).toBe(12);
      expect(p.holdings.filter((h) => h.kind === 'EQUITY')).toHaveLength(10);
      expect(p.holdings.filter((h) => h.kind === 'CASH')).toHaveLength(2);
      expect(p.rowFailures).toEqual([]);

      // cashPct is RECOMPUTED from kind === CASH, not read off the AMC's line.
      expect(new Decimal(p.cashPct).toFixed(2)).toBe('4.80');

      const hdfcBank = p.holdings.find((h) => h.isin === 'INE040A01034');
      expect(hdfcBank?.securityName).toContain('HDFC Bank');
      expect(hdfcBank?.sector).toBe('Banks');
      expect(hdfcBank?.marketCapBucket).toBe('LARGE');
      expect(new Decimal(hdfcBank?.weightPct ?? '0').toFixed(2)).toBe('12.40');
      expect(hdfcBank?.quantity).not.toBeNull();
      expect(new Decimal(hdfcBank?.quantity ?? '0').toFixed(0)).toBe('120000');
      // The unit test that has no downstream backstop: lakh (×1e5), crore
      // (×1e7) and plain rupees (×1) must all reach the SAME rupee figure.
      expect(new Decimal(hdfcBank?.marketValue ?? '0').toFixed(0)).toBe('234567000');
      // Equity rows carry no debt attributes.
      expect(hdfcBank?.creditRating).toBeNull();
      expect(hdfcBank?.issuer).toBeNull();

      // A stock absent from the seeded AMFI list is unclassified, not guessed.
      const infosys = p.holdings.find((h) => h.isin === 'INE009A01021');
      expect(infosys?.marketCapBucket).toBeNull();
      expect(
        p.notes.some(
          (n) => n.code === 'UNCLASSIFIED_MARKET_CAP' && n.detail.includes('INE009A01021'),
        ),
      ).toBe(true);

      // The negative net-receivables weight survives with its sign.
      const net = p.holdings.find((h) => new Decimal(h.weightPct).isNegative());
      expect(net?.kind).toBe('CASH');
    });

    it('parses the debt disclosure with issuer, rating, maturity and YTM', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '200002',
        rows: await grid(amc.amc, 'portfolio-debt-normal.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      const debt = result.data.holdings.filter((h) => h.kind === 'DEBT');
      expect(debt).toHaveLength(8);

      const gsec = debt.find((h) => h.securityName.startsWith('7.26%'));
      expect(gsec?.creditRating).toBe('SOV');
      expect(gsec?.issuer).toBe(amc.gsecIssuer);
      expect(gsec?.maturityDate?.toISOString()).toBe('2033-08-22T00:00:00.000Z');
      expect(new Decimal(gsec?.ytmPct ?? '0').toFixed(2)).toBe('7.11');
      // Debt rows carry no sector or market-cap bucket.
      expect(gsec?.sector).toBeNull();
      expect(gsec?.marketCapBucket).toBeNull();

      // Agency prefixes, outlook suffixes and (CE) markers all normalise —
      // through the SHARED ladder in `mfMetricsMath.ts`, so ingest and the
      // metrics layer cannot disagree about the same holding.
      const grades = debt.map((h) => h.creditRating);
      expect(grades).toEqual(['SOV', 'SOV', 'AAA', 'AAA', 'AA_PLUS', 'AA_MINUS', 'AAA', 'AAA']);
    });

    it('parses the hybrid disclosure across two section transitions', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '200003',
        rows: await grid(amc.amc, 'portfolio-hybrid-normal.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      const byKind = (k: string) => result.data.holdings.filter((h) => h.kind === k).length;
      expect(byKind('EQUITY')).toBe(4);
      expect(byKind('DEBT')).toBe(3);
      expect(byKind('CASH')).toBe(2);
      // The bond ISSUED BY HDFC Bank must NOT be filed as a share IN it.
      const bond = result.data.holdings.find((h) => h.securityName.startsWith('8.15%'));
      expect(bond?.kind).toBe('DEBT');
    });

    it('rejects the whole snapshot when weights fall outside 97–103%', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '200004',
        rows: await grid(amc.amc, 'portfolio-weights-sum-fail.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('WEIGHTS_SUM');
      expect(result.detail).toContain('80.0000');
      expect(result.detail).toContain('01 §6');
    });

    it('reports a truncated export as MALFORMED_INPUT, not an empty snapshot', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '200005',
        rows: await grid(amc.amc, 'portfolio-truncated-malformed.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('MALFORMED_INPUT');
    });

    it('is idempotent: the same input hashes the same', async () => {
      const rows = await grid(amc.amc, 'portfolio-equity-normal.csv');
      const a = amc.parsePortfolio({ schemeCode: '200001', rows, expectedAsOf: MAR_2026 });
      const b = amc.parsePortfolio({ schemeCode: '200001', rows, expectedAsOf: MAR_2026 });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.data.sourceHash).toBe(b.data.sourceHash);
    });

    it('hashes differently for a different scheme', async () => {
      const rows = await grid(amc.amc, 'portfolio-equity-normal.csv');
      const a = amc.parsePortfolio({ schemeCode: '200001', rows, expectedAsOf: MAR_2026 });
      const b = amc.parsePortfolio({ schemeCode: '999999', rows, expectedAsOf: MAR_2026 });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.data.sourceHash).not.toBe(b.data.sourceHash);
    });
  });

  describe(`${amc.amcCode} factsheet parser`, () => {
    it('reads the REGULAR plan TER when asked for the regular plan', async () => {
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(new Decimal(result.data.terPct ?? '0').toFixed(2)).toBe(amc.regularTer);
      expect(result.data.terEffectiveFrom?.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    });

    it('reads the DIRECT plan TER when asked for the direct plan', async () => {
      // The per-AMC traps this covers: Nippon states the two plans as a bare
      // "a% / b%" pair with no "Direct" token next to the number, and DSP writes
      // the number BEFORE the plan label. In both, a pattern of the usual shape
      // returns the regular plan's TER — silently, and in the direction that
      // misprices the cheaper plan.
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'DIRECT',
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(new Decimal(result.data.terPct ?? '0').toFixed(2)).toBe(amc.directTer);
    });

    it('refuses to guess the TER when the plan is not stated', async () => {
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.terPct).toBeNull();
      expect(result.data.notes.some((n) => n.field === 'terPct')).toBe(true);
    });

    it('converts AUM from crore to rupees and records the basis', async () => {
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = new Decimal(amc.aumCrore).times(10_000_000);
      expect(new Decimal(result.data.aum ?? '0').toFixed(2)).toBe(expected.toFixed(2));
      // Month-end must win over the monthly-average line on the same page —
      // they are different numbers measured differently, and conflating them
      // corrupts `aumGrowth12mPct` in a way nothing downstream can detect.
      expect(result.data.aumBasis).toBe('MONTH_END');
    });

    it('reads the fund managers and their start dates', async () => {
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Separators exercised across the table: "and" (Axis), "&" (Mirae),
      // ";" (ABSL), and the "w.e.f." date introducer (UTI).
      expect(result.data.managers).toHaveLength(amc.managerCount);
      for (const m of result.data.managers) {
        expect(m.managerName.length).toBeGreaterThan(3);
        // No stray "(Managing this fund" left on the name, which would make
        // every monthly refresh look like a manager change.
        expect(m.managerName).not.toContain('(');
        expect(m.fromDate).not.toBeNull();
      }
    });

    it('reads the exit-load ladder and the riskometer', async () => {
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Percent-first ("1% if redeemed within 365 days") and window-first
      // ("within 1 year ... - 1%") phrasings must both reach the same ladder.
      expect(result.data.exitLoadRules).toEqual([
        { daysUpTo: amc.exitLoadDays, pct: '1.000000' },
      ]);
      // Mirae writes "Risk-o-meter"; the rest write "Riskometer".
      expect(result.data.riskometer).toBe('Very High');
      expect(result.data.minSip).not.toBeNull();
    });

    it('rejects a TER outside 0.01–3.0% with reason TER_RANGE', async () => {
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: await text(amc.amc, 'factsheet-ter-out-of-range.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('TER_RANGE');
      expect(result.detail).toContain('01 §6');
    });

    it('returns MALFORMED_INPUT for empty text rather than throwing', () => {
      const result = amc.parseFacts({ schemeCode: '200001', text: '   ' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('MALFORMED_INPUT');
    });

    it('returns PORTAL_CHANGED when nothing on the page matches', () => {
      // `expectedAsOf` is supplied so the as-of is NOT the reason this fails —
      // otherwise every AMC would need its own date line here and the test would
      // be asserting date parsing rather than format detection.
      const result = amc.parseFacts({
        schemeCode: '200001',
        text: 'This page has been redesigned and says nothing useful.',
        planType: 'REGULAR',
        expectedAsOf: MAR_2026,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('PORTAL_CHANGED');
      // The message must name the file to fix, because "it broke" is not
      // actionable at 2am and "correct the patterns in <amc>.parse.ts" is.
      expect(result.detail).toContain(`${amc.amcCode.toLowerCase()}.parse.ts`);
    });
  });
}
