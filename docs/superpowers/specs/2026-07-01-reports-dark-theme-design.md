# Downloadable reports — dark theme recolor

Date: 2026-07-01

> Self-approved design: the user granted full autonomy for this task ("do the task, create
> plan, implement it and push it, don't wait for my approval at any period") while away from
> keyboard. This spec documents the decisions that would normally go through the brainstorming
> Q&A loop; there was no interactive back-and-forth, but the same rigor (explore → design →
> write it down → self-review) applies before implementation starts.

## Goal

Every server-generated downloadable report (PDF + Excel) currently uses one of three
independent, hardcoded light-theme color palettes, all originally designed to look like printed
paper documents (pastel pink/blue/yellow/green bands, navy-on-white). Recolor all of them to
match the web app's CRED-dark theme (near-black canvas, off-white text, signature lime accent,
coral negatives) established in the two prior theme-reskin PRs (#48, #51/#52 series).

## Scope: three independent rendering pipelines, four files

Explored via direct code reading (not assumption):

1. **`packages/api/src/services/reportBuilder/mprofitStyle.ts`** — shared `MPROFIT_PALETTE`
   constant + `streamMprofitPdf`/`streamMprofitExcel` renderers. Used by all 41 specialized
   tax/MIS reports (`reportBuilder/special/index.ts` builders: Grandfathering LTCG, Schedule
   112A, Tax Summary, Capital Gains variants, Holdings/M2M reports, Accounting reports, Trial
   Balance, P&L, Balance Sheet, Broker Bill Register, etc.). One override site exists:
   `reportBuilder/special/index.ts:236` conditionally sets a row `bg` override
   (`'#FFE3E6'` for `OPENING` balance rows) that bypasses the shared palette.
2. **`packages/api/src/services/charts/pdfCharts.ts`** (shared `BRAND` palette + `PIE_COLORS` +
   `drawPieChart`/`drawHorizontalBarChart`/`drawLineChart`) and
   **`packages/api/src/services/export.service.ts`** (`streamPdf`/`streamExcel`, generic
   payload-driven renderer) — used by Holdings export, the five Section exports (vehicles,
   insurance, loans, credit cards, rental), and the "statement" reports (holdings, capital
   gains, income, ledger statements via `reportBuilder/statement/*.ts` data builders that feed
   this same renderer).
3. **`packages/api/src/services/reportBuilder/dashboardReport.ts`** — the "Comprehensive
   Dashboard PDF" (`streamDashboardPdf`). Also imports `BRAND` from `pdfCharts.ts` but has its
   own **duplicated** page-header/table-drawing logic (not routed through `export.service.ts`),
   so its two hardcoded-literal color usages need the same fix applied a second time, in this
   file. Its Excel counterpart, `streamDashboardExcel`, has **no color styling at all** (plain
   bold-header-only cells) — out of scope, since there is no existing light theme to invert
   there (see Non-goals).

## Decisions (self-answered, no user available)

1. **Full literal recolor, no exceptions for print practicality.** The instruction was explicit
   ("match the color theme... of the dark theme of our application") with no carve-out for
   tax/compliance documents that might get printed (e.g. Schedule 112A for ITR filing). I'm
   implementing exactly as asked, uniformly across all report types, rather than second-guessing
   with an unrequested "keep tax reports light for printing" exception. Noted here as a visible
   trade-off, not silently decided.
2. **PDF page background needs an explicit fill — this is a real code change, not just a
   palette swap.** PDFKit pages default to a white/transparent canvas; nothing in any of the
   three renderers currently fills the page background, because every row/band happened to
   always paint an explicit light-colored rect over the assumed-white canvas. That's still true
   for `mprofitStyle.ts` (every row always calls `.fillAndStroke()` with some palette color) but
   is NOT reliably true for `export.service.ts`/`dashboardReport.ts`, where plain (non-alternating)
   table rows draw text directly onto the page with no per-row background rect at all. All three
   renderers get an explicit full-page `pageBg` fill: once at page creation, and again on every
   `doc.addPage()` call (each file has 1-3 such call sites, enumerated in the plan).
3. **Role split: `ink` can no longer mean both "background fill" and "body text color."** In
   `pdfCharts.ts`'s `BRAND` and its two consumers, `BRAND.ink` was originally a dark navy used
   BOTH as the fill for the top 56px branding strip AND as the near-black text color for
   everything else (which worked in the light theme, where "dark ink" was simultaneously "the
   bg of one special dark bar" and "text color everywhere else"). In the dark theme, `ink`
   becomes near-white (correct for body text everywhere) — so the top bar's fill needs its own
   new key (`headerBarBg`) instead of reusing `ink`, or the title text (`BRAND.white`, already a
   separate key, unchanged) would become invisible against a now-near-white bar. Same
   reasoning applies to `mprofitStyle.ts`'s `MPROFIT_PALETTE`, which already kept `ink`
   text-only from the start — no equivalent split needed there.
4. **Two more named roles get pulled out of hardcoded literals, not just recolored in place.**
   `'#94AECB'` (light blue subtitle/date text on the top brand bar, used 5× across
   `export.service.ts` and `dashboardReport.ts`) was always playing the same "muted secondary
   text" role as the already-named `BRAND.muted` — it's folded into that constant instead of
   becoming a new dark literal. `'#DDE3EC'` (the per-column table header row background, used 2×
   across the same two files, explicitly called out in a code comment as "distinct from section
   header and row background") gets a new dedicated key, `BRAND.tableHeaderBg`, since it's a
   third, genuinely distinct visual role from `headerBg` (section bands) and `rowAlt` (body
   rows).
5. **Donut chart's center hole switches from `BRAND.white` to `BRAND.pageBg`.** A pie/donut
   chart's hole is meant to show the surrounding page through it — on a light page that was
   white, so `BRAND.white` was correct; on a dark page it must become `BRAND.pageBg`, otherwise
   the chart gets a jarring solid-white circle punched into an otherwise dark page.
6. **Excel gets fully recolored everywhere a fill already exists; blank/unused cells are left
   alone.** Spreadsheet apps don't have a "page background color" concept the way a PDF canvas
   does — only explicitly-styled cells carry color, and that's already how every Excel renderer
   in this codebase works (only header/band/subtotal/total cells get `cell.fill =`, body data
   cells in the two 41-specialized-report and holdings/section pipelines already get an explicit
   fill too, so those go fully dark; `streamDashboardExcel`'s summary/holdings/transactions
   sheets have zero fills today, and adding new styling there would be scope creep beyond
   "recolor," not covered by this task).
7. **PIE_COLORS (chart wedge palette, 12 colors) is redrawn to match the exact hue families
   already established for the web app's dark-mode chart palette** (lime, ivory→light-gray,
   coral, teal, violet, amber, blue, rose, green, orange, purple, cyan — the same set used in
   `DashboardPage.tsx`'s `PIE_COLORS_DARK` and `ASSET_CLASS_COLORS_DARK`), so a user's PDF
   exports visually match the web dashboard's own chart colors, not just the app's page
   chrome.

## Color mapping tables

### `MPROFIT_PALETTE` (`mprofitStyle.ts`) — light → dark

| Key | Light (before) | Dark (after) | Role |
|---|---|---|---|
| `pageBg` *(new)* | — | `#0D0D0D` | full page canvas |
| `bandPinkSoft` | `#FAD5DC` | `#141414` | outer top band (family/member/FY strip) |
| `bandPink` | `#F5C2C7` | `#1E2210` | table header cells (dark olive-lime tint) |
| `groupBlue` | `#9EC5E8` | `#101F2E` | top-level section banner (dark navy tint) |
| `subPink` | `#F6D5DA` | `#1C1530` | script/sub-group header row (dark violet tint) |
| `subtotalYellow` | `#FFF4C8` | `#2A2008` | per-script subtotal row (dark amber tint) |
| `grandGreen` | `#A0E6BB` | `#132B0C` | grand total row (dark green tint) |
| `border` | `#A0A0A0` | `#3D3D3D` | cell borders/hairlines |
| `ink` | `#1B1B1B` | `#F0F0F0` | body text (unchanged role — was always text-only) |
| `muted` | `#666666` | `#9E9E9E` | secondary labels |
| `negative` | `#B91C1C` | `#F0574C` | negative numbers (parens, red) |
| `white` | `#FFFFFF` | `#171717` | plain body row background |

### `special/index.ts` override

| Literal | Light | Dark |
|---|---|---|
| Opening-balance row highlight | `#FFE3E6` | `#2E1418` |

### `BRAND` (`pdfCharts.ts`) — light → dark

| Key | Light (before) | Dark (after) | Role |
|---|---|---|---|
| `pageBg` *(new)* | — | `#0D0D0D` | full page canvas |
| `headerBarBg` *(new, replaces `ink`-as-bg)* | — (was `ink` `#1B2E4B`) | `#171717` | top 56px brand strip fill |
| `tableHeaderBg` *(new, replaces literal `'#DDE3EC'`)* | — | `#232323` | per-column table header row |
| `ink` | `#1B2E4B` | `#F0F0F0` | body text (role narrowed to text-only) |
| `accent` | `#2563EB` | `#E2FE53` | fill accent (stripe bars, bar-chart bars, line-chart fill/stroke) |
| `positive` | `#15803D` | `#A1E444` | (currently unused/vestigial — updated for consistency, no call sites) |
| `negative` | `#B91C1C` | `#F0574C` | negative numbers, negative bar-chart bars |
| `muted` | `#64748B` (+ hardcoded `'#94AECB'` for header-bar subtext, folded in here) | `#9E9E9E` | secondary/muted text everywhere, including header-bar subtitle |
| `headerBg` | `#EFF4FF` | `#20240F` | section band / metric-card background |
| `rowAlt` | `#F8FAFC` | `#171717` | alternating table row tint |
| `border` | `#E2E8F0` | `#333333` | hairlines, chart grid lines |
| `white` | `#FFFFFF` | `#FFFFFF` (unchanged) | header-bar title text — already assumed dark-bg/light-text, no change needed |

### `PIE_COLORS` (`pdfCharts.ts`) — 12 wedge colors

| # | Light (before) | Dark (after) | Hue family |
|---|---|---|---|
| 1 | `#1B2E4B` | `#E2FE53` | lime (signature accent) |
| 2 | `#B8860B` | `#E0E0E0` | ivory / light gray |
| 3 | `#2D6A4F` | `#F0574C` | coral |
| 4 | `#8B3A2A` | `#3FC6C0` | teal |
| 5 | `#5B4B8A` | `#B79EF0` | violet |
| 6 | `#2E6B7A` | `#F5B93D` | amber |
| 7 | `#C0671C` | `#5CA8F5` | blue |
| 8 | `#7B2D3A` | `#EF87C0` | rose |
| 9 | `#4F7942` | `#5CC98B` | green |
| 10 | `#6B4C9A` | `#EB8C4C` | orange |
| 11 | `#C09A2E` | `#C595E8` | purple |
| 12 | `#1E5F74` | `#5CC4D6` | cyan |

## Code changes beyond palette values

- **`mprofitStyle.ts`**: add a full-page background fill in `streamMprofitPdf` — once right
  after the `PDFDocument` is constructed, and again inside `newPage()` right after
  `doc.addPage()`. Fix the Excel renderer's hardcoded negative-number ARGB
  (`{ argb: 'FFB91C1C' }`, which bypassed `MPROFIT_PALETTE.negative` even though that constant
  exists) to `{ argb: 'FFF0574C' }`, matching the new palette value.
- **`pdfCharts.ts`**: add `pageBg`, `headerBarBg`, `tableHeaderBg` keys to `BRAND`. Change
  `drawPieChart`'s donut-hole fill from `BRAND.white` to `BRAND.pageBg`.
- **`export.service.ts`**: `renderPageHeader()` gets a full-page background fill as its first
  statement (covers the initial page and both `onPageBreak` call sites, since they call
  `renderPageHeader()` too). The top-bar fill changes from `BRAND.ink` to `BRAND.headerBarBg`.
  The 3 hardcoded `'#94AECB'` usages change to `BRAND.muted`. The 1 hardcoded `'#DDE3EC'`
  (table column header) changes to `BRAND.tableHeaderBg`. The Excel header cell's hardcoded
  `fgColor: { argb: 'FFE8EEF7' }` changes to the ARGB equivalent of the new `headerBg` dark value
  (`'FF20240F'`).
- **`dashboardReport.ts`**: identical treatment to `export.service.ts`, applied to its own
  duplicated `renderHeader()` (full-page bg fill + `BRAND.headerBarBg` for the top bar) and
  `drawHead()` (the local `'#DDE3EC'` literal → `BRAND.tableHeaderBg`), plus its own 2×
  `'#94AECB'` → `BRAND.muted`.
- **`special/index.ts`**: the single conditional `bg: '#FFE3E6'` override becomes `'#2E1418'`.

## Non-goals

- No layout, font, row-height, or column-width changes anywhere — this is a color-only pass.
- `streamDashboardExcel` is not touched (no existing color styling to invert).
- No attempt to fill "blank" cells beyond the existing styled range in any Excel output — not
  how spreadsheet theming works, consistent across all three pipelines.
- No new report types, no new export formats, no new UI changes on the `ReportsPage`/
  `TaxMisDownloads` frontend components (they only trigger downloads; the recolor is entirely
  server-side).

## Verification plan

No automated test suite covers PDF/Excel visual output in this codebase. Verification is:
generate at least one representative report from each of the 3 pipelines (one of the 41
specialized reports, a Section export, and the Dashboard PDF) against a running dev server with
a seeded/demo account, and visually confirm: page background is dark, all band/header/subtotal/
total rows are readable with correct role-appropriate tinting, negative numbers are legible
coral-red, chart wedge colors are distinguishable from each other and from the page, and the
donut-chart hole no longer punches a white circle into the page. If no backend is reachable in
the implementation environment (a recurring limitation this session), this is documented
honestly rather than claimed — consistent with how the two prior theme PRs handled the same
constraint.
