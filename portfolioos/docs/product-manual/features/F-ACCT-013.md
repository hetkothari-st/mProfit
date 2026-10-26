---
id: F-ACCT-013
title: "Export to Tally"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: []
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Export to Tally

`F-ACCT-013` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Downloads your books as one ZIP for TallyPrime: "1 - Masters.xml" (groups and ledgers with opening balances), one "Transactions FY<year>.xml" per financial year, "Holdings at end of FY<year>.xlsx" per year, and "README - How to import into Tally.txt".

**Why it exists:** Code comment: "the user's books as one ZIP ready for TallyPrime".

**Where to find it:** **Tools → Accounting**, header **Export to Tally** (also on Reports — [D-ACCT-002](../dependencies.md#d-acct-002)).

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click **Export to Tally** ("Preparing…").
2. The ZIP downloads with the toast "Tally export downloaded. The README inside has the import steps."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Export to Tally** | Button | Builds and downloads the ZIP | Hidden below Pro/Advisor; disabled while preparing |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A ZIP named after the account ("…-tally-export.zip") is downloaded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "The Tally export was stopped because Tally would reject part of it (N problems): …" | Your data breaks a Tally rule; no partial file is produced | Fix the listed records and try again |
| "Export failed (HTTP <status>)" | Other server failure | Try again |

**Limitations:** The export is built from your transactions, bank accounts, cash flows, loans, cards, rent and premiums directly — manual vouchers and your chart of accounts on this page are not included.

**How it works:** `GET /api/reports/download/tally-export` (Pro/Advisor-gated) builds the Tally book from source records and refuses to produce a file that would break a Tally rule.

**Related features:** [D-ACCT-002](../dependencies.md#d-acct-002).

**Sources:** `apps/web/src/components/tally/TallyExportButton.tsx:13`, `apps/web/src/components/tally/TallyExportButton.tsx:22`, `apps/web/src/api/tallyExport.api.ts:21`, `packages/api/src/services/accounting/tally/tallyZip.service.ts:38`, `packages/api/src/services/accounting/tally/tallyPackage.ts:23`, `packages/api/src/services/accounting/tally/tallySources.ts:278`, `packages/api/src/routes/reports.routes.ts:176`
