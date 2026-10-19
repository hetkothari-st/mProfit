/**
 * EMI schedule as a file. Stateless: the caller's input is re-validated and
 * recomputed by the route; this module only lays out a LoanSummary.
 *
 * Excel keeps machine-friendly cells (real Date cells shown dd/mm/yyyy,
 * numeric money) so sorting and formulas work. PDF uses `Rs.` because
 * PDFKit's Helvetica has no rupee glyph (see receipts/format.ts).
 */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { groupScheduleByFy, formatDateOnly, type LoanSummary, type LoanInputWire, type TaxInputWire } from '@everypaisa/shared';
import { inr } from '../../receipts/format.js';

export interface ExportMeta { title: string; input: LoanInputWire; tax?: TaxInputWire }

/** Exact label the spec asks for: let-out excess interest is shown, never valued as tax saved. */
export const CARRIED_FORWARD_LABEL = 'Excess interest (carried forward, not valued)';

const MONEY_FMT = '#,##,##0.00';
const money2 = (d: { toFixed(dp: number): string }) => d.toFixed(2);
/** Excel stores doubles; converting here, at the file boundary, is the only Number on money. */
const cellMoney = (d: { toFixed(dp: number): string }) => Number(d.toFixed(2));
/** Rates are not money; a plain double with 2-dp display is fine for a spreadsheet cell. */
const cellRate = (d: { toString(): string }) => Number(d.toString());
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const RATE_FMT = '0.00';
const isLetOut = (meta: ExportMeta) => meta.tax?.loanKind === 'HOME_LET_OUT';

/** "From month 13: 9% (keep EMI)" lines for the summary. */
function rateChangeLines(meta: ExportMeta): string[] {
  return [...(meta.input.rateChanges ?? [])]
    .sort((a, b) => a.fromMonth - b.fromMonth)
    .map((c) => `From month ${c.fromMonth}: ${c.annualRatePct}% (${c.mode === 'REDUCE_TENURE' ? 'keep EMI' : 'keep tenure'})`);
}

