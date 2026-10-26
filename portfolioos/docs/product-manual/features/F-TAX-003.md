---
id: F-TAX-003
title: "CA Tax Report (PDF)"
module: "Tax Planning"
status: Live
roles: "R-FREE and up; R-MANAGER"
settings: [S-REPORT-011, S-TAX-001, S-TAX-002]
related: [F-TAX-002]
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# CA Tax Report (PDF)

`F-TAX-003` · Live · Roles: [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager)

**What it does:** Downloads "CA-ready capital gains report" — "One PDF with tax summary, unrealised snapshot, harvesting opportunities, and full transaction detail — ready to share with your CA." Saved as `capital-gains-tax-report-<FY><member suffix>.pdf`; includes your name and PAN when on file.

**Why it exists:** To hand a CA everything for the year in one file (on-screen text).

**Where to find it:** **Planning → Tax Planning → Summary**: **Download PDF** in the card, or **CA Tax Report (PDF)** in the top card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (ungated); a family member you may report on via **Download reports for**; [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Choose **Financial Year** (and **Download reports for** if needed).
2. Click **Download PDF**. The file is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** / **CA Tax Report (PDF)** | Buttons | Same download | Summary tab only |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-TAX-001](../settings/tax-planning.md#s-tax-001), [S-TAX-002](../settings/tax-planning.md#s-tax-002), [S-REPORT-011](../settings/reports.md#s-report-011) (theme).

**Results:** A PDF is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert with raw error text | Refused subject or invalid FY | Choose **Me** or another year |

**Limitations:** Covers all portfolios (the page sends no portfolio filter).

**How it works:** `GET /api/tax/capital-gains-report?fy&theme[&subject&familyId]`; the subject's PAN is decrypted for the report header; built as that person.

**Related features:** [F-TAX-002](F-TAX-002.md).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:244`, `apps/web/src/pages/tax/TaxPage.tsx:403`, `apps/web/src/pages/tax/TaxPage.tsx:411`, `packages/api/src/controllers/tax.controller.ts:126`, `packages/api/src/controllers/tax.controller.ts:139`
