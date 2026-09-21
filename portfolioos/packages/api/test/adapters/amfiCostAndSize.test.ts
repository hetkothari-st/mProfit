import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  latestTerByScheme,
  normaliseSchemeName,
  parseTerDate,
  parseTerWorkbook,
} from '../../src/priceFeeds/amfiTer.parse.js';
import {
  lakhToRupees,
  parseFundWiseAmcNames,
  parseSchemeWiseAum,
} from '../../src/priceFeeds/amfiAum.parse.js';

/**
 * Parsed against files actually downloaded from AMFI on 21 Sept 2026, sliced
 * but not rewritten. A fixture invented from an assumed format proves only that
 * the parser agrees with the assumption.
 */

const FIXTURES = join(__dirname, '..', 'fixtures', 'amfi');

describe('AMFI TER workbook', () => {
  const buffer = readFileSync(join(FIXTURES, 'ter-aug2026-sample.xlsx'));

  it('reads the real published columns', () => {
    const { rows, skipped } = parseTerWorkbook(buffer);
    expect(rows.length).toBeGreaterThan(20);
    expect(skipped).toEqual([]);
    const row = rows[0]!;
    expect(row.schemeName).toBeTruthy();
    expect(row.nsdlSchemeCode).toBeTruthy();
    expect(row.asOf.getUTCFullYear()).toBe(2026);
  });

  // The whole point of the direct-plan rule: the file gives both, and taking
  // the wrong column would hand the client a commission-bearing cost.
  it('takes the direct-plan TER, which is lower than the regular one', () => {
    const { rows } = parseTerWorkbook(buffer);
    const withBoth = rows.filter((r) => r.directTerPct != null && r.regularTerPct != null);
    expect(withBoth.length).toBeGreaterThan(10);
    for (const r of withBoth) {
      expect(r.directTerPct!).toBeLessThanOrEqual(r.regularTerPct!);
    }
  });

  it('keeps TER inside a believable band', () => {
    const { rows } = parseTerWorkbook(buffer);
    for (const r of rows) {
      if (r.directTerPct == null) continue;
      expect(r.directTerPct).toBeGreaterThanOrEqual(0);
      expect(r.directTerPct).toBeLessThanOrEqual(5);
    }
  });

  // The file carries every day of the month; the figure in force is the last
  // one, and picking it deterministically is what makes two runs agree.
  it('keeps the latest dated row per scheme', () => {
    const { rows } = parseTerWorkbook(buffer);
    const latest = latestTerByScheme(rows);
    expect(latest.size).toBeGreaterThan(0);
    for (const [key, row] of latest) {
      const sameScheme = rows.filter((r) => r.nameKey === key && r.directTerPct != null);
      const newest = Math.max(...sameScheme.map((r) => r.asOf.getTime()));
      expect(row.asOf.getTime()).toBe(newest);
    }
  });

  it('refuses a workbook whose columns it does not recognise, rather than guessing', () => {
    // A single-column sheet: every required header is missing.
    const XLSX = require('xlsx') as typeof import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Something Else'], ['x']]), 'Sheet1');
    const bad = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const { rows, skipped } = parseTerWorkbook(bad);
    expect(rows).toEqual([]);
    expect(skipped[0]?.reason).toBe('unexpected_columns');
  });

  it('parses AMFI date format and rejects nonsense', () => {
    expect(parseTerDate('01-Aug-2026')?.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(parseTerDate('not a date')).toBeNull();
  });

  it('normalises names the same way on both sides of the join', () => {
    expect(normaliseSchemeName('HDFC Index Fund-NIFTY 50 Plan')).toBe('hdfc index fund nifty 50 plan');
    // The apostrophe is deleted, not spaced: NAVAll writes "Children's" and
    // the TER workbook has been seen writing "Childrens", and a fund should
    // not lose its TER over a typographical convention.
    expect(normaliseSchemeName("Axis Children's Fund")).toBe('axis childrens fund');
    expect(normaliseSchemeName('AXIS CHILDRENS FUND')).toBe('axis childrens fund');
  });
});

describe('AMFI scheme-wise AUM', () => {
  const payload = JSON.parse(readFileSync(join(FIXTURES, 'aum-schemewise-360one.json'), 'utf8'));

  it('reads real scheme rows keyed by AMFI scheme code', () => {
    const { rows } = parseSchemeWiseAum(payload);
    expect(rows.length).toBeGreaterThan(10);
    for (const r of rows) {
      expect(r.schemeCode).toMatch(/^\d+$/);
      expect(r.amcName).toBeTruthy();
    }
  });

  // AMFI publishes lakh. A ₹51 crore fund read as ₹5,099 would pass any size
  // floor ever configured.
  it('converts the published lakh figures to rupees', () => {
    const { rows } = parseSchemeWiseAum(payload);
    const known = rows.find((r) => r.schemeCode === '151165');
    expect(known).toBeTruthy();
    // 5099.77 lakh = ₹50.99 crore
    expect(known!.aumInr.toNumber()).toBeCloseTo(509_977_000, 0);
    expect(lakhToRupees(1).toNumber()).toBe(100_000);
  });

  it('skips a scheme with no AMFI code instead of inventing one', () => {
    const { rows, skipped } = parseSchemeWiseAum({
      data: [{ Mfname: 'X', SchemeCat_Desc: 'Y', schemes: [{ SchemeNAVName: 'No code fund' }] }],
    });
    expect(rows).toEqual([]);
    expect(skipped[0]?.reason).toBe('missing_amfi_code');
  });

  it('ignores the grand-total group, which is a summary and not data', () => {
    const { rows } = parseSchemeWiseAum({
      data: [{ Mfname: 'Grand Total', SchemeCat_Desc: 'Total', schemes: [] }],
    });
    expect(rows).toEqual([]);
  });

  it('reports an unexpected payload rather than returning nothing quietly', () => {
    const { skipped } = parseSchemeWiseAum({ nope: true });
    expect(skipped[0]?.reason).toBe('unexpected_payload');
  });

  it('lists the AMCs to iterate, from the real fund-wise response', () => {
    const fundwise = JSON.parse(readFileSync(join(FIXTURES, 'aum-fundwise.json'), 'utf8'));
    const names = parseFundWiseAmcNames(fundwise);
    expect(names.length).toBeGreaterThan(30);
    expect(names).toContain('360 ONE Mutual Fund');
    expect(names.some((n) => /grand total/i.test(n))).toBe(false);
  });
});
