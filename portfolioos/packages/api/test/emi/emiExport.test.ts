import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { summariseLoan, loanFromWire, taxFromWire, type LoanInputWire, type TaxInputWire } from '@everypaisa/shared';
import { buildEmiXlsx, buildEmiPdf, CARRIED_FORWARD_LABEL } from '../../src/services/loans/emi/emiExport.js';

const input: LoanInputWire = { principal: '100000', annualRatePct: '12', tenureMonths: 12, firstEmiDate: '2026-11-05' };
const summary = summariseLoan(loanFromWire(input));

describe('buildEmiXlsx', () => {
  it('writes a summary sheet and a schedule with real date and number cells', async () => {
    const buf = await buildEmiXlsx(summary, { title: 'Home loan', input });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sched = wb.getWorksheet('Schedule')!;
    expect(sched.rowCount).toBe(1 + 12);
    const first = sched.getRow(2);
    expect(first.getCell(2).value).toBeInstanceOf(Date);
    expect(first.getCell(2).numFmt).toBe('dd/mm/yyyy');
    expect(typeof first.getCell(4).value).toBe('number');
    const s = wb.getWorksheet('Summary')!;
    expect(String(s.getCell('A1').value)).toContain('Home loan');
  });
});

describe('buildEmiPdf', () => {
  it('produces a PDF', async () => {
    const buf = await buildEmiPdf(summary, { title: 'Home loan', input });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });
});

describe('exports with tax, prepayments and a rate change', () => {
  const full: LoanInputWire = {
    principal: '2500000', annualRatePct: '8.5', tenureMonths: 240, firstEmiDate: '2026-11-05',
    prepayments: [{ month: 12, amount: '200000', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }],
    rateChanges: [{ fromMonth: 13, annualRatePct: '9', mode: 'REDUCE_TENURE' }],
  };
  const tax: TaxInputWire = { regime: 'OLD', loanKind: 'HOME_LET_OUT', slabPct: '30', remaining80C: '150000' };
  const s = summariseLoan(loanFromWire(full), taxFromWire(tax));

  it('xlsx: numeric rate cells and a Tax sheet with one numeric row per FY', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildEmiXlsx(s, { title: 'Home loan', input: full, tax }));
    const sched = wb.getWorksheet('Schedule')!;
    expect(sched.getRow(2).getCell(9).value).toBe(8.5);
    expect(sched.getRow(14).getCell(9).value).toBe(9);
    const sum = wb.getWorksheet('Summary')!;
    const summaryRows = new Map<string, unknown>();
    sum.eachRow((r) => summaryRows.set(String(r.getCell(1).value), r.getCell(2).value));
    expect(summaryRows.get('Interest rate (% p.a.)')).toBe(8.5);
    expect(typeof summaryRows.get('APR (%)')).toBe('number');
    expect(String(summaryRows.get('Rate changes'))).toContain('From month 13: 9%');

    const tx = wb.getWorksheet('Tax')!;
    expect(tx.getRow(1).getCell(5).value).toBe(CARRIED_FORWARD_LABEL);
    expect(tx.getRow(2).getCell(1).value).toBe(s.tax!.years[0]!.fy);
    for (let c = 2; c <= 5; c++) expect(typeof tx.getRow(2).getCell(c).value).toBe('number');
    expect(tx.getRow(2).getCell(4).value).toBe(Number(s.tax!.years[0]!.taxSaved.toFixed(2)));
    expect(tx.rowCount).toBe(1 + s.tax!.years.length);
  });

  it('pdf builds with the tax section, rate column and rate-change line', async () => {
    const buf = await buildEmiPdf(s, { title: 'Home loan', input: full, tax });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
