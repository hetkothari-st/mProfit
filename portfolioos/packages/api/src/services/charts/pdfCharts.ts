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

export function drawPieChart(
  doc: InstanceType<typeof PDFDocument>,
  data: PieSlice[],
  box: ChartBox,
): void {
  const { x, y, width, height, title } = box;
  let oy = y;

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink).text(title, x, oy);
    oy += 15;
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return;

  const radius = Math.min((width * 0.38), (height - (oy - y)) / 2);
  const cx = x + radius + 4;
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
  doc.circle(cx, cy, radius * 0.45).fill(BRAND.white);

  // Legend — right side
  const legX  = cx + radius + 16;
  const legW  = x + width - legX - 4;
  let legY    = oy;
  const items = data.slice(0, 12);

  items.forEach((seg, i) => {
    const color = seg.color ?? PIE_COLORS[i % PIE_COLORS.length]!;
    const pct   = ((seg.value / total) * 100).toFixed(1);
    doc.rect(legX, legY + 1, 7, 7).fill(color);
    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.ink)
       .text(`${seg.label}`, legX + 10, legY, { width: legW - 36, ellipsis: true, continued: true })
       .fillColor(BRAND.muted)
       .text(` ${pct}%`, { width: 32 });
    legY += 13;
  });
}

// ─── Horizontal bar chart ─────────────────────────────────────────────────────

export function drawHorizontalBarChart(
  doc: InstanceType<typeof PDFDocument>,
  data: BarDatum[],
  box: ChartBox,
): void {
  const { x, y, width, height, title } = box;
  let oy = y;

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink).text(title, x, oy);
    oy += 15;
  }

  const labelW  = 54;
  const valueW  = 46;
  const barAreaW = width - labelW - valueW - 8;
  const max      = Math.max(...data.map(d => Math.abs(d.value)), 1);
  const available = height - (oy - y);
  const barH     = Math.max(10, Math.min(16, available / data.length - 3));

  data.forEach((item) => {
    const isNeg = item.value < 0;
    const barW  = Math.max(1, (Math.abs(item.value) / max) * barAreaW);
    const color = item.color ?? (isNeg ? BRAND.negative : BRAND.accent);

    doc.font('Helvetica').fontSize(7.5).fillColor(BRAND.ink)
       .text(item.label, x, oy + 2, { width: labelW - 4, ellipsis: true });

    doc.rect(x + labelW, oy, barW, barH - 1).fill(color);

    doc.font('Helvetica').fontSize(7).fillColor(BRAND.muted)
       .text(fmtCompact(item.value), x + labelW + barAreaW + 4, oy + 2, { width: valueW });

    oy += barH + 2;
  });
}

// ─── Line / area chart ────────────────────────────────────────────────────────

export function drawLineChart(
  doc: InstanceType<typeof PDFDocument>,
  data: LineDatum[],
  box: ChartBox,
): void {
  const { x, y, width, height, title } = box;
  let oy = y;

  if (title) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(BRAND.ink).text(title, x, oy);
    oy += 15;
  }

  if (data.length < 2) {
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted).text('Not enough data', x, oy);
    return;
  }

  const xLabelH = 14;
  const chartH  = height - (oy - y) - xLabelH;
  if (chartH < 20) return;

  const values  = data.map(d => d.value);
  const minV    = Math.min(...values);
  const maxV    = Math.max(...values);
  const range   = maxV - minV || 1;

  const pts = data.map((d, i) => ({
    px: x + (i / (data.length - 1)) * width,
    py: oy + chartH - ((d.value - minV) / range) * chartH,
  }));

  // Axis baseline
  doc.moveTo(x, oy + chartH).lineTo(x + width, oy + chartH)
     .strokeColor(BRAND.border).lineWidth(0.5).stroke();

  // Area fill
  doc.save();
  doc.fillOpacity(0.08);
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
    doc.text(data[i]!.label, pts[i]!.px - 14, oy + chartH + 3, { width: 28, align: 'center' });
  }
}
