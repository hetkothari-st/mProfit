# Downloadable reports dark theme recolor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor every server-generated downloadable report (PDF + Excel) to match the web app's CRED-dark theme (near-black canvas, off-white text, signature lime accent, coral negatives), replacing the three independent light-theme palettes currently in use.

**Architecture:** Three independent rendering pipelines each own a color palette: `mprofitStyle.ts`'s `MPROFIT_PALETTE` (41 specialized tax/MIS reports), `pdfCharts.ts`'s `BRAND` + `PIE_COLORS` (consumed by `export.service.ts`'s generic renderer and by `dashboardReport.ts`'s own duplicated renderer). Recoloring is mostly a palette-value swap, plus a small amount of new code: PDFKit pages default to a white canvas with no page-background fill, so every renderer that doesn't already paint every pixel (via always-filled rows) needs an explicit full-page background fill added.

**Tech Stack:** Node/TypeScript backend, `pdfkit` for PDF generation, `exceljs` for Excel generation.

## Global Constraints

- Every hex value below is copied verbatim from the design spec (`docs/superpowers/specs/2026-07-01-reports-dark-theme-design.md`) — use them exactly, do not approximate differently.
- This is a color-only pass: no layout, font, row-height, column-width, or structural changes anywhere.
- `streamDashboardExcel` (in `dashboardReport.ts`) is explicitly out of scope — it has no existing color styling to invert.
- No attempt to fill blank/unused Excel cells beyond whatever range already has explicit fills today.
- No automated test suite covers PDF/Excel visual output — verification is a manual generate-and-inspect pass (Task 6), not new unit tests.

---

### Task 1: `pdfCharts.ts` — dark `BRAND` palette, dark `PIE_COLORS`, donut-hole fix

**Files:**
- Modify: `portfolioos/packages/api/src/services/charts/pdfCharts.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `BRAND` object gains three new keys (`pageBg`, `headerBarBg`, `tableHeaderBg`) alongside its existing keys (`ink`, `accent`, `positive`, `negative`, `muted`, `headerBg`, `rowAlt`, `border`, `white`) — same keys as before, new dark values, plus the 3 additions. `PIE_COLORS` stays a 12-entry `string[]`. Tasks 2 and 3 both import `BRAND` from this file and rely on the new `headerBarBg`/`tableHeaderBg`/`pageBg` keys existing.

- [ ] **Step 1: Replace the `BRAND` constant**

Find:
```ts
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
```

Replace with:
```ts
export const BRAND = {
  pageBg: '#0D0D0D',
  headerBarBg: '#171717',
  tableHeaderBg: '#232323',
  ink: '#F0F0F0',
  accent: '#E2FE53',
  positive: '#A1E444',
  negative: '#F0574C',
  muted: '#9E9E9E',
  headerBg: '#20240F',
  rowAlt: '#171717',
  border: '#333333',
  white: '#FFFFFF',
} as const;
```

- [ ] **Step 2: Replace `PIE_COLORS`**

Find:
```ts
export const PIE_COLORS = [
  '#1B2E4B', '#B8860B', '#2D6A4F', '#8B3A2A',
  '#5B4B8A', '#2E6B7A', '#C0671C', '#7B2D3A',
  '#4F7942', '#6B4C9A', '#C09A2E', '#1E5F74',
];
```

Replace with:
```ts
export const PIE_COLORS = [
  '#E2FE53', '#E0E0E0', '#F0574C', '#3FC6C0',
  '#B79EF0', '#F5B93D', '#5CA8F5', '#EF87C0',
  '#5CC98B', '#EB8C4C', '#C595E8', '#5CC4D6',
];
```

- [ ] **Step 3: Fix the donut chart's center hole**

Find (inside `drawPieChart`):
```ts
  // White donut hole
  doc.circle(cx, cy, radius * 0.5).fill(BRAND.white);
