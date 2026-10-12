import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { summariseLoan, loanFromWire, type LoanInputWire } from '@everypaisa/shared';
import { buildEmiXlsx, buildEmiPdf } from '../../src/services/emi/emiExport.js';

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
