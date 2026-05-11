import type PDFDocument from 'pdfkit';

// Brand palette — matches the app's editorial colour scheme
export const BRAND = {
  ink: '#1B2E4B',
  accent: '#2563EB',
  positive: '#15803D',
  negative: '#B91C1C',
  muted: '#64748B',
  headerBg: '#EFF4FF',
  rowAlt: '#F8FAFC',
  border: '#E2E8F0',
  white: '#FFFFFF',
} as const;

// PDFKit built-in Helvetica does not support U+20B9 (₹). Replace before render.
// Also normalises a couple of other common chars that drop in Helvetica.
export function pdfSafe(s: string | number | null | undefined): string {
  if (s == null) return '';
  return String(s)
    .replace(/₹/g, 'Rs. ')   // ₹ → Rs.
    .replace(/—/g, '-')      // em dash → hyphen
    .replace(/–/g, '-')      // en dash → hyphen
    .replace(/[‘’]/g, "'")  // smart quotes
    .replace(/[“”]/g, '"');
}

// Allocation colour wheel — 12 distinct, editorial, never neon
export const PIE_COLORS = [
  '#1B2E4B', '#B8860B', '#2D6A4F', '#8B3A2A',
  '#5B4B8A', '#2E6B7A', '#C0671C', '#7B2D3A',
  '#4F7942', '#6B4C9A', '#C09A2E', '#1E5F74',
];

export interface PieSlice  { label: string; value: number; color?: string }
export interface BarDatum   { label: string; value: number; color?: string }
export interface LineDatum  { label: string; value: number }

