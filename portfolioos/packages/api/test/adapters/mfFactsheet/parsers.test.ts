/**
 * Fixture tests for the three AMC portfolio/factsheet parsers.
 *
 * Every fixture in `test/fixtures/mf/factsheet/<amc>/` is exercised here. The
 * fixtures are synthetic-but-representative — see the README in that folder —
 * so these tests pin the PARSERS' behaviour, not the AMCs' real formats.
 */

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal } from '@portfolioos/shared';
import { csvToGrid, buildAmfiMarketCapLookup } from '../../../src/adapters/mfFactsheet/normalise.js';
import { parseSbiPortfolio, parseSbiSchemeFacts } from '../../../src/adapters/mfFactsheet/sbi.parse.js';
import {
  parseIciciPortfolio,
  parseIciciSchemeFacts,
} from '../../../src/adapters/mfFactsheet/icici.parse.js';
import {
  parseHdfcPortfolio,
  parseHdfcSchemeFacts,
} from '../../../src/adapters/mfFactsheet/hdfc.parse.js';
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
  /** The AUM printed in `factsheet-normal.txt`, in crore. */
  aumCrore: string;
  managerCount: number;
}

const AMCS: readonly AmcUnderTest[] = [
  {
    amc: 'sbi',
    amcCode: 'SBI',
    adapterId: 'mf.factsheet.sbi',
    parsePortfolio: parseSbiPortfolio,
    parseFacts: parseSbiSchemeFacts,
    regularTer: '1.45',
    directTer: '0.75',
    aumCrore: '45678.90',
    managerCount: 1,
  },
  {
    amc: 'icici',
    amcCode: 'ICICI_PRU',
    adapterId: 'mf.factsheet.iciciPru',
    parsePortfolio: parseIciciPortfolio,
    parseFacts: parseIciciSchemeFacts,
    regularTer: '1.51',
    directTer: '0.86',
    aumCrore: '63988.10',
    managerCount: 2,
  },
  {
    amc: 'hdfc',
    amcCode: 'HDFC',
    adapterId: 'mf.factsheet.hdfc',
    parsePortfolio: parseHdfcPortfolio,
    parseFacts: parseHdfcSchemeFacts,
    regularTer: '1.44',
    directTer: '0.77',
    aumCrore: '64120.44',
    managerCount: 1,
  },
];

