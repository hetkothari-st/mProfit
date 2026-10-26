---
id: F-ACCT-008
title: "Receipts"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: [S-ACCT-005]
related: [F-ACCT-004]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Receipts

`F-ACCT-008` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Each voucher can be opened as a PDF receipt (**View receipt**) or downloaded (**Download receipt (PDF)**); rent, premium and loan vouchers become a "Rent Receipt", "Premium Payment Receipt" or "Loan Payment Receipt", others a plainer voucher receipt. **Receipts (ZIP)** downloads every rent, premium and loan receipt (plus RECEIPT and PAYMENT vouchers) matching the type filter as one PDF each; **Receipts (Excel)** gives the same set as one totalled spreadsheet.

**Why it exists:** Code comment: "a receipt is the document somebody actually wants — to hand a tenant, to attach to a return, to keep."

**Where to find it:** **Tools → Accounting → Vouchers** (row buttons and header buttons).

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click the eye on a row to open the receipt in a new tab, or the download arrow to save `<date>-<voucher no>.pdf`.
2. Click **Receipts (ZIP)** or **Receipts (Excel)** to download `receipts.zip` / `receipts.xlsx` for the current filter.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Eye (title "View receipt") | Button | Opens the PDF | — |
| Download (title "Download receipt (PDF)") | Button | Saves the PDF | — |
| **Receipts (ZIP)** / **Receipts (Excel)** | Buttons | Bundle download | Disabled while one is being built |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-ACCT-005](../settings/accounting.md#s-acct-005) (the type filter decides the bundle).

**Results:** Files are downloaded; nothing is stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error (for example status 404) on a bundle | No receipts in the selection ("No receipts in that range.") — the page doesn't show the server text | Change the type filter |
| A new tab doesn't open | Pop-ups blocked | Allow pop-ups, or use download |

**Limitations:** A bundle holds the newest 500 receipts; when more exist only a response header says so. Bundles can't be limited by date in the app.

**How it works:** `GET /api/accounting/vouchers/:id/receipt.pdf` (`?inline=true` to view), `GET /api/accounting/receipts.zip|.xlsx?type=`; receipts are built one at a time.

**Related features:** [F-ACCT-004](F-ACCT-004.md).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:373`, `apps/web/src/pages/accounting/AccountingPage.tsx:443`, `apps/web/src/api/accounting.api.ts:217`, `packages/api/src/controllers/accounting.controller.ts:250`, `packages/api/src/services/receipts/receiptBundle.ts:41`, `packages/api/src/services/receipts/receiptData.ts:231`