```

Replace with:
```ts
  // Donut hole shows the page background through it
  doc.circle(cx, cy, radius * 0.5).fill(BRAND.pageBg);
```

- [ ] **Step 4: Typecheck and build**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck 2>&1 | tail -30`
Expected: no new errors (this file has no other consumers whose types would break from a value-only change plus 3 new optional-shaped keys on a `const` object).

Also run: `cd portfolioos && pnpm --filter @portfolioos/api run build 2>&1 | tail -30`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/charts/pdfCharts.ts
git commit -m "feat(reports): dark-theme BRAND palette, PIE_COLORS, donut-hole fix"
```

---

### Task 2: `export.service.ts` — apply dark `BRAND`, add page background fill, fix hardcoded literals

**Files:**
- Modify: `portfolioos/packages/api/src/services/export.service.ts`

**Interfaces:**
- Consumes: `BRAND.pageBg`, `BRAND.headerBarBg`, `BRAND.tableHeaderBg`, `BRAND.muted` from `pdfCharts.ts` (produced by Task 1 — all four keys must exist before this task's code references them).
- Produces: nothing new for later tasks (this is a leaf consumer of Task 1's palette).

- [ ] **Step 1: Add a full-page background fill and switch the top bar to `headerBarBg`**

Find (inside `streamPdf`, the `renderPageHeader` function):
```ts
    function renderPageHeader(): void {
      doc.rect(0, 0, doc.page.width, 56).fill(BRAND.ink);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.white)
         .text('PortfolioOS', ML, 14, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor('#94AECB')
         .text(pdfSafe(payload.title), ML, 36, { lineBreak: false });
      const genStr = `Generated  ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;
      doc.font('Helvetica').fontSize(8.5).fillColor('#94AECB')
         .text(genStr, ML, 22, { align: 'right', width: pageW, lineBreak: false });
      if (payload.subtitle) {
        doc.font('Helvetica').fontSize(8).fillColor('#94AECB')
           .text(pdfSafe(payload.subtitle), ML, 38, { align: 'right', width: pageW, lineBreak: false });
      }
    }
```

Replace with:
```ts
    function renderPageHeader(): void {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(BRAND.pageBg);
      doc.rect(0, 0, doc.page.width, 56).fill(BRAND.headerBarBg);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BRAND.white)
         .text('PortfolioOS', ML, 14, { lineBreak: false });
      doc.font('Helvetica').fontSize(10).fillColor(BRAND.muted)
         .text(pdfSafe(payload.title), ML, 36, { lineBreak: false });
      const genStr = `Generated  ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;
      doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.muted)
         .text(genStr, ML, 22, { align: 'right', width: pageW, lineBreak: false });
      if (payload.subtitle) {
        doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
           .text(pdfSafe(payload.subtitle), ML, 38, { align: 'right', width: pageW, lineBreak: false });
      }
    }
```

(The full-page fill is added here rather than once at doc creation because `renderPageHeader()` is the single function called both at initial page creation AND inside every `onPageBreak` callback further down this file — fixing it here covers all page-creation sites in one place.)

- [ ] **Step 2: Fix the table column header's hardcoded literal**

Find (inside `drawHeader`, called from `renderTable`):
```ts
    doc.rect(o.x, yy, o.width, ROW_H).fill('#DDE3EC');
```

Replace with:
```ts
    doc.rect(o.x, yy, o.width, ROW_H).fill(BRAND.tableHeaderBg);
```

- [ ] **Step 3: Fix the Excel header cell's hardcoded literal**

Find (inside `streamExcel`):
```ts
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
    };
```

Replace with:
```ts
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF20240F' },
    };
```

- [ ] **Step 4: Typecheck and build**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck 2>&1 | tail -30 && pnpm --filter @portfolioos/api run build 2>&1 | tail -30`
Expected: both succeed.

- [ ] **Step 5: Verify no leftover hardcoded literals in this file**