for (const amc of AMCS) {
  describe(`${amc.amcCode} portfolio parser`, () => {
    it('parses the normal equity disclosure', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '100001',
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
      // "Rs. in Lakhs"/"Lacs" → rupees: 2,345.67 lakh = 234,567,000.
      expect(new Decimal(hdfcBank?.marketValue ?? '0').toFixed(0)).toBe('234567000');
      // Equity rows carry no debt attributes.
      expect(hdfcBank?.creditRating).toBeNull();
      expect(hdfcBank?.issuer).toBeNull();

      // A stock absent from the seeded AMFI list is unclassified, not guessed.
      const infosys = p.holdings.find((h) => h.isin === 'INE009A01021');
      expect(infosys?.marketCapBucket).toBeNull();
      expect(
        p.notes.some((n) => n.code === 'UNCLASSIFIED_MARKET_CAP' && n.detail.includes('INE009A01021')),
      ).toBe(true);

      // The negative net-receivables weight survives with its sign.
      const net = p.holdings.find((h) => new Decimal(h.weightPct).isNegative());
      expect(net?.kind).toBe('CASH');
    });

    it('parses the debt disclosure with issuer, rating, maturity and YTM', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '100002',
        rows: await grid(amc.amc, 'portfolio-debt-normal.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      const debt = result.data.holdings.filter((h) => h.kind === 'DEBT');
      expect(debt).toHaveLength(8);

      const gsec = debt.find((h) => h.securityName.startsWith('7.26%'));
      expect(gsec?.creditRating).toBe('SOV');
      // Issuer strips the coupon prefix and the trailing year, so two tranches
      // of the same issuer's paper group together in topIssuerPct.
      expect(gsec?.issuer).toBe('GOI');
      expect(gsec?.maturityDate?.toISOString()).toBe('2033-08-22T00:00:00.000Z');
      expect(new Decimal(gsec?.ytmPct ?? '0').toFixed(2)).toBe('7.11');
      // Debt rows carry no sector or market-cap bucket.
      expect(gsec?.sector).toBeNull();
      expect(gsec?.marketCapBucket).toBeNull();

      // Agency prefixes, outlook suffixes and (CE) markers all normalise.
      const grades = debt.map((h) => h.creditRating);
      expect(grades).toEqual([
        'SOV',
        'SOV',
        'AAA',
        'AAA',
        'AA_PLUS',
        'AA_MINUS',
        'AAA',
        'AAA',
      ]);
    });

    it('parses the hybrid disclosure across two section transitions', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '100003',
        rows: await grid(amc.amc, 'portfolio-hybrid-normal.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      const byKind = (k: string) => result.data.holdings.filter((h) => h.kind === k).length;
      expect(byKind('EQUITY')).toBe(4);
      expect(byKind('DEBT')).toBe(3);
      expect(byKind('CASH')).toBe(2);
      // The bond issued by HDFC Bank must NOT be filed as equity.
      const bond = result.data.holdings.find((h) => h.securityName.startsWith('8.15%'));
      expect(bond?.kind).toBe('DEBT');
    });

    it('rejects the whole snapshot when weights fall outside 97–103%', async () => {
      const result = amc.parsePortfolio({
        schemeCode: '100004',
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
        schemeCode: '100005',
        rows: await grid(amc.amc, 'portfolio-truncated-malformed.csv'),
        expectedAsOf: MAR_2026,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('MALFORMED_INPUT');
    });

    it('is idempotent: the same input hashes the same', async () => {
      const rows = await grid(amc.amc, 'portfolio-equity-normal.csv');
      const a = amc.parsePortfolio({ schemeCode: '100001', rows, expectedAsOf: MAR_2026 });
      const b = amc.parsePortfolio({ schemeCode: '100001', rows, expectedAsOf: MAR_2026 });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.data.sourceHash).toBe(b.data.sourceHash);
    });

    it('hashes differently for a different scheme', async () => {
      const rows = await grid(amc.amc, 'portfolio-equity-normal.csv');
      const a = amc.parsePortfolio({ schemeCode: '100001', rows, expectedAsOf: MAR_2026 });
      const b = amc.parsePortfolio({ schemeCode: '999999', rows, expectedAsOf: MAR_2026 });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.data.sourceHash).not.toBe(b.data.sourceHash);
    });
  });

  describe(`${amc.amcCode} factsheet parser`, () => {
    it('reads the REGULAR plan TER when asked for the regular plan', async () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(new Decimal(result.data.terPct ?? '0').toFixed(2)).toBe(amc.regularTer);
      expect(result.data.terEffectiveFrom?.toISOString()).toBe('2026-03-31T00:00:00.000Z');
    });

    it('reads the DIRECT plan TER when asked for the direct plan', async () => {
      // For ICICI this is the trap: "Other than Direct 1.51% | Direct 0.86%".
      // A naive /Direct ([\d.]+)%/ reports 1.51 here — the regular plan's TER
      // presented as the direct plan's, in the direction that makes the fund
      // look cheaper.
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'DIRECT',
      });
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;
      expect(new Decimal(result.data.terPct ?? '0').toFixed(2)).toBe(amc.directTer);
    });

    it('refuses to guess the TER when the plan is not stated', async () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.terPct).toBeNull();
      expect(result.data.notes.some((n) => n.field === 'terPct')).toBe(true);
    });

    it('converts AUM from crore to rupees and records the basis', async () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expected = new Decimal(amc.aumCrore).times(10_000_000);
      expect(new Decimal(result.data.aum ?? '0').toFixed(2)).toBe(expected.toFixed(2));
      // Month-end must win over the monthly-average line on the same page.
      expect(result.data.aumBasis).toBe('MONTH_END');
    });

    it('reads the fund managers and their start dates', async () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.managers).toHaveLength(amc.managerCount);
      for (const m of result.data.managers) {
        expect(m.managerName.length).toBeGreaterThan(3);
        // No stray "(Managing this fund" left on the name, which would make
        // every refresh look like a manager change.
        expect(m.managerName).not.toContain('(');
        expect(m.fromDate).not.toBeNull();
      }
    });

    it('reads the exit-load ladder', async () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-normal.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.exitLoadRules).toEqual([
        { daysUpTo: 365, pct: '1.000000' },
      ]);
      expect(result.data.riskometer).toBe('Very High');
      expect(result.data.minSip).not.toBeNull();
    });

    it('rejects a TER outside 0.01–3.0% with reason TER_RANGE', async () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: await text(amc.amc, 'factsheet-ter-out-of-range.txt'),
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('TER_RANGE');
      expect(result.detail).toContain('01 §6');
    });

    it('returns MALFORMED_INPUT for empty text rather than throwing', () => {
      const result = amc.parseFacts({ schemeCode: '100001', text: '   ' });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('MALFORMED_INPUT');
    });

    it('returns PORTAL_CHANGED when nothing on the page matches', () => {
      const result = amc.parseFacts({
        schemeCode: '100001',
        text: 'Factsheet as on 31-Mar-2026\nThis page has been redesigned and says nothing useful.',
        planType: 'REGULAR',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('PORTAL_CHANGED');
    });
  });
}
