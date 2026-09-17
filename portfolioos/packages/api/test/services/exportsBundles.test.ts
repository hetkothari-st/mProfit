import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import { isValidFinancialYear } from '@everypaisa/shared';
import { excelSheetName, setExcelValue } from '../../src/services/excelCells.js';
import { streamExcel, fmtNum, type ExportPayload } from '../../src/services/export.service.js';
import { buildPayloadForSubjects } from '../../src/services/reports/reportSubjects.js';
import { passbookBalance } from '../../src/services/reportBuilder/statement/providentFund.js';

/** Capture what an export writes to the response, as a buffer. */
async function capture(write: (res: Response) => Promise<void>): Promise<Buffer> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (c: Buffer) => chunks.push(c));
  const res = Object.assign(stream, { setHeader: () => res }) as unknown as Response;
  await write(res);
  return Buffer.concat(chunks);
}

describe('Excel output', () => {
  it('makes a sheet name Excel accepts from any report title', () => {
    expect(excelSheetName('Trial Balance As On 17/09/2026')).toBe('Trial Balance As On 17-09-2026');
    expect(excelSheetName('XIRR / Performance Report As On 17/09/2026').length).toBeLessThanOrEqual(31);
    expect(excelSheetName('[*?]')).toBe('----');
    expect(excelSheetName("''")).toBe('Report');
  });

  it('writes formatted amounts as numbers the sheet can add up', () => {
    const ws = new ExcelJS.Workbook().addWorksheet('x');
    const money = ws.getCell('A1');
    setExcelValue(money, '123456.785', '1,23,456.79');
    expect(money.value).toBe(123456.785);
    expect(money.numFmt).toBe('#,##,##0.00;(#,##,##0.00)');
    const negative = ws.getCell('A2');
    setExcelValue(negative, '-500', '(500.00)');
    expect(negative.value).toBe(-500);
    const date = ws.getCell('A3');
    setExcelValue(date, '2025-04-01', '01/04/2025');
    expect(date.value).toBe('01/04/2025');
  });

  it('includes every additional section, not just the main table', async () => {
    const payload: ExportPayload = {
      title: 'Capital Gains Statement 2024/25',
      columns: [{ key: 'name', header: 'Asset' }, { key: 'gain', header: 'Gain', formatter: (v) => fmtNum(v) }],
      rows: [{ name: 'Intraday X', gain: '100' }],
      additionalSections: [
        { title: 'Short-term', columns: [{ key: 'name', header: 'Asset' }, { key: 'gain', header: 'Gain', formatter: (v) => fmtNum(v) }], rows: [{ name: 'STCG Y', gain: '2500' }] },
        { title: 'Long-term', columns: [{ key: 'name', header: 'Asset' }, { key: 'gain', header: 'Gain', formatter: (v) => fmtNum(v) }], rows: [{ name: 'LTCG Z', gain: '40000' }] },
      ],
    };
    const buffer = await capture((res) => streamExcel(res, payload));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0]!;
    const texts: unknown[] = [];
    ws.eachRow((row) => row.eachCell((cell) => texts.push(cell.value)));
    expect(ws.name).toBe('Capital Gains Statement 2024-25');
    expect(texts).toEqual(expect.arrayContaining(['Short-term', 'STCG Y', 2500, 'Long-term', 'LTCG Z', 40000]));
  });
});

describe('household statements', () => {
  it('keeps every member’s rows in the additional sections, tagged by member', async () => {
    const built: Record<string, ExportPayload> = {
      a: {
        title: 'Capital gains', columns: [{ key: 'name', header: 'Asset' }], rows: [],
        meta: { 'Financial Year': '2024-25', Sells: 1 },
        additionalSections: [{ title: 'Short-term', columns: [{ key: 'name', header: 'Asset' }], rows: [{ name: 'A stcg' }] }, { title: 'Long-term', columns: [{ key: 'name', header: 'Asset' }], rows: [] }],
      },
      b: {
        title: 'Capital gains', columns: [{ key: 'name', header: 'Asset' }], rows: [],
        meta: { 'Financial Year': '2024-25', Sells: 3 },
        additionalSections: [{ title: 'Short-term', columns: [{ key: 'name', header: 'Asset' }], rows: [] }, { title: 'Long-term', columns: [{ key: 'name', header: 'Asset' }], rows: [{ name: 'B ltcg' }] }],
      },
    };
    const merged = await buildPayloadForSubjects(
      { subjects: [{ userId: 'a', label: 'Alice' }, { userId: 'b', label: 'Bob' }], isFamily: true, via: 'SELF', familyLabel: 'Home' },
      async (userId) => built[userId]!,
    );
    const lt = merged.additionalSections!.find((s) => s.title === 'Long-term')!;
    expect(lt.rows).toEqual([{ member: 'Bob', name: 'B ltcg' }]);
    expect(lt.columns[0]!.key).toBe('member');
    expect(merged.additionalSections!.find((s) => s.title === 'Short-term')!.rows).toEqual([{ member: 'Alice', name: 'A stcg' }]);
    expect(merged.meta).toMatchObject({ 'Financial Year': '2024-25', 'Alice — Sells': 1, 'Bob — Sells': 3 });
  });
});

describe('financial year input', () => {
  it('accepts only consecutive years', () => {
    expect(isValidFinancialYear('2025-26')).toBe(true);
    expect(isValidFinancialYear('1999-00')).toBe(true);
    expect(isValidFinancialYear('2025-27')).toBe(false);
    expect(isValidFinancialYear('2025')).toBe(false);
  });
});

describe('provident fund balance', () => {
  it('uses each employer’s latest opening balance plus later movements, not every year’s opening', () => {
    const e = (eventType: string, date: string, amount: string, member = '1111') => ({
      eventType, eventDate: new Date(date), amount, metadata: { memberIdLast4: member },
    });
    const balance = passbookBalance([
      e('PF_OPENING_BALANCE', '2023-04-01', '100000'),
      e('PF_EMPLOYEE_CONTRIBUTION', '2023-05-01', '5000'),
      e('PF_OPENING_BALANCE', '2024-04-01', '110000'),
      e('PF_EMPLOYEE_CONTRIBUTION', '2024-05-01', '6000'),
      e('PF_WITHDRAWAL', '2024-06-01', '1000'),
      e('PF_OPENING_BALANCE', '2024-04-01', '20000', '2222'),
    ]);
    expect(balance.toString()).toBe('135000');
  });
});