Run:
```bash
cd portfolioos/packages/api/src/services && grep -n "#94AECB\|#DDE3EC\|FFE8EEF7\|BRAND\.ink" export.service.ts
```
Expected: no matches (all four patterns fully replaced).

- [ ] **Step 6: Commit**

```bash
git add portfolioos/packages/api/src/services/export.service.ts
git commit -m "feat(reports): dark-theme export.service.ts — page bg fill, BRAND fixes"
```

---

### Task 3: `dashboardReport.ts` — apply the same fixes to its duplicated renderer

**Files:**
- Modify: `portfolioos/packages/api/src/services/reportBuilder/dashboardReport.ts`

**Interfaces:**
- Consumes: `BRAND.pageBg`, `BRAND.headerBarBg`, `BRAND.tableHeaderBg`, `BRAND.muted` from `pdfCharts.ts` (produced by Task 1).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add a full-page background fill and switch the top bar to `headerBarBg`**

Find (the `renderHeader` function inside `streamDashboardPdf`):
```ts
  function renderHeader(): void {
    doc.rect(0, 0, doc.page.width, 56).fill(BRAND.ink);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND.white)
       .text('PortfolioOS', ML, 14, { lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor('#94AECB')
       .text('Comprehensive Portfolio Report', ML, 36, { lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor('#94AECB')
       .text(pdfSafe(`${portfolioLabel}  ·  ${todayStr}`), ML, 24, { width: W, align: 'right', lineBreak: false });
  }
```

Replace with:
```ts
  function renderHeader(): void {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(BRAND.pageBg);
    doc.rect(0, 0, doc.page.width, 56).fill(BRAND.headerBarBg);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BRAND.white)
       .text('PortfolioOS', ML, 14, { lineBreak: false });
    doc.font('Helvetica').fontSize(9.5).fillColor(BRAND.muted)
       .text('Comprehensive Portfolio Report', ML, 36, { lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(BRAND.muted)
       .text(pdfSafe(`${portfolioLabel}  ·  ${todayStr}`), ML, 24, { width: W, align: 'right', lineBreak: false });
  }
```

(Same reasoning as Task 2 Step 1: `renderHeader()` here is called at initial page creation, inside `ensureSpace`'s page-break branch, and again before the "Holdings by Asset Class" section's forced page break — fixing it here covers all three.)

- [ ] **Step 2: Fix the table column header's hardcoded literal**

Find (inside `drawHead`, called from `drawTable`):
```ts
    doc.rect(ML, y, W, ROW_H).fill('#DDE3EC');
```

Replace with:
```ts
    doc.rect(ML, y, W, ROW_H).fill(BRAND.tableHeaderBg);
```

- [ ] **Step 3: Typecheck and build**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck 2>&1 | tail -30 && pnpm --filter @portfolioos/api run build 2>&1 | tail -30`
Expected: both succeed.

- [ ] **Step 4: Verify no leftover hardcoded literals in this file**

Run:
```bash
cd portfolioos/packages/api/src/services/reportBuilder && grep -n "#94AECB\|#DDE3EC\|BRAND\.ink" dashboardReport.ts
```
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/reportBuilder/dashboardReport.ts
git commit -m "feat(reports): dark-theme dashboardReport.ts — page bg fill, BRAND fixes"
```

---

### Task 4: `mprofitStyle.ts` — dark `MPROFIT_PALETTE`, page background fill, Excel negative-color fix

**Files:**
- Modify: `portfolioos/packages/api/src/services/reportBuilder/mprofitStyle.ts`

**Interfaces:**
- Consumes: nothing (independent palette from Tasks 1-3).
- Produces: `MPROFIT_PALETTE` gains one new key (`pageBg`) alongside its existing keys (`bandPink`, `bandPinkSoft`, `groupBlue`, `subPink`, `subtotalYellow`, `grandGreen`, `border`, `ink`, `muted`, `negative`, `white`) — same shape, new dark values, plus the 1 addition. Task 5 does not depend on this task's exports (its override is a raw hex literal, not a `MPROFIT_PALETTE` reference).