export interface ChartBox { x: number; y: number; width: number; height: number; title?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10_000_000) return `${sign}₹${(abs / 10_000_000).toFixed(1)}Cr`;
  if (abs >= 100_000)    return `${sign}₹${(abs / 100_000).toFixed(1)}L`;
  if (abs >= 1_000)      return `${sign}₹${(abs / 1_000).toFixed(0)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}

function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  const large = a2 - a1 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

// ─── Pie / Donut chart ────────────────────────────────────────────────────────
// Returns the y-coordinate of the bottom of the rendered chart so callers can
// advance the cursor.

export function drawPieChart(
  doc: InstanceType<typeof PDFDocument>,
  data: PieSlice[],
  box: ChartBox,
): number {
  const { x, y, width, height, title } = box;
  let oy = y;

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink)
       .text(pdfSafe(title), x, oy, { width, lineBreak: false });
    oy += 15;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
       .text('No data', x, oy, { width, lineBreak: false });
    doc.y = oy + 14;
    return oy + 14;
  }

  // Constrain the donut to fit cleanly within the box height
  const availableH = height - (oy - y);
  const radius = Math.min(width * 0.18, availableH / 2 - 4);
  const cx = x + radius + 6;
  const cy = oy + radius;

  let startAngle = -Math.PI / 2;
  data.forEach((seg, i) => {
    if (seg.value <= 0) return;
    const sweep = (seg.value / total) * 2 * Math.PI;
    const end   = startAngle + sweep;
    const color = seg.color ?? PIE_COLORS[i % PIE_COLORS.length]!;
    doc.path(arcPath(cx, cy, radius, startAngle, end)).fill(color);
    startAngle = end;
  });

  // White donut hole
  doc.circle(cx, cy, radius * 0.5).fill(BRAND.white);

  // Legend — right side. Each row uses two SEPARATE text writes with
  // explicit (x, y) + lineBreak:false so PDFKit cannot wrap and advance
  // the cursor past the page bottom.
  const legX     = cx + radius + 18;
  const legW     = x + width - legX - 4;
  const pctColW  = 36;
  const labelColW = legW - pctColW - 4;
  let legY       = oy;
  const items    = data.slice(0, 12);
  const rowH     = 13;

  items.forEach((seg, i) => {
    const color = seg.color ?? PIE_COLORS[i % PIE_COLORS.length]!;
    const pct   = ((seg.value / total) * 100).toFixed(1);
    doc.rect(legX, legY + 1, 7, 7).fill(color);
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.ink)
       .text(pdfSafe(seg.label), legX + 10, legY, {
         width: labelColW, lineBreak: false,
       });
    doc.fillColor(BRAND.muted)
       .text(`${pct}%`, legX + 10 + labelColW + 2, legY, {
         width: pctColW, align: 'right', lineBreak: false,
       });
    legY += rowH;
  });

  const bottom = Math.max(oy + radius * 2 + 4, legY + 4);
  doc.y = bottom;
  return bottom;
}

// ─── Horizontal bar chart ─────────────────────────────────────────────────────

export function drawHorizontalBarChart(
  doc: InstanceType<typeof PDFDocument>,
  data: BarDatum[],
  box: ChartBox,
): number {
  const { x, y, width, height, title } = box;
  let oy = y;

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink)
       .text(pdfSafe(title), x, oy, { width, lineBreak: false });
    oy += 16;
  }

  if (data.length === 0) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
       .text('No data', x, oy, { width, lineBreak: false });
    doc.y = oy + 14;
    return oy + 14;
  }

  const labelW   = Math.min(140, width * 0.30);
  const valueW   = 70;
  const barAreaW = width - labelW - valueW - 12;
  const max      = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const barH     = 14;
  const rowGap   = 4;

  data.forEach((item) => {
    const isNeg = item.value < 0;
    const barW  = Math.max(1, (Math.abs(item.value) / max) * barAreaW);
    const color = item.color ?? (isNeg ? BRAND.negative : BRAND.accent);

    doc.font('Helvetica').fontSize(8).fillColor(BRAND.ink)
       .text(pdfSafe(item.label), x, oy + 2, { width: labelW - 6, lineBreak: false });

    // bar track
    doc.rect(x + labelW, oy + 3, barAreaW, barH - 6).fill(BRAND.rowAlt);
    // bar fill
    doc.rect(x + labelW, oy + 3, barW, barH - 6).fill(color);

    doc.font('Helvetica-Bold').fontSize(8).fillColor(isNeg ? BRAND.negative : BRAND.ink)
       .text(pdfSafe(fmtCompact(item.value)), x + labelW + barAreaW + 4, oy + 2, {
         width: valueW, align: 'right', lineBreak: false,
       });

    oy += barH + rowGap;
    if (oy > y + height) return; // overflow guard
  });

  doc.y = oy + 4;
  return oy + 4;
}

// ─── Line / area chart ────────────────────────────────────────────────────────

export function drawLineChart(
  doc: InstanceType<typeof PDFDocument>,
  data: LineDatum[],
  box: ChartBox,
): number {
  const { x, y, width, height, title } = box;
  let oy = y;

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink)
       .text(pdfSafe(title), x, oy, { width, lineBreak: false });
    oy += 16;
  }

  if (data.length < 2) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
       .text('Not enough data', x, oy, { width, lineBreak: false });
    doc.y = oy + 14;
    return oy + 14;
  }

  const xLabelH = 16;
  const chartH  = height - (oy - y) - xLabelH;
  if (chartH < 20) { doc.y = oy; return oy; }

  const values  = data.map(d => d.value);
  const minV    = Math.min(...values, 0);
  const maxV    = Math.max(...values);
  const range   = maxV - minV || 1;

  const pts = data.map((d, i) => ({
    px: x + (i / (data.length - 1)) * width,
    py: oy + chartH - ((d.value - minV) / range) * chartH,
  }));

  // Grid lines (3 horizontal)
  for (let i = 0; i <= 3; i++) {
    const gy = oy + (chartH * i) / 3;
    doc.moveTo(x, gy).lineTo(x + width, gy)
       .strokeColor(BRAND.border).lineWidth(0.25).dash(2, { space: 2 }).stroke();
  }
  doc.undash();

  // Area fill
  doc.save();
  doc.fillOpacity(0.10);
  doc.moveTo(pts[0]!.px, oy + chartH);
  pts.forEach(p => { doc.lineTo(p.px, p.py); });
  doc.lineTo(pts[pts.length - 1]!.px, oy + chartH);
  doc.closePath().fillColor(BRAND.accent).fill();
  doc.restore();

  // Line
  doc.moveTo(pts[0]!.px, pts[0]!.py);
  for (let i = 1; i < pts.length; i++) {
    doc.lineTo(pts[i]!.px, pts[i]!.py);
  }
  doc.strokeColor(BRAND.accent).lineWidth(1.5).stroke();

  // X labels — show ~6 evenly spaced
  const step = Math.max(1, Math.round(data.length / 6));
  doc.font('Helvetica').fontSize(6.5).fillColor(BRAND.muted);
  for (let i = 0; i < data.length; i += step) {
    doc.text(pdfSafe(data[i]!.label), pts[i]!.px - 18, oy + chartH + 4, {
      width: 36, align: 'center', lineBreak: false,
    });
  }

  const bottom = oy + chartH + xLabelH;
  doc.y = bottom;
  return bottom;
}
