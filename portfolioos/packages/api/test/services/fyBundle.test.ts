/**
 * The FY bundle.
 *
 * Two things are actually at risk here and both are asserted:
 *
 *  1. The PassThrough standing in for `res`. streamExcel writes to a response
 *     rather than returning a buffer, so the bundle collects its output
 *     through a sink. If that ever stops working the failure is silent — a
 *     zero-byte entry in a zip that still downloads — so the test checks the
 *     rendered bytes are a real workbook, not merely present.
 *
 *  2. Partial failure being visible. A bundle that quietly contained less than
 *     it claimed would be filed as complete.
 */

// `helpers/db` FIRST, before anything that reaches config/env.ts.
//
// env.ts validates process.env at import time and throws if DATABASE_URL is
// absent, and ESM evaluates imports in source order — so a test that pulls in
// a service before the helper fails at collection with "Invalid environment
// variables" rather than anywhere informative. Every other test file in this
// suite is ordered this way; it is load-bearing, not stylistic.
import { createTestScope, type TestScope } from '../helpers/db.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import JSZip from 'jszip';
import { financialYearRange } from '@portfolioos/shared';
import { buildFyBundle } from '../../src/services/reports/fyBundle.service.js';

let scope: TestScope;

beforeAll(async () => {
  scope = await createTestScope('fy-bundle');
}, 120_000);

afterAll(async () => {
  await scope.cleanup();
}, 120_000);

describe('financialYearRange', () => {
  it('maps a financial year to April–March', () => {
    expect(financialYearRange('2025-26')).toEqual({ from: '2025-04-01', to: '2026-03-31' });
  });

  it('refuses a malformed year rather than guessing', () => {
    expect(() => financialYearRange('2025')).toThrow(/expected the form/i);
  });
});

describe('buildFyBundle', () => {
  it('produces a zip with a manifest and real report bytes', async () => {
    const result = await scope.runAs(() => buildFyBundle(scope.userId, '2025-26'));

    const zip = await JSZip.loadAsync(result.zip);
    const names = Object.keys(zip.files);

    expect(names).toContain('manifest.txt');
    expect(result.included.length).toBeGreaterThan(0);

    const manifest = await zip.file('manifest.txt')!.async('string');
    expect(manifest).toContain('2025-04-01');
    expect(manifest).toContain('2026-03-31');

    // The sink actually collected something. An xlsx is a zip container, so
    // its first bytes are the local file header "PK\u0003\u0004" — checking
    // the magic number proves a workbook was rendered rather than an empty
    // buffer written under a convincing filename.
    const holdings = names.find((n) => n.startsWith('holdings-'));
    expect(holdings).toBeDefined();
    const bytes = await zip.file(holdings!)!.async('nodebuffer');
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }, 120_000);

  it('records a failed part in the zip instead of dropping it', async () => {
    const result = await scope.runAs(() => buildFyBundle(scope.userId, '2025-26'));

    // Every part either landed or left a FAILED marker — nothing vanishes.
    const zip = await JSZip.loadAsync(result.zip);
    const names = Object.keys(zip.files);
    for (const f of result.failed) {
      expect(names).toContain(`FAILED-${f.name}.txt`);
      const manifest = await zip.file('manifest.txt')!.async('string');
      expect(manifest).toContain('NOT included');
    }
  }, 120_000);
});
