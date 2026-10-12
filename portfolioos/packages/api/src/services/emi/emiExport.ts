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
import { groupScheduleByFy, formatDateOnly, type LoanSummary, type LoanInputWire } from '@everypaisa/shared';
import { inr } from '../receipts/format.js';

export interface ExportMeta { title: string; input: LoanInputWire }

const MONEY_FMT = '#,##,##0.00';
const money2 = (d: { toFixed(dp: number): string }) => d.toFixed(2);
/** Excel stores doubles; converting here, at the file boundary, is the only Number on money. */
const cellMoney = (d: { toFixed(dp: number): string }) => Number(d.toFixed(2));
const isoToDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function buildEmiXlsx(s: LoanSummary, meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Summary');
  sum.getCell('A1').value = `${meta.title} - EMI summary`;
  sum.getCell('A1').font = { bold: true, size: 14 };
  const lines: [string, number | string][] = [
    ['Loan amount', cellMoney(s.schedule[0]?.opening ?? s.totalPrincipal)],
    ['Interest rate (% p.a.)', meta.input.annualRatePct],
    ['Tenure (months)', s.months],
    ['EMI', cellMoney(s.emi)],
    ['Total interest', cellMoney(s.totalInterest)],
    ['Total prepaid', cellMoney(s.totalPrepaid)],
    ['Fees and charges', cellMoney(s.fees.total)],
    ['Total cost', cellMoney(s.totalCost)],
    ['APR (%)', s.aprPct.toFixed(2)],
  ];
  if (s.tax && s.postTaxCost) {
    lines.push(['Tax saved', cellMoney(s.tax.totalTaxSaved)], ['Cost after tax', cellMoney(s.postTaxCost)]);
  }
  lines.forEach(([k, v], i) => {
    const row = sum.getRow(i + 3);
    row.getCell(1).value = k;
    row.getCell(2).value = v;
    if (typeof v === 'number' && !/months/.test(k)) row.getCell(2).numFmt = MONEY_FMT;
  });
  sum.getColumn(1).width = 26;
  sum.getColumn(2).width = 18;

  const sh = wb.addWorksheet('Schedule');
  sh.addRow(['Month', 'Date', 'Opening', 'EMI', 'Interest', 'Principal', 'Prepayment', 'Closing', 'Rate %']);
  sh.getRow(1).font = { bold: true };
  for (const r of s.schedule) {
    const row = sh.addRow([
      r.month, isoToDate(r.date), cellMoney(r.opening), cellMoney(r.emi), cellMoney(r.interest),
      cellMoney(r.principal), cellMoney(r.prepayment), cellMoney(r.closing), r.ratePct.toString(),
    ]);
    row.getCell(2).numFmt = 'dd/mm/yyyy';
    for (let c = 3; c <= 8; c++) row.getCell(c).numFmt = MONEY_FMT;
  }
  sh.columns.forEach((col) => { col.width = 14; });
  sh.views = [{ state: 'frozen', ySplit: 1 }];
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
      ['APR', `${s.aprPct.toFixed(2)}%`],
    ];
    if (s.tax && s.postTaxCost) facts.push(['Tax saved', inr(money2(s.tax.totalTaxSaved))], ['Cost after tax', inr(money2(s.postTaxCost))]);
    for (const [k, v] of facts) doc.text(`${k}: ${v}`);

    const cols = [40, 70, 80, 75, 75, 80, 95];
    const header = ['#', 'Date', 'EMI', 'Interest', 'Principal', 'Prepaid', 'Balance'];
    const drawRow = (cells: string[], bold = false) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      let x = doc.page.margins.left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      cells.forEach((c, i) => { doc.text(c, x, y, { width: cols[i]!, align: i < 2 ? 'left' : 'right' }); x += cols[i]!; });
      doc.x = doc.page.margins.left;
      doc.y = y + 12;
    };

    for (const g of groupScheduleByFy(s.schedule)) {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(10).text(`FY ${g.fy}`, doc.page.margins.left);
      drawRow(header, true);
      for (const r of g.rows) {
        drawRow([String(r.month), formatDateOnly(r.date), inr(money2(r.emi)), inr(money2(r.interest)), inr(money2(r.principal)), inr(money2(r.prepayment)), inr(money2(r.closing))]);
      }
    }
    doc.moveDown().fontSize(8).font('Helvetica').fillColor('#5B6572')
      .text('Indicative calculation. Your lender\'s schedule may differ slightly by rounding and dates.', doc.page.margins.left);
    doc.end();
  });
}
