---
id: F-REPORT-001
title: "Reports page filters and tabs"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-REPORT-001, S-REPORT-002, S-REPORT-003]
related: [F-REPORT-002, F-REPORT-003, F-REPORT-004, F-REPORT-010, F-REPORT-013, F-REPORT-014, F-REPORT-015]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Reports page filters and tabs

`F-REPORT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** Gives the page its common filter card — **Portfolio**, **Report for** (only when you can report on someone else), **Financial Year** (only on tabs that need one) — and a row of 12 tabs: **Summary**, **Tax & MIS downloads**, **Statements**, **Unrealised P&L**, **Intraday**, **STCG**, **LTCG**, **Schedule 112A**, **Income**, **XIRR**, **Historical**, **Inbox imports**. Only the open tab's data is fetched.

**Why it exists:** One place for every report, with one set of filters, so the same portfolio and year apply as you move between tabs. The default of **All portfolios** exists so "a brand-new user (or one whose first portfolio happens to be empty) sees real numbers, not zeros" (code comment).

**Where to find it:** **Tools → Reports** (route `/reports`). A tab can be opened directly with `/reports?tab=<key>` (for example `/reports?tab=inbox-imports`); an unknown key opens **Summary**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (all tabs open; some downloads are plan-gated, see [F-REPORT-013](F-REPORT-013.md) and [F-REPORT-014](F-REPORT-014.md)). [R-MANAGER](../roles.md#r-manager) sees the managed person's data. [R-VISITOR](../roles.md#r-visitor) is sent to sign in.

**Steps**
1. Open **Tools → Reports**. The **Summary** tab opens with **All portfolios** selected.
2. Pick a portfolio in **Portfolio** if you want one book only. The open tab reloads for that portfolio.
3. On **Intraday**, **STCG**, **LTCG**, **Schedule 112A** or **Income**, choose a year in **Financial Year**. The table reloads.
4. Click any tab to switch report. The filters stay as you set them.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Portfolio** | Select | **All portfolios** or one of your portfolios ([S-REPORT-001](../settings/reports.md#s-report-001)) | Never hidden |
| **Report for** | Select | Whose figures the downloads on this page cover ([S-REPORT-002](../settings/reports.md#s-report-002)) | Hidden when you are not viewing a family, or your family view is capped, or the family has no other active member |
| **Financial Year** | Select | Year for FY-based tabs ([S-REPORT-003](../settings/reports.md#s-report-003)) | Shown only on Intraday, STCG, LTCG, Schedule 112A, Income |
| **Excel**, **PDF** | Buttons | Download the open tab ([F-REPORT-010](F-REPORT-010.md)) | Shown only on Unrealised P&L, Intraday, STCG, LTCG, Schedule 112A, Income |
| Tab buttons (12) | Tabs | Switch report | Never |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | `all` or a portfolio id | **All portfolios** | "Forbidden" if the portfolio is not yours (see Limitations) |
| Financial Year | Select | Yes on FY tabs | Current FY and the 7 before it, as "2026-27" | Current Indian FY (April–March, computed in UTC) | "Invalid financial year "…" — expected consecutive years like 2025-26" (server) |

**Settings and toggles here:** [S-REPORT-001](../settings/reports.md#s-report-001) **Portfolio** — one book or all; [S-REPORT-002](../settings/reports.md#s-report-002) **Report for** — Me / Whole family / one member, downloads only; [S-REPORT-003](../settings/reports.md#s-report-003) **Financial Year** — the year for FY-based tabs. None of them is saved; all reset when you leave the page.

**Results:** Nothing is changed in your data; the tables and downloads follow the chosen filters.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A tab stays empty with no message | The request failed (for example "Forbidden" on a portfolio you do not own) and the page shows nothing on error | Choose **All portfolios** or one of your own portfolios |
| "Select a portfolio to view reports." | No portfolio value is set | Pick a value in **Portfolio** |

**Limitations:** The filters are not remembered between visits. In a family view the **Portfolio** list also shows portfolios belonging to other members (the list follows the family view) but every Reports endpoint accepts only portfolios you own, so picking one of theirs leaves the tab empty — use **Report for** downloads instead (see DOCUMENTATION_GAPS.md). On-screen tables are always about you; only downloads follow **Report for**.

**How it works:** The page keeps tab, portfolio (`all` by default) and FY in component state. Each tab is a separate query keyed by portfolio and, where relevant, FY, and enabled only while that tab is open. The server resolves `portfolioId=all` to "every portfolio you own" and otherwise checks the portfolio's owner equals the caller (403 otherwise). FY values are validated as consecutive years. Tab keys accepted from the URL: summary, statements, tax-mis, intraday, stcg, ltcg, schedule-112a, income, unrealised, xirr, historical, inbox-imports.

**Related features:** [F-REPORT-002](F-REPORT-002.md) (search), [F-REPORT-003](F-REPORT-003.md) (data checks), [F-REPORT-004](F-REPORT-004.md) to [F-REPORT-015](F-REPORT-015.md) (tabs), [D-REPORT-007](../dependencies.md#d-report-007) (family view switcher).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:43`, `apps/web/src/pages/reports/ReportsPage.tsx:139`, `apps/web/src/pages/reports/ReportsPage.tsx:181`, `apps/web/src/pages/reports/ReportsPage.tsx:197`, `apps/web/src/pages/reports/ReportsPage.tsx:289`, `apps/web/src/pages/reports/ReportsPage.tsx:386`, `packages/api/src/controllers/reports.controller.ts:79`, `packages/api/src/controllers/reports.controller.ts:93`, `packages/api/src/controllers/reports.controller.ts:99`, `apps/web/src/App.tsx:259`
