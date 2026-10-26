---
id: F-ACCT-007
title: "Generate vouchers from activity"
module: "Accounting"
status: Live
roles: "R-PRO, R-MANAGER"
settings: []
related: [F-ACCT-004, F-ACCT-009, F-ACCT-012]
---

[← Accounting](../modules/accounting.md) · [Index](../INDEX.md)

# Generate vouchers from activity

`F-ACCT-007` · Live · Roles: [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Generate from activity** creates, updates or removes "auto" vouchers so the books match your activity: buys, SIPs and deposits (PURCHASE: investment Dr, bank Cr), dividend reinvestment and opening balances (JOURNAL), sales and redemptions (SALES, splitting short-term, long-term and intraday gains or losses), dividends and interest (RECEIPT), realised F&O profit or loss, loan disbursements and loan payments (principal, interest, processing fees), rent received and insurance premiums. The same projection runs automatically before the ledger and every statement is shown.

**Why it exists:** Button tooltip: "Auto-create vouchers from BUY/SELL transactions, dividends, rent receipts, loan EMIs and premium payments".

**Where to find it:** **Tools → Accounting → Vouchers → Generate from activity**.

**Who can use it:** [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click **Generate from activity** ("Generating…").
2. Read the toast: "Created N voucher(s) from existing activity" or "No new vouchers — every existing transaction is already projected".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | Runs the projection | Disabled while running |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Auto vouchers numbered `AUTO-<kind>-<id>` are created, rewritten when their source changed, and deleted when their source is gone.

**Errors and troubleshooting:** Per-voucher failures are counted and skipped.

**Limitations:** The toast reports only newly created vouchers; updates and removals are not mentioned. Investment accounts by asset class: equity/ETF → Equity Holdings; mutual funds → Mutual Fund Holdings; FD/RD → Fixed Deposits; bonds → Bonds & Debentures; gold → Gold Holdings; F&O, insurance, ULIP and cash are not booked as investments; others → Other Investments. All money moves through **Bank Accounts** (1001).

**How it works:** `POST /api/accounting/generate-from-activity`; ledger, trial balance, P&L and balance sheet requests call the same projection first and log (not show) a failure.

**Related features:** [F-ACCT-004](F-ACCT-004.md), [F-ACCT-009](F-ACCT-009.md) to [F-ACCT-012](F-ACCT-012.md), [D-ACCT-001](../dependencies.md#d-acct-001).

**Sources:** `apps/web/src/pages/accounting/AccountingPage.tsx:465`, `apps/web/src/pages/accounting/AccountingPage.tsx:410`, `packages/api/src/services/accounting/accounting.service.ts:854`, `packages/api/src/services/accounting/accounting.service.ts:779`, `packages/api/src/services/accounting/accounting.service.ts:750`, `packages/api/src/controllers/accounting.controller.ts:142`
