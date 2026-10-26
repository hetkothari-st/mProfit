---
id: F-TAX-001
title: "Tax page controls"
module: "Tax Planning"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER"
settings: [S-TAX-001, S-TAX-002]
related: [F-REPORT-001, F-TAX-002, F-TAX-003, F-TAX-004, F-TAX-007, F-TAX-010]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Tax page controls

`F-TAX-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)

**What it does:** A card with **Financial Year**, **Download reports for** (when you can report on others) and a download button that depends on the tab, plus 10 tabs: **Summary**, **Schedule 112A**, **Schedule 112**, **STCG**, **LTCG**, **Intraday**, **F&O (Sec. 43(5))**, **Dividend & Interest**, **Tax Harvest**, **Grandfathering (112A FMV)**.

**Why it exists:** Tax figures are per financial year and per person (assessee). The year list contains only years with activity so the page does not "default to today's FY and show ₹0 across the board if the user's last transactions were in a prior FY" (code comment).

**Where to find it:** **Planning → Tax Planning** (route `/tax`); also from the dashboard tax strip.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (F&O tab needs [R-PRO](../roles.md#r-pro)); [R-MANAGER](../roles.md#r-manager) (managed person's tax).

**Steps**
1. Open the page. **Financial Year** is set to the latest year with any capital gain or transaction (or the current FY if none).
2. Pick another year if needed; the open tab reloads.
3. Click a tab.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial Year** | Select | [S-TAX-001](../settings/tax-planning.md#s-tax-001) | — |
| **Download reports for** | Select | [S-TAX-002](../settings/tax-planning.md#s-tax-002); downloads only; no "Whole family" option | Hidden as **Report for** in [F-REPORT-001](F-REPORT-001.md) |
| **CA Tax Report (PDF)** | Button | [F-TAX-003](F-TAX-003.md) | Summary tab only |
| **ITR-portal CSV** | Button | [F-TAX-004](F-TAX-004.md) | Schedule 112A tab only |
| **Schedule 112A CSV (with FMV)** | Button | [F-TAX-010](F-TAX-010.md) | Grandfathering tab only |
| Tabs (10) | Tabs | Switch view | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Financial Year | Select | Yes | Years with activity, newest first | Latest year with activity | "fy query param required (e.g. 2024-25)" (server, if missing) |

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001) **Financial Year**; [S-TAX-002](../settings/tax-planning.md#s-tax-002) **Download reports for** — Me or one family member; applies to the PDF/CSV downloads, not to the tables. Neither is saved.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A tab shows nothing | The request failed; the page shows no error | Reload; for the F&O tab see [F-TAX-007](F-TAX-007.md) |
| "A tax report covers one person — a combined version would not be a valid filing for anyone. …" | A household subject was requested | Pick one member |

**Limitations:** The tab and year are not remembered. Tables are always your own figures (or the managed person's).

**How it works:** `GET /api/tax/available-fys` lists FYs (descending) from your capital-gain rows and transaction dates. Every `/api/tax` read resolves one subject (self by default; a combined household is refused) and runs as that person so row-level security returns their rows.

**Related features:** [F-TAX-002](F-TAX-002.md) to [F-TAX-010](F-TAX-010.md), [D-TAX-002](../dependencies.md#d-tax-002) (dashboard tax strip).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:37`, `apps/web/src/pages/tax/TaxPage.tsx:146`, `apps/web/src/pages/tax/TaxPage.tsx:262`, `apps/web/src/pages/tax/TaxPage.tsx:286`, `apps/web/src/pages/tax/TaxPage.tsx:293`, `packages/api/src/controllers/tax.controller.ts:38`, `packages/api/src/controllers/tax.controller.ts:51`, `packages/api/src/services/tax/tax.service.ts:104`, `apps/web/src/App.tsx:260`
