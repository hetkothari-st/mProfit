import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import * as reports from '../../src/controllers/reports.controller.js';
import { runAsUser } from '../../src/lib/requestContext.js';
import { fakeRequest, fakeResponse } from '../helpers/fakeResponse.js';
import { seedReportData, type SeededReports } from '../helpers/seedReportData.js';

/**
 * Every downloaded file says how current its figures are. The dashboard
 * export carries the same "Data as of / Data checks" lines as the report
 * downloads; section exports (live records) carry the moment they were read,
 * in IST.
 */
async function sheetText(handler: typeof reports.getDashboardExport, userId: string, query: Record<string, string>) {
  const captured = fakeResponse();
  await runAsUser(userId, () => handler(fakeRequest(userId, { ...query, format: 'xlsx' }), captured.res));
  await captured.finished;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(captured.body());
  const lines: string[] = [];
  wb.worksheets[0]!.eachRow((row) => {
    lines.push(
      (row.values as unknown[])
        .filter((v) => v != null && v !== '')
        .map(String)
        .join(' | '),
    );
  });
  return lines;
}

describe('download stamps', () => {
  let seed: SeededReports;

  beforeAll(async () => {
    seed = await seedReportData();
  }, 120_000);
  afterAll(async () => {
    await seed.cleanup();
  });

  it('the dashboard export says how current and how checked its figures are', async () => {
    const lines = await sheetText(reports.getDashboardExport, seed.userId, { portfolioId: 'all' });
    expect(lines.some((l) => /^Data as of: transactions to \d{4}-\d{2}-\d{2}/.test(l))).toBe(true);
    expect(lines.some((l) => l.startsWith('Data checks: '))).toBe(true);
  }, 120_000);

  it('a section export says when its records were read, in IST', async () => {
    const lines = await sheetText(reports.getSectionExport, seed.userId, { section: 'loans' });
    const stamp = lines.find((l) => l.startsWith('Data as of'));
    expect(stamp).toMatch(/IST|\d{1,2}:\d{2}/);
    expect(lines.some((l) => l.startsWith('Generated On'))).toBe(false);
  }, 120_000);
});