- [ ] **Step 1: Replace the `MPROFIT_PALETTE` constant**

Find:
```ts
export const MPROFIT_PALETTE = {
  bandPink: '#F5C2C7',          // top family/member band + table header
  bandPinkSoft: '#FAD5DC',      // outer header strip
  groupBlue: '#9EC5E8',          // top-level group banner (SHARE INVESTMENT...)
  subPink: '#F6D5DA',            // script header row
  subtotalYellow: '#FFF4C8',     // per-script total
  grandGreen: '#A0E6BB',         // grand total
  border: '#A0A0A0',
  ink: '#1B1B1B',
  muted: '#666666',
  negative: '#B91C1C',
  white: '#FFFFFF',
} as const;
```

Replace with:
```ts
export const MPROFIT_PALETTE = {
  pageBg: '#0D0D0D',             // full page canvas
  bandPink: '#1E2210',           // top family/member band + table header (dark olive-lime tint)
  bandPinkSoft: '#141414',       // outer header strip
  groupBlue: '#101F2E',          // top-level group banner (dark navy tint)
  subPink: '#1C1530',            // script header row (dark violet tint)
  subtotalYellow: '#2A2008',     // per-script total (dark amber tint)
  grandGreen: '#132B0C',         // grand total (dark green tint)
  border: '#3D3D3D',
  ink: '#F0F0F0',
  muted: '#9E9E9E',
  negative: '#F0574C',
  white: '#171717',
} as const;
```

- [ ] **Step 2: Add a full-page background fill at initial page creation**

Find (inside `streamMprofitPdf`):
```ts
    const pageSize: 'A4' | 'LEGAL' = layout.columns.length > 14 ? 'LEGAL' : 'A4';
    const doc = new PDFDocument({ margin: 24, size: pageSize, layout: 'landscape', bufferPages: true });
    doc.on('end', resolve);
    doc.on('error', reject);
    res.on('error', reject);
    doc.pipe(res);

    const ML = doc.page.margins.left;
```

Replace with:
```ts
    const pageSize: 'A4' | 'LEGAL' = layout.columns.length > 14 ? 'LEGAL' : 'A4';
    const doc = new PDFDocument({ margin: 24, size: pageSize, layout: 'landscape', bufferPages: true });
    doc.on('end', resolve);
    doc.on('error', reject);
    res.on('error', reject);
    doc.pipe(res);
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(MPROFIT_PALETTE.pageBg);

    const ML = doc.page.margins.left;
```

- [ ] **Step 3: Add the same fill inside `newPage()`**

Find:
```ts
    function newPage(): number {
      doc.addPage();
      let y = doc.page.margins.top;
      doc.y = y;
      y = renderTopBand();
      y = renderReportTitle(y);
      y = renderHeader(y);
      return y;
    }
```

Replace with:
```ts
    function newPage(): number {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(MPROFIT_PALETTE.pageBg);
      let y = doc.page.margins.top;
      doc.y = y;
      y = renderTopBand();
      y = renderReportTitle(y);
      y = renderHeader(y);
      return y;
    }
```

- [ ] **Step 4: Fix the Excel renderer's hardcoded negative-number ARGB**

