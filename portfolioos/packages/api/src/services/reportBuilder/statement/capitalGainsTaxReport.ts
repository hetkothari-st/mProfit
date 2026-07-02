/**
 * CA-ready capital gains tax report PDF.
 *
 * Two phases in one continuous landscape A4 document:
 *   1. Summary cover page — tax breakdown, unrealised snapshot, harvesting
 *      candidates. Custom PDFKit layout (not shared with streamPdf, since
 *      the mix of metric cards + multiple distinct tables is unique to
 *      this report).
 *   2. Transaction detail pages — sections from buildCapitalGainsStatement()
 *      re-rendered onto new pages of the same document (we can't call
 *      streamPdf() here since that opens its own PDFDocument/pipe).
 */

import PDFDocument from 'pdfkit';
import { Decimal } from 'decimal.js';
import type { Response } from 'express';
import { BRAND, pdfSafe } from '../../charts/pdfCharts.js';
import { fmtNum } from '../../export.service.js';
import { buildTaxSummary, taxHarvestReport } from '../../tax.service.js';
import { buildCapitalGainsStatement } from './capitalGains.js';

export interface CapitalGainsTaxReportParams {
  userId: string;
  portfolioIds: string[]; // empty = all
  fy: string; // e.g. "2024-25"
  userName?: string;
  pan?: string;
}

const TABLE_HEADER_BG = '#DDE3EC'; // matches export.service.ts renderTable header row
const HEADER_MUTED = '#94AECB'; // matches export.service.ts renderPageHeader muted-on-dark text

