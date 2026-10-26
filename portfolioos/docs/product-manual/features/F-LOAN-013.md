---
id: F-LOAN-013
title: "Refinance and benchmark-change alerts"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (opted in)"
settings: [S-LOAN-001, S-LOAN-003, S-LOAN-004, S-LOAN-005]
related: [F-EMI-010, F-LOAN-003, F-LOAN-010]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Refinance and benchmark-change alerts

`F-LOAN-013` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (opted in)

**What it does:** Every morning, checks each active loan taken against live lender rates and benchmark rates and creates two kinds of alert. **Refinance**: "<Loan type> with <lender> at X%; market from Y%" — "Switching could save ≈ ₹… after switching costs (lowest: <lender>). Open the loan to compare." **Benchmark change** (floating loans): "RBI cut the repo rate by 0.25% on <date>" or "<lender> raised its 1-year MCLR by …" — "Your <lender> loan rate should drop at the next reset (≈ <date>). Estimated: EMI ≈ ₹… or tenure −N months, assuming the full change is passed on."

**Why it exists:** The Settings description says: "Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes" — checked every morning against live lender rates and RBI / MCLR changes.

**Where to find it:** **Alerts** ([D-LOAN-001](../dependencies.md#d-loan-001)), labelled **Loan refinance** and **Loan rate change**; clicking opens the loan (`/loans/:id`). Turned on or off in **Settings → Notifications → Loan rate alerts** ([D-LOAN-002](../dependencies.md#d-loan-002)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with **Loan rate alerts** on (default on); managed family profiles are included.

**Steps:** Not applicable — automatic. Set your loan's **Rate type** and **Linked to** ([F-LOAN-003](F-LOAN-003.md)) to receive benchmark alerts.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** **Loan rate alerts** (Settings, [D-LOAN-002](../dependencies.md#d-loan-002)) — on: included in the daily check; off: no refinance or benchmark alerts. [S-LOAN-003](../settings/loans.md#s-loan-003) **Rate type** / [S-LOAN-004](../settings/loans.md#s-loan-004) **Linked to** — only **Floating** loans linked to **Repo rate (EBLR)** or **MCLR** get benchmark alerts; MCLR alerts need a lender name that matches a tracked lender. [S-LOAN-005](../settings/loans.md#s-loan-005) **Next rate reset** — used to estimate the reset date in the alert. [S-LOAN-001](../settings/loans.md#s-loan-001) **Loan type** **Other** gets no refinance alert.

**Results:** At most one refinance alert per loan per calendar month, and one benchmark alert per loan per benchmark change.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No refinance alert though the market looks cheaper | Your rate is less than 0.50 percentage points above the market minimum, or the net saving after default costs (0.5% + ₹10,000) is 0 or less | Use **Compare with market** ([F-LOAN-010](F-LOAN-010.md)) with your own costs |
| No benchmark alert after an RBI change | Loan not Floating/linked, loan added after the change was seen, change older than 30 days or larger than 1.00 point, or **Loan rate alerts** off | Set the rate fields; check the setting |

**Limitations:** Runs once a day at 07:30 IST right after the rate refresh; admin "Run now" refreshes rates without running these checks. Market rates come from lender web pages and can be missing or stale ([F-EMI-010](F-EMI-010.md)). Estimates assume the full benchmark change is passed on.

**How it works:** At 07:30 IST the job refreshes rates, then (even if the refresh failed) runs the checks. Under a system context it reads benchmark changes — for repo and each lender's 1-year MCLR, the net move from the last row fetched before a 7-day window to the latest row in it, skipped when zero, larger than 1.00 point, dated in the future or more than 30 days ago — and the eligible users (owners of active loans who are active, not scheduled for deletion, opted in, and not a CA-owned shadow client unless managed). Each user's loans are then checked under that user's context. Refinance: loan type maps to a market type; skip if current rate − market minimum < 0.50; compute net saving with the default costs over the loan's remaining EMIs; alert if > 0, key `loan:refi:<loan>:<YYYY-MM>`. Benchmark: for each applicable change fetched after the loan was created, estimate the new EMI over the remaining months and the tenure change at the current EMI, roll the stored reset date forward by 3 months (repo) or 12 months (MCLR) to on/after today, key `loan:bench:<loan>:<kind>:<date>`. One market lookup per loan type is shared across users; a failure on one loan or user is logged and the rest continue.

**Related features:** [F-LOAN-010](F-LOAN-010.md), [F-EMI-010](F-EMI-010.md), [D-LOAN-001](../dependencies.md#d-loan-001), [D-LOAN-002](../dependencies.md#d-loan-002).

**Sources:** `packages/api/src/jobs/loanRatesJob.ts:120`, `packages/api/src/jobs/loanRatesJob.ts:141`, `packages/api/src/jobs/loanChecksJob.ts:34`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:22`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:44`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:93`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:159`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:178`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:202`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:29`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:63`, `packages/shared/src/loans/loanChecks.ts:34`, `packages/shared/src/loans/loanChecks.ts:53`, `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:53`, `apps/web/src/pages/alerts/alertLinks.ts:15`
