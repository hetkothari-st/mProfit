import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import type { Response } from 'express';
// @ts-expect-error - no bundled types match this import form; already a repo dependency (CAS parsing).
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const baseTaxSummary = {
  financialYear: '2024-25',
  rates: {
    stcgEquityPct: 20,
    ltcgEquityPct: 12.5,
    ltcgEquityExemption: '125000',
    ltcgOtherIndexedPct: 20,
    ltcgOtherNonIndexedPct: 12.5,
    slabPct: 30,
  },
  capitalGains: {
    section111A_stcgEquity: { gain: '82400', tax: '16480' },
    section112A_ltcgEquity: { gain: '287000', exemption: '125000', taxable: '162000', tax: '20250' },
    section112_ltcgOther: { gain: '53740', taxable: '53740', tax: '6718' },
    stcgOther: { gain: '0', tax: '0' },
    intradaySpeculative: { gain: '0', tax: '0' },
  },
  fnoBusinessIncome: { netPnl: '0', turnover: '0', tax: '0', auditApplicable: false },
  otherIncome: { dividend: '8240', interest: '3100', maturity: '0' },
  totalRealisedGain: '423140',
  totalEstimatedTax: '43448',
  availableFys: ['2024-25'],
};

const populatedHarvestRow = {
  portfolioId: 'p1',
  portfolioName: 'My Portfolio',
  assetClass: 'EQUITY',
  assetName: 'Infosys Ltd',
  isin: 'INE009A01021',
  quantity: '100',
  avgCostPrice: '1500',
  currentPrice: '1316',
  totalCost: '150000',
  currentValue: '131600',
  unrealisedPnL: '-18400',
  pctReturn: '-12.27',
  longTermEligible: false,
  classification: 'STCG_LOSS' as const,
};

vi.mock('../../src/services/tax.service.js', () => ({
  buildTaxSummary: vi.fn(async () => baseTaxSummary),
  taxHarvestReport: vi.fn(async () => ({
    rows: [populatedHarvestRow],
    totals: {},
    savings: {},
  })),
}));

vi.mock('../../src/services/reportBuilder/statement/capitalGains.js', () => ({
  buildCapitalGainsStatement: vi.fn(async () => ({
    mainSectionLabel: 'Intraday (Speculative)',
    columns: [{ header: 'Asset', key: 'asset', width: 10 }],
    rows: [],
    additionalSections: [
      {
        title: 'Short-Term Capital Gains',
        columns: [{ header: 'Asset', key: 'asset', width: 10 }],
        rows: [{ asset: 'Infosys Ltd' }],
      },
      {
        title: 'Long-Term Capital Gains',
        columns: [{ header: 'Asset', key: 'asset', width: 10 }],
        rows: [],
      },
    ],
  })),
}));

function fakeResponse() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      cb();
    },
  });
  const res = Object.assign(stream, {
    setHeader: (k: string, v: string) => { headers[k] = v; },
  });
  return { res: res as unknown as Response, chunks, headers };
}

describe('streamCapitalGainsTaxReport smoke test', () => {
  it('renders a valid PDF with populated data (mixed empty/non-empty detail sections)', async () => {
    const { streamCapitalGainsTaxReport } = await import(
      '../../src/services/reportBuilder/statement/capitalGainsTaxReport.js'
    );
    const { res, chunks, headers } = fakeResponse();

    // PDFKit's doc.pipe(res) expects a writable stream; wire 'end'/'error'
    // listeners registered via res.on to actually resolve/reject.
    await streamCapitalGainsTaxReport(res, {
      userId: 'u1',
      portfolioIds: [],
      fy: '2024-25',
      userName: 'Het Kothari',
      pan: 'XXXXX1234X',
    });

    const pdf = Buffer.concat(chunks);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(headers['Content-Disposition']).toContain('everypaisa-capital-gains-tax-2024-25.pdf');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);

    const parsed = await pdfParse(pdf);
    // Cover page content actually present.
    expect(parsed.text).toContain('Capital Gains Tax Report');
    expect(parsed.text).toContain('Het Kothari');
    expect(parsed.text).toContain('Rs. 4,23,140.00'); // total realised gain
    expect(parsed.text).toContain('Infosys Ltd'); // harvesting candidate
    expect(parsed.text).toContain('DISCLAIMER');
    // Detail page: STCG section has rows, LTCG section is empty — the
    // empty one must show "No records", not silently vanish or crash.
    expect(parsed.text).toContain('Short-Term Capital Gains');
    expect(parsed.text).toContain('Long-Term Capital Gains');
    expect(parsed.text).toContain('No records to display.');
  });

  it('renders without crashing when every detail section is empty', async () => {
    vi.resetModules();
    vi.doMock('../../src/services/tax.service.js', () => ({
      buildTaxSummary: vi.fn(async () => ({ ...baseTaxSummary, totalRealisedGain: '0', totalEstimatedTax: '0' })),
      taxHarvestReport: vi.fn(async () => ({ rows: [], totals: {}, savings: {} })),
    }));
    vi.doMock('../../src/services/reportBuilder/statement/capitalGains.js', () => ({
      buildCapitalGainsStatement: vi.fn(async () => ({
        mainSectionLabel: 'Intraday (Speculative)',
        columns: [{ header: 'Asset', key: 'asset', width: 10 }],
        rows: [],
        additionalSections: [
          { title: 'Short-Term Capital Gains', columns: [{ header: 'Asset', key: 'asset', width: 10 }], rows: [] },
          { title: 'Long-Term Capital Gains', columns: [{ header: 'Asset', key: 'asset', width: 10 }], rows: [] },
        ],
      })),
    }));

    const { streamCapitalGainsTaxReport } = await import(
      '../../src/services/reportBuilder/statement/capitalGainsTaxReport.js'
    );
    const { res, chunks } = fakeResponse();

    await streamCapitalGainsTaxReport(res, {
      userId: 'u1',
      portfolioIds: [],
      fy: '2024-25',
    });

    const pdf = Buffer.concat(chunks);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);

    const parsed = await pdfParse(pdf);
    expect(parsed.text).toContain('No open holdings to report.');
    expect(parsed.text).toContain('No capital gains transactions recorded for this financial year.');
  });
});