export async function streamCapitalGainsTaxReport(
  res: Response,
  params: CapitalGainsTaxReportParams,
): Promise<void> {
  // ─── PHASE 0 — fetch all data up front ────────────────────────────
  const [taxSummary, harvestData, cgStatement] = await Promise.all([
    buildTaxSummary(params.userId, params.fy),
    taxHarvestReport(params.userId, params.fy),
    buildCapitalGainsStatement({
      userId: params.userId,
      portfolioIds: params.portfolioIds,
      fy: params.fy,
      kind: 'all',
    }),
  ]);

  const unrealisedRows = harvestData.rows;
  type UnrealisedRow = (typeof unrealisedRows)[number];

  const isEquityClass = (r: UnrealisedRow): boolean =>
    ['EQUITY', 'ETF', 'MUTUAL_FUND'].includes(r.assetClass);

  const unrealisedGroups = {
    stcgEquity: unrealisedRows.filter((r) => r.classification === 'STCG_GAIN' && isEquityClass(r)),
    ltcgEquity: unrealisedRows.filter((r) => r.classification === 'LTCG_GAIN' && isEquityClass(r)),
    stcgOther: unrealisedRows.filter((r) => r.classification === 'STCG_GAIN' && !isEquityClass(r)),
    ltcgOther: unrealisedRows.filter((r) => r.classification === 'LTCG_GAIN' && !isEquityClass(r)),
  };

  // Tax harvesting candidates — biggest unrealised loss first, top 10.
  const harvestCandidates = harvestData.rows
    .filter((r) => r.classification === 'STCG_LOSS' || r.classification === 'LTCG_LOSS')
    .sort((a, b) => new Decimal(a.unrealisedPnL).minus(new Decimal(b.unrealisedPnL)).toNumber())
    .slice(0, 10);

  // ─── PHASE 1 — open PDFKit (landscape A4, single continuous doc) ──
  const filename = `portfolioos-capital-gains-tax-${params.fy}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  return new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape', bufferPages: true });
    doc.on('end', resolve);
    doc.on('error', reject);
    res.on('error', reject);
    doc.pipe(res);

    const ML = doc.page.margins.left;
    const pageW = doc.page.width - ML - doc.page.margins.right;
    const pageH = doc.page.height;
    const BOT = pageH - 40;

    // ─── PHASE 2 — cover page rendering functions ───────────────────

    function renderHeaderBar(subtitle: string): number {
      doc.rect(0, 0, doc.page.width, 56).fill(BRAND.ink);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.white)
        .text('PortfolioOS', ML, 14, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(HEADER_MUTED)
        .text(subtitle, ML, 36, { lineBreak: false });
      const genStr = `Generated: ${new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      })}`;
      doc.font('Helvetica').fontSize(8.5).fillColor(HEADER_MUTED)
        .text(genStr, ML, 14, { align: 'right', width: pageW, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor(HEADER_MUTED)
        .text(`Financial Year: ${params.fy}`, ML, 38, { align: 'right', width: pageW, lineBreak: false });
      return 72;
    }

    function renderIdentityBand(cy: number): number {
      const bandH = 28;
      doc.rect(ML, cy, pageW, bandH).fill(BRAND.headerBg);
      doc.rect(ML, cy, 3, bandH).fill(BRAND.accent);

      const parts: Array<[string, string]> = [
        ['Member', pdfSafe(params.userName ?? 'Investor')],
        ['PAN', pdfSafe(params.pan ?? 'Not provided')],
        ['Financial Year', pdfSafe(params.fy)],
        ['Report as of', new Date().toLocaleDateString('en-IN')],
      ];
      const cellW = pageW / parts.length;
      parts.forEach(([label, value], i) => {
        const cx = ML + i * cellW;
        doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted)
          .text(label.toUpperCase(), cx + 10, cy + 6, { width: cellW - 12, characterSpacing: 0.4, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND.ink)
          .text(value, cx + 10, cy + 16, { width: cellW - 12, lineBreak: false });
      });
      return cy + bandH + 10;
    }

    function renderSummaryCards(cy: number): number {
      const gain = new Decimal(taxSummary.totalRealisedGain);
      const tax = new Decimal(taxSummary.totalEstimatedTax);
      const effectiveRate = gain.isZero() ? '—' : `${tax.dividedBy(gain).times(100).toFixed(1)}%`;
      const ltcgExemptLimit = new Decimal(taxSummary.rates.ltcgEquityExemption);
      const ltcgGain = new Decimal(taxSummary.capitalGains.section112A_ltcgEquity.gain);
      const exemptionUsed = Decimal.min(Decimal.max(ltcgGain, new Decimal(0)), ltcgExemptLimit);

      const cards = [
        {
          label: 'Net realised gain',
          value: `Rs. ${fmtNum(gain.toFixed(2))}`,
          sub: `FY ${params.fy}`,
          accent: gain.isNegative() ? BRAND.negative : BRAND.positive,
        },
        {
          label: 'Estimated tax liability',
          value: `Rs. ${fmtNum(tax.toFixed(2))}`,
          sub: 'Excl. surcharge & cess',
          accent: BRAND.accent,
        },
        {
          label: 'Effective tax rate',
          value: effectiveRate,
          sub: 'Tax / realised gain',
          accent: BRAND.accent,
        },
        {
          label: 'LTCG exemption used',
          value: `Rs. ${fmtNum(exemptionUsed.toFixed(2))}`,
          sub: `of Rs. ${fmtNum(ltcgExemptLimit.toFixed(2))} limit`,
          accent: exemptionUsed.gte(ltcgExemptLimit) ? BRAND.negative : BRAND.positive,
        },
      ];

      const gap = 8;
      const cardW = (pageW - gap * (cards.length - 1)) / cards.length;
      const cardH = 52;

      cards.forEach((card, i) => {
        const cx = ML + i * (cardW + gap);
        doc.rect(cx, cy, cardW, cardH).fill(BRAND.headerBg);
        doc.rect(cx, cy, 3, cardH).fill(card.accent);
        doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.muted)
          .text(card.label.toUpperCase(), cx + 10, cy + 9, { width: cardW - 14, characterSpacing: 0.4, lineBreak: false });
        doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND.ink)
          .text(card.value, cx + 10, cy + 22, { width: cardW - 14, lineBreak: false });
        doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted)
          .text(card.sub, cx + 10, cy + 39, { width: cardW - 14, lineBreak: false });
      });
      return cy + cardH + 14;
    }

    function renderSectionBand(cy: number, label: string): number {
      const H = 20;
      doc.rect(ML, cy, pageW, H).fill(BRAND.headerBg);
      doc.rect(ML, cy, 3, H).fill(BRAND.accent);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(BRAND.ink)
        .text(pdfSafe(label), ML + 10, cy + 6, { width: pageW - 18, lineBreak: false });
      return cy + H + 4;
    }

    function renderTaxBreakdownTable(cy: number): number {
      cy = renderSectionBand(cy, `Capital gains breakdown — FY ${params.fy}`);

      const cols: Array<{ label: string; w: number; right?: boolean }> = [
        { label: 'Section', w: 0.09 },
        { label: 'Description', w: 0.35 },
        { label: 'Gain', w: 0.14, right: true },
        { label: 'Taxable', w: 0.14, right: true },
        { label: 'Rate', w: 0.08, right: true },
        { label: 'Est. Tax', w: 0.20, right: true },
      ];
      const ROW_H = 17;
      const colWidths = cols.map((c) => c.w * pageW);

      doc.rect(ML, cy, pageW, ROW_H).fill(TABLE_HEADER_BG);
      let hx = ML;
      cols.forEach((c, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink)
          .text(c.label, hx + 4, cy + 5, { width: colWidths[i]! - 8, align: c.right ? 'right' : 'left', lineBreak: false });
        hx += colWidths[i]!;
      });
      cy += ROW_H;

      const cg = taxSummary.capitalGains;
      const rates = taxSummary.rates;

      const tableRows = [
        {
          section: 'Sec. 111A',
          desc: 'STCG on listed equity / equity MF (STT paid)',
          gain: cg.section111A_stcgEquity.gain,
          taxable: cg.section111A_stcgEquity.gain,
          rate: `${rates.stcgEquityPct}%`,
          tax: cg.section111A_stcgEquity.tax,
        },
        {
          section: 'Sec. 112A',
          desc: `LTCG on listed equity (exemption Rs.${fmtNum(cg.section112A_ltcgEquity.exemption)})`,
          gain: cg.section112A_ltcgEquity.gain,
          taxable: cg.section112A_ltcgEquity.taxable,
          rate: `${rates.ltcgEquityPct}%`,
          tax: cg.section112A_ltcgEquity.tax,
        },
        {
          section: 'Sec. 112',
          desc: 'LTCG on other assets (indexed 20% / non-indexed 12.5%)',
          gain: cg.section112_ltcgOther.gain,
          taxable: cg.section112_ltcgOther.taxable,
          rate: 'mixed',
          tax: cg.section112_ltcgOther.tax,
        },
        {
          section: 'Slab',
          desc: 'STCG on non-equity assets (debt, bonds, gold)',
          gain: cg.stcgOther.gain,
          taxable: cg.stcgOther.gain,
          rate: `${rates.slabPct}%`,
          tax: cg.stcgOther.tax,
        },
        {
          section: 'Sec. 43(5)',
          desc: 'Intraday speculative business income',
          gain: cg.intradaySpeculative.gain,
          taxable: cg.intradaySpeculative.gain,
          rate: `${rates.slabPct}%`,
          tax: cg.intradaySpeculative.tax,
        },
        {
          section: 'F&O',
          desc: `Non-speculative business income${taxSummary.fnoBusinessIncome.auditApplicable ? ' · Sec. 44AB audit applicable' : ''}`,
          gain: taxSummary.fnoBusinessIncome.netPnl,
          taxable: taxSummary.fnoBusinessIncome.netPnl,
          rate: `${rates.slabPct}%`,
          tax: taxSummary.fnoBusinessIncome.tax,
        },
      ];

      tableRows.forEach((r, idx) => {
        if (cy + ROW_H > BOT) {
          doc.addPage();
          cy = renderHeaderBar('Capital Gains Tax Report');
        }
        if (idx % 2 === 1) doc.rect(ML, cy, pageW, ROW_H).fill(BRAND.rowAlt);

        const cells = [
          { val: r.section, right: false },
          { val: r.desc, right: false },
          { val: `Rs. ${fmtNum(r.gain)}`, right: true },
          { val: `Rs. ${fmtNum(r.taxable)}`, right: true },
          { val: r.rate, right: true },
          { val: `Rs. ${fmtNum(r.tax)}`, right: true },
        ];
        // Only the Gain/Taxable/Est.Tax columns carry a numeric value to
        // sign-check; Section/Description/Rate are never coloured red.
        const numericSource: Array<string | null> = [null, null, r.gain, r.taxable, null, r.tax];
        let cx = ML;
        cells.forEach((cell, ci) => {
          const src = numericSource[ci];
          const isNeg = src != null && new Decimal(src).isNegative();
          doc.font('Helvetica').fontSize(8)
            .fillColor(isNeg ? BRAND.negative : BRAND.ink)
            .text(pdfSafe(cell.val), cx + 4, cy + 5, {
              width: colWidths[ci]! - 8,
              align: cell.right ? 'right' : 'left',
              lineBreak: false,
            });
          cx += colWidths[ci]!;
        });
        cy += ROW_H;
      });

      // Total row
      doc.rect(ML, cy, pageW, ROW_H + 2).fill(BRAND.accent);
      const totalCells = [
        { val: 'TOTAL', right: false },
        { val: '', right: false },
        { val: `Rs. ${fmtNum(taxSummary.totalRealisedGain)}`, right: true },
        { val: '', right: false },
        { val: '', right: false },
        { val: `Rs. ${fmtNum(taxSummary.totalEstimatedTax)}`, right: true },
      ];
      let tcx = ML;
      totalCells.forEach((cell, ci) => {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0D0D0D')
          .text(pdfSafe(cell.val), tcx + 4, cy + 6, {
            width: colWidths[ci]! - 8,
            align: cell.right ? 'right' : 'left',
            lineBreak: false,
          });
        tcx += colWidths[ci]!;
      });
      cy += ROW_H + 2 + 10;

      return cy;
    }

    function renderOtherIncome(cy: number): number {
      const oi = taxSummary.otherIncome;
      const total = new Decimal(oi.dividend).plus(new Decimal(oi.interest)).plus(new Decimal(oi.maturity));
      if (total.isZero()) return cy;

      cy = renderSectionBand(cy, 'Other income — taxed at slab rate (informational only)');
      const rowH = 16;
      const rows: Array<[string, string]> = [
        ['Dividends', oi.dividend],
        ['Interest income (FD, savings, bonds)', oi.interest],
        ['Maturity proceeds', oi.maturity],
      ];
      let idx = 0;
      rows.forEach(([label, val]) => {
        if (new Decimal(val).isZero()) return;
        if (idx % 2 === 1) doc.rect(ML, cy, pageW, rowH).fill(BRAND.rowAlt);
        idx += 1;
        doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
          .text(pdfSafe(label), ML + 10, cy + 4, { width: pageW * 0.6, lineBreak: false });
        doc.font('Helvetica').fontSize(8).fillColor(BRAND.ink)
          .text(`Rs. ${fmtNum(val)}`, ML + pageW * 0.6, cy + 4, { width: pageW * 0.38, align: 'right', lineBreak: false });
        cy += rowH;
      });
      return cy + 6;
    }

    function renderUnrealisedSnapshot(cy: number): number {
      cy = renderSectionBand(cy, 'Unrealised gains snapshot — as of today');

      const rowH = 16;
      const colW = [0.35, 0.15, 0.25, 0.25].map((w) => w * pageW);

      doc.rect(ML, cy, pageW, rowH).fill(TABLE_HEADER_BG);
      const hCells = ['Classification', 'Holdings', 'Unrealised gain', 'Est. tax if sold'];
      let hx = ML;
      hCells.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink)
          .text(h, hx + 4, cy + 5, { width: colW[i]! - 8, align: i > 0 ? 'right' : 'left', lineBreak: false });
        hx += colW[i]!;
      });
      cy += rowH;

      function sumUnrealised(rows: UnrealisedRow[]): Decimal {
        return rows.reduce((s, r) => s.plus(new Decimal(r.unrealisedPnL)), new Decimal(0));
      }
      function estTax(gain: Decimal, ratePct: number): Decimal {
        return Decimal.max(gain, new Decimal(0)).times(ratePct).dividedBy(100);
      }

      const ltcgExemptLimit = new Decimal(taxSummary.rates.ltcgEquityExemption);
      const ltcgGainAlreadyRealised = new Decimal(taxSummary.capitalGains.section112A_ltcgEquity.gain);
      const remainingExemption = Decimal.max(
        ltcgExemptLimit.minus(Decimal.max(ltcgGainAlreadyRealised, new Decimal(0))),
        new Decimal(0),
      );

      const stcgEquityGain = sumUnrealised(unrealisedGroups.stcgEquity);
      const ltcgEquityGain = sumUnrealised(unrealisedGroups.ltcgEquity);
      const ltcgEquityTaxableGain = Decimal.max(ltcgEquityGain.minus(remainingExemption), new Decimal(0));
      const stcgOtherGain = sumUnrealised(unrealisedGroups.stcgOther);
      const ltcgOtherGain = sumUnrealised(unrealisedGroups.ltcgOther);

      const snapshotRows = [
        {
          label: `STCG equity / MF (${taxSummary.rates.stcgEquityPct}%)`,
          count: unrealisedGroups.stcgEquity.length,
          gain: stcgEquityGain,
          tax: estTax(stcgEquityGain, taxSummary.rates.stcgEquityPct),
        },
        {
          label: `LTCG equity / MF (${taxSummary.rates.ltcgEquityPct}%, >${fmtNum(ltcgExemptLimit.toFixed(0))} taxable)`,
          count: unrealisedGroups.ltcgEquity.length,
          gain: ltcgEquityGain,
          tax: estTax(ltcgEquityTaxableGain, taxSummary.rates.ltcgEquityPct),
        },
        {
          label: 'STCG — other assets (slab 30%)',
          count: unrealisedGroups.stcgOther.length,
          gain: stcgOtherGain,
          tax: estTax(stcgOtherGain, taxSummary.rates.slabPct),
        },
        {
          label: `LTCG — other assets (${taxSummary.rates.ltcgOtherNonIndexedPct}%)`,
          count: unrealisedGroups.ltcgOther.length,
          gain: ltcgOtherGain,
          tax: estTax(ltcgOtherGain, taxSummary.rates.ltcgOtherNonIndexedPct),
        },
      ];

      let totalHoldings = 0;
      let totalGain = new Decimal(0);
      let totalTax = new Decimal(0);
      let rowIdx = 0;

      snapshotRows.forEach((r) => {
        if (r.count === 0) return;
        if (rowIdx % 2 === 1) doc.rect(ML, cy, pageW, rowH).fill(BRAND.rowAlt);
        rowIdx += 1;
        totalHoldings += r.count;
        totalGain = totalGain.plus(r.gain);
        totalTax = totalTax.plus(r.tax);

        let cx = ML;
        const vals = [r.label, String(r.count), `Rs. ${fmtNum(r.gain.toFixed(2))}`, `Rs. ${fmtNum(r.tax.toFixed(2))}`];
        vals.forEach((v, vi) => {
          doc.font('Helvetica').fontSize(8)
            .fillColor(vi === 2 && r.gain.isNegative() ? BRAND.negative : BRAND.ink)
            .text(pdfSafe(v), cx + 4, cy + 4, { width: colW[vi]! - 8, align: vi > 0 ? 'right' : 'left', lineBreak: false });
          cx += colW[vi]!;
        });
        cy += rowH;
      });

      doc.rect(ML, cy, pageW, rowH).fill(BRAND.border);
      let tx = ML;
      [`Total (${totalHoldings} holdings)`, '', `Rs. ${fmtNum(totalGain.toFixed(2))}`, `Rs. ${fmtNum(totalTax.toFixed(2))}`].forEach((v, vi) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor(BRAND.ink)
          .text(pdfSafe(v), tx + 4, cy + 4, { width: colW[vi]! - 8, align: vi > 0 ? 'right' : 'left', lineBreak: false });
        tx += colW[vi]!;
      });
      cy += rowH + 8;

      return cy;
    }

    function renderHarvestingSection(cy: number): number {
      if (harvestCandidates.length === 0) return cy;

      cy = renderSectionBand(cy, 'Tax-saving opportunities — unrealised losses available to harvest');

      const rowH = 16;
      const colW = [0.30, 0.12, 0.14, 0.14, 0.30].map((w) => w * pageW);
      const headers = ['Asset', 'Class', 'Unrealised loss', 'Est. tax offset', 'Note'];
      let hx = ML;
      doc.rect(ML, cy, pageW, rowH).fill(TABLE_HEADER_BG);
      headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BRAND.ink)
          .text(h, hx + 4, cy + 5, { width: colW[i]! - 8, align: i >= 2 && i <= 3 ? 'right' : 'left', lineBreak: false });
        hx += colW[i]!;
      });
      cy += rowH;

      harvestCandidates.forEach((r, idx) => {
        if (cy + rowH > BOT) return; // capped at 10 rows above; don't overflow this page
        if (idx % 2 === 1) doc.rect(ML, cy, pageW, rowH).fill(BRAND.rowAlt);

        const loss = new Decimal(r.unrealisedPnL).abs();
        const isStcgLoss = r.classification === 'STCG_LOSS';
        const taxRatePct = isStcgLoss ? taxSummary.rates.stcgEquityPct : taxSummary.rates.ltcgEquityPct;
        const taxOffset = loss.times(taxRatePct).dividedBy(100);
        const note = isStcgLoss
          ? `Offsets STCG — saves Rs.${fmtNum(taxOffset.toFixed(0))}`
          : `Offsets LTCG — saves Rs.${fmtNum(taxOffset.toFixed(0))}`;

        let cx = ML;
        [r.assetName, r.assetClass, `(Rs. ${fmtNum(loss.toFixed(2))})`, `Rs. ${fmtNum(taxOffset.toFixed(2))}`, note].forEach((v, vi) => {
          doc.font('Helvetica').fontSize(8)
            .fillColor(vi === 2 ? BRAND.negative : BRAND.ink)
            .text(pdfSafe(v), cx + 4, cy + 4, { width: colW[vi]! - 8, align: vi >= 2 && vi <= 3 ? 'right' : 'left', lineBreak: false });
          cx += colW[vi]!;
        });
        cy += rowH;
      });
      return cy + 8;
    }

    function renderDisclaimer(cy: number): number {
      if (cy + 60 > BOT) {
        doc.addPage();
        cy = 40;
      }
      const disclaimerText =
        'DISCLAIMER: This report is generated from transaction data in PortfolioOS and uses ' +
        'statutory rates under Finance Act 2024. Estimates exclude surcharge, health & education ' +
        'cess (4%), Sec. 80C/80D deductions, brought-forward losses, and FMV grandfathering where ' +
        'the 31-Jan-2018 FMV has not been entered. Tax on F&O and intraday assumes the 30% top ' +
        'slab rate; actual liability depends on your income bracket. All amounts in Indian Rupees. ' +
        'This report is for reference only — verify all figures with your Chartered Accountant ' +
        'before filing your Income Tax Return (ITR).';

      doc.rect(ML, cy, pageW, 2).fill(BRAND.border);
      cy += 8;
      doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted)
        .text(pdfSafe(disclaimerText), ML, cy, { width: pageW, align: 'justify' });
      return doc.y + 8;
    }

    // ─── PHASE 3 — render cover page ─────────────────────────────────

    let cy = renderHeaderBar('Capital Gains Tax Report');
    cy = renderIdentityBand(cy);
    cy = renderSummaryCards(cy);
    cy = renderTaxBreakdownTable(cy);
    cy = renderOtherIncome(cy);
    cy = renderUnrealisedSnapshot(cy);
    cy = renderHarvestingSection(cy);
    renderDisclaimer(cy);

    // ─── PHASE 4 — transaction detail pages ──────────────────────────

    doc.addPage();
    cy = renderHeaderBar('Capital Gains — Transaction Detail');

    const detailSections = [
      {
        label: cgStatement.mainSectionLabel ?? 'Capital Gains',
        columns: cgStatement.columns,
        rows: cgStatement.rows,
      },
      ...(cgStatement.additionalSections ?? []).map((s) => ({
        label: s.title,
        columns: s.columns,
        rows: s.rows,
      })),
    ];

    for (const section of detailSections) {
      if (section.rows.length === 0) continue;

      if (cy + 30 > BOT) {
        doc.addPage();
        cy = 40;
      }
      cy = renderSectionBand(cy, section.label);

      const totalColWeight = section.columns.reduce((s, c) => s + (c.width ?? 10), 0);
      const colWidths = section.columns.map((c) => ((c.width ?? 10) / totalColWeight) * pageW);
      const ROW_H = 15;

      const drawDetailHeader = (y: number): number => {
        doc.rect(ML, y, pageW, ROW_H).fill(TABLE_HEADER_BG);
        let hx = ML;
        section.columns.forEach((col, i) => {
          doc.font('Helvetica-Bold').fontSize(7).fillColor(BRAND.ink)
            .text(pdfSafe(col.header), hx + 3, y + 5, { width: colWidths[i]! - 6, lineBreak: false });
          hx += colWidths[i]!;
        });
        return y + ROW_H;
      };

      cy = drawDetailHeader(cy);

      section.rows.forEach((row, idx) => {
        if (cy + ROW_H > BOT) {
          doc.addPage();
          cy = 40;
          cy = renderSectionBand(cy, `${section.label} (continued)`);
          cy = drawDetailHeader(cy);
        }
        if (idx % 2 === 1) doc.rect(ML, cy, pageW, ROW_H).fill(BRAND.rowAlt);

        let cx = ML;
        section.columns.forEach((col, ci) => {
          const raw = row[col.key];
          const val = col.formatter ? col.formatter(raw) : raw == null ? '' : String(raw);
          const safe = pdfSafe(val);
          const isNumeric = /^[+-]?[\d,.]+%?$/.test(safe.trim()) || /^[+-]?Rs/.test(safe.trim());
          const isNeg = safe.trim().startsWith('-');
          doc.font('Helvetica').fontSize(7.5)
            .fillColor(isNeg ? BRAND.negative : BRAND.ink)
            .text(safe, cx + 3, cy + 4, { width: colWidths[ci]! - 6, align: isNumeric ? 'right' : 'left', lineBreak: false });
          cx += colWidths[ci]!;
        });
        cy += ROW_H;
      });

      cy += 8;
    }

    // ─── PHASE 5 — page numbers ───────────────────────────────────────

    const range = doc.bufferedPageRange();
    doc.font('Helvetica').fontSize(7);
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const txt = `PortfolioOS Capital Gains Tax Report  ·  FY ${params.fy}  ·  Page ${i + 1} of ${range.count}`;
      const tw = doc.widthOfString(txt);
      const tx = ML + (pageW - tw) / 2;
      doc.fillColor(BRAND.muted).text(txt, tx, pageH - 22, { lineBreak: false });
    }

    doc.flushPages();
    doc.end();
  });
}