Find (inside `streamMprofitExcel`'s `writeRow` function):
```ts
      cell.font = {
        bold,
        size: 9,
        color: c.signed && typeof display === 'string' && isParensNegative(display)
          ? { argb: 'FFB91C1C' }
          : undefined,
      };
```

Replace with:
```ts
      cell.font = {
        bold,
        size: 9,
        color: c.signed && typeof display === 'string' && isParensNegative(display)
          ? { argb: 'FFF0574C' }
          : undefined,
      };
```

- [ ] **Step 5: Typecheck and build**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck 2>&1 | tail -30 && pnpm --filter @portfolioos/api run build 2>&1 | tail -30`
Expected: both succeed.

- [ ] **Step 6: Verify no leftover light-palette hex values**

Run:
```bash
cd portfolioos/packages/api/src/services/reportBuilder && grep -n "#F5C2C7\|#FAD5DC\|#9EC5E8\|#F6D5DA\|#FFF4C8\|#A0E6BB\|#B91C1C\|#666666\|#A0A0A0" mprofitStyle.ts
```
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add portfolioos/packages/api/src/services/reportBuilder/mprofitStyle.ts
git commit -m "feat(reports): dark-theme MPROFIT_PALETTE, page bg fill, Excel negative-color fix"
```

---

### Task 5: `special/index.ts` — recolor the opening-balance row override

**Files:**
- Modify: `portfolioos/packages/api/src/services/reportBuilder/special/index.ts`

**Interfaces:**
- Consumes: nothing (raw hex literal, not a palette reference).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Replace the hardcoded override**

Find:
```ts
              bg: mv.kind === 'OPENING' ? '#FFE3E6' : undefined,
```

Replace with:
```ts
              bg: mv.kind === 'OPENING' ? '#2E1418' : undefined,
```

- [ ] **Step 2: Typecheck and build**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck 2>&1 | tail -30 && pnpm --filter @portfolioos/api run build 2>&1 | tail -30`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/services/reportBuilder/special/index.ts
git commit -m "feat(reports): dark-theme opening-balance row highlight in special reports"
```

---

### Task 6: Manual verification — generate and inspect a report from each pipeline

**Files:** none (verification only).

**Interfaces:** N/A.

- [ ] **Step 1: Start the API server**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run dev` (or the project's documented dev-server command — check `packages/api/package.json`'s `scripts.dev` if this differs).
Expected: server starts with no errors, listening on its configured port (check `packages/api/src/config/env.ts` or `.env` for the port, commonly `3001` or `3020` per this codebase's existing proxy config).

- [ ] **Step 2: Authenticate and hit one endpoint from each of the 3 pipelines**

Using a valid session (demo account if seeded, or any authenticated test user), fetch:
1. One of the 41 specialized reports (`mprofitStyle.ts` pipeline) — e.g. `GET /api/reports/... ` for a Capital Gains FIFO or Trial Balance report, both `?format=pdf` and `?format=xlsx`. Check `reports.routes.ts` for the exact route paths if unsure.
2. A Section export (`export.service.ts` pipeline) — e.g. the vehicles or insurance section export, both formats.
3. The Dashboard PDF (`dashboardReport.ts` pipeline) — `GET /api/reports/dashboard-export?format=pdf`.

If no authenticated session/backend is reachable in this environment (a recurring limitation this session with the frontend theme work), document that explicitly here rather than claiming visual verification happened — do not skip this step silently, write down what was and wasn't checked.

- [ ] **Step 3: Visually inspect each generated PDF**

Confirm for each: page background is dark (not white/blank margins around content), all band/header/subtotal/grand-total rows show their distinct dark tint with legible near-white text, negative numbers are legible coral-red, no leftover light-colored rectangle or white flash anywhere on the page. For the Dashboard PDF specifically, also confirm the donut chart's center hole is dark (not a white circle) and the pie/bar chart colors are distinguishable from each other and from the page background.

- [ ] **Step 4: Visually inspect each generated Excel file**

Open in a spreadsheet viewer. Confirm header/band/subtotal/grand-total cells show the new dark fills with legible text, negative numbers are coral-red. Confirm (do not try to "fix") that cells outside the data range remain the viewer's own default background — this is expected per the plan's Non-goals, not a bug.

No commit for this task (verification only, no file changes expected unless Step 3/4 surfaces a must-fix regression, in which case fix it as its own follow-up task with its own commit).