export async function buildEmiXlsx(s: LoanSummary, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Summary');
  sum.getCell('A1').value = `${meta.title} - EMI summary`;
  sum.getCell('A1').font = { bold: true, size: 14 };
  const RATE_KEYS = new Set(['Interest rate (% p.a.)', 'APR (%)', 'Nominal rate (% p.a.)']);
  const lines: [string, number | string][] = [
    ['Loan amount', cellMoney(s.schedule[0]?.opening ?? s.totalPrincipal)],
    ['Interest rate (% p.a.)', cellRate(s.schedule[0]?.ratePct ?? 0)],
    ['Tenure (months)', s.months],
    ['EMI', cellMoney(s.emi)],
    ['Total interest', cellMoney(s.totalInterest)],
    ['Total prepaid', cellMoney(s.totalPrepaid)],
    ['Fees and charges', cellMoney(s.fees.total)],
    ['Total cost', cellMoney(s.totalCost)],
    ['APR (%)', cellRate(s.aprPct)],
    ['Nominal rate (% p.a.)', cellRate(s.nominalPct)],
  ];
  if (s.tax && s.postTaxCost) {
    lines.push(['Tax saved', cellMoney(s.tax.totalTaxSaved)], ['Cost after tax', cellMoney(s.postTaxCost)]);
  }
  rateChangeLines(meta).forEach((l, i) => lines.push([i === 0 ? 'Rate changes' : '', l]));
  lines.forEach(([k, v], i) => {
    const row = sum.getRow(i + 3);
    row.getCell(1).value = k;
    row.getCell(2).value = v;
    if (typeof v === 'number' && !/months/.test(k)) row.getCell(2).numFmt = RATE_KEYS.has(k) ? RATE_FMT : MONEY_FMT;
  });
  sum.getColumn(1).width = 26;
  sum.getColumn(2).width = 18;

  const sh = wb.addWorksheet('Schedule');
  sh.addRow(['Month', 'Date', 'Opening', 'EMI', 'Interest', 'Principal', 'Prepayment', 'Closing', 'Rate %']);
  sh.getRow(1).font = { bold: true };
  for (const r of s.schedule) {
    const row = sh.addRow([
      r.month, isoToDate(r.date), cellMoney(r.opening), cellMoney(r.emi), cellMoney(r.interest),
      cellMoney(r.principal), cellMoney(r.prepayment), cellMoney(r.closing), cellRate(r.ratePct),
    ]);
    row.getCell(2).numFmt = 'dd/mm/yyyy';
    for (let c = 3; c <= 8; c++) row.getCell(c).numFmt = MONEY_FMT;
    row.getCell(9).numFmt = RATE_FMT;
  }
  sh.columns.forEach((col) => { col.width = 14; });
  sh.views = [{ state: 'frozen', ySplit: 1 }];

  if (s.tax) {
    const tx = wb.addWorksheet('Tax');
    const letOut = isLetOut(meta);
    tx.addRow(['FY', 'Interest deduction', 'Principal (80C) deduction', 'Tax saved', ...(letOut ? [CARRIED_FORWARD_LABEL] : [])]);
    tx.getRow(1).font = { bold: true };
    for (const y of s.tax.years) {
      const row = tx.addRow([
        y.fy, cellMoney(y.interestDeduction), cellMoney(y.principalDeduction), cellMoney(y.taxSaved),
        ...(letOut ? [cellMoney(y.carriedForward)] : []),
      ]);
      for (let c = 2; c <= (letOut ? 5 : 4); c++) row.getCell(c).numFmt = MONEY_FMT;
    }
    tx.columns.forEach((col, i) => { col.width = i === 0 ? 10 : 24; });
    if (s.tax.note) tx.addRow([s.tax.note]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildEmiPdf(s: LoanSummary, meta: ExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(`${meta.title} - EMI schedule`);
    doc.moveDown(0.5).fontSize(10).font('Helvetica');
    const facts: [string, string][] = [
      ['Loan amount', inr(money2(s.totalPrincipal.plus(s.totalPrepaid)))],
      ['Interest rate', `${meta.input.annualRatePct}% p.a.`],
      ['Tenure', `${s.months} months`],
      ['First EMI', formatDateOnly(meta.input.firstEmiDate)],
      ['EMI', inr(money2(s.emi))],
      ['Total interest', inr(money2(s.totalInterest))],
      ['Fees and charges', inr(money2(s.fees.total))],
      ['Total cost', inr(money2(s.totalCost))],
      ['APR', `${s.aprPct.toFixed(2)}% (nominal ${s.nominalPct.toFixed(2)}% p.a.)`],
    ];
    if (s.tax && s.postTaxCost) facts.push(['Tax saved', inr(money2(s.tax.totalTaxSaved))], ['Cost after tax', inr(money2(s.postTaxCost))]);
    const changes = rateChangeLines(meta);
    if (changes.length > 0) facts.push(['Rate changes', changes.join('; ')]);
    for (const [k, v] of facts) doc.text(`${k}: ${v}`);

    const drawRow = (cols: number[], cells: string[], leftCols: number, bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      let x = doc.page.margins.left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      cells.forEach((c, i) => { doc.text(c, x, y, { width: cols[i]!, align: i < leftCols ? 'left' : 'right' }); x += cols[i]!; });
      doc.x = doc.page.margins.left;
      doc.y = y + 12;
    };

    if (s.tax) {
      const letOut = isLetOut(meta);
      const taxCols = letOut ? [50, 95, 95, 80, 200] : [60, 120, 130, 100];
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).text('Tax benefit by year', doc.page.margins.left);
      drawRow(taxCols, ['FY', 'Interest deduction', 'Principal (80C)', 'Tax saved', ...(letOut ? [CARRIED_FORWARD_LABEL] : [])], 1, true);
      for (const y of s.tax.years) {
        drawRow(taxCols, [
          y.fy, inr(money2(y.interestDeduction)), inr(money2(y.principalDeduction)), inr(money2(y.taxSaved)),
          ...(letOut ? [inr(money2(y.carriedForward))] : []),
        ], 1);
      }
      if (s.tax.note) doc.font('Helvetica').fontSize(8).text(s.tax.note, doc.page.margins.left);
    }

    const cols = [28, 58, 72, 72, 72, 70, 86, 40];
    const header = ['#', 'Date', 'EMI', 'Interest', 'Principal', 'Prepaid', 'Balance', 'Rate %'];
    for (const g of groupScheduleByFy(s.schedule)) {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).text(`FY ${g.fy}`, doc.page.margins.left);
      drawRow(cols, header, 2, true);
      for (const r of g.rows) {
        drawRow(cols, [
          String(r.month), formatDateOnly(r.date), inr(money2(r.emi)), inr(money2(r.interest)), inr(money2(r.principal)),
          inr(money2(r.prepayment)), inr(money2(r.closing)), r.ratePct.toFixed(2),
        ], 2);
      }
    }
    doc.moveDown().fontSize(8).font('Helvetica').fillColor('#5B6572')
      .text('Indicative calculation. Your lender\'s schedule may differ slightly by rounding and dates.', doc.page.margins.left);
    doc.end();
  });
}
