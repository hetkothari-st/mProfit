---
id: F-LOAN-010
title: "Compare with market (refinance check)"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-LOAN-001, S-LOAN-003, S-LOAN-004, S-LOAN-009]
related: [F-EMI-001, F-EMI-007, F-EMI-010, F-LOAN-005, F-LOAN-013]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Compare with market (refinance check)

`F-LOAN-010` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** On an active loan, the **Compare with market** card shows your rate against the lowest current market rate for your loan type ("Market from X% (<lender>, as of <date>)"), lets you set switching costs (**Processing fee (%)**, **Other charges (₹)**), and shows the result of moving the outstanding balance to that rate: **New EMI** (with your current EMI and remaining months), **Interest saved**, **Switching costs**, **Net saving** and **Break-even**. For floating loans it also shows the latest benchmark (RBI repo rate or your lender's 1-year MCLR) and its last change. **Open in calculator** opens the EMI Calculator pre-filled with the switch.

**Why it exists:** The card's own text explains it: it estimates whether refinancing pays off after costs; "Floating loans get an alert when the repo rate or your lender's MCLR changes."

**Where to find it:** Loan detail page → **Compare with market** (route `/loans/:id`), shown only for loans with status **Active**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open an active loan. The card loads market rates.
2. If the card asks "Fixed or floating?", click **Fixed** or **Floating** to save the loan's rate type.
3. Adjust **Processing fee (%)** (default 0.5) and **Other charges (₹)** (default 10,000) if your new lender quotes different costs.
4. Read **Net saving** (green when above 0) and **Break-even** ("Break-even in month N" or "Switching would not pay off at these costs").
5. Click **Open in calculator** to see the full schedule of the switch ([F-EMI-001](F-EMI-001.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Fixed** / **Floating** | Buttons | Save the loan's rate type | Shown only when rate type is "Not sure"; disabled while saving |
| **Processing fee (%)** | Text | Switching cost as % of outstanding | Shown only when the market rate is below yours |
| **Other charges (₹)** | Text | Fixed switching cost | As above |
| **Open in calculator** | Link button | Opens `/emi` pre-filled | Hidden when there is no market rate, the remaining term is 0 or above 480 months, or the costs are invalid |
| **Try again** | Button | Reloads the card | Shown only after a load error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Processing fee (%)** | Text | Yes | 0–10 | 0.5 | "Enter a processing fee between 0 and 10%" |
| **Other charges (₹)** | Text | Yes | 0 to ₹100 crore; commas allowed | 10,000 | "Enter other charges in rupees" |

**Settings and toggles here:** [S-LOAN-003](../settings/loans.md#s-loan-003) **Rate type** (set here by **Fixed** / **Floating**, or in Edit) and [S-LOAN-004](../settings/loans.md#s-loan-004) **Linked to** decide which benchmark line shows; [S-LOAN-009](../settings/loans.md#s-loan-009) **Switching costs** (the two fields above) change the result for this visit only. Loan type ([S-LOAN-001](../settings/loans.md#s-loan-001)) **Other** has no market data. The account setting **Loan rate alerts** ([D-LOAN-002](../dependencies.md#d-loan-002)) controls whether the daily job also alerts you ([F-LOAN-013](F-LOAN-013.md)).

**Results:** Only **Fixed** / **Floating** changes stored data (the loan's rate type). The switching costs are not saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load market rates." | `GET /api/loans/:id/market-check` failed | Click **Try again** |
| "No market data for this loan type." | Loan type **Other** | None — no market rates exist for it |
| "Market rates are not available yet." | No fresh, believable market rate for this loan type | Wait for the daily rate refresh ([F-EMI-010](F-EMI-010.md)) |
| "Nothing left to refinance on this loan." | No unpaid EMIs from today, or nothing outstanding | None |
| "Your rate is already at or below the lowest market rate." | Market minimum ≥ your rate | None |
| "Fixed rate - no benchmark alerts." | Rate type Fixed | — |
| "Set what the rate is linked to (repo or MCLR) in Edit to get change alerts." | Floating with **Linked to** not set or **Other / not sure** | Set **Linked to** in Edit |
| "No benchmark data yet." | Floating repo/MCLR loan but no benchmark rows yet (for example an MCLR loan with LIC Housing Finance) | — |
| "Your lender isn't on our MCLR list, so this shows the repo rate." | MCLR loan whose lender name does not match a tracked lender | Use the lender's standard name |
| Toast "Couldn't save the rate type" | Saving the rate type failed | Try again |

**Limitations:** "Indicative. Lenders price by credit score, amount and tenure; switching costs are estimates." The comparison re-amortises the outstanding balance over the same remaining months at both rates; it ignores prepayment penalties and your credit profile. Only these lender names are matched for MCLR: SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, PNB, Bank of Baroda, Canara Bank, Union Bank, LIC Housing Finance (with common short forms); look-alikes such as "PNB Housing Finance" do not match.

**How it works:** `GET /api/loans/:id/market-check` returns the loan's outstanding, remaining EMIs and next EMI date (from the same summary as [F-LOAN-005](F-LOAN-005.md)), the best market rate for the loan's type (lowest effective minimum rate that is not stale and lies within 4–30%), and for Floating loans the benchmark series (repo, or the matched lender's 1-year MCLR; MCLR with an unmatched lender falls back to repo). The browser computes: switching cost = outstanding × fee% ÷ 100 + other charges (rounded half-up to paise); both plans are built with the shared EMI engine over the remaining months; gross saving = current interest − new interest; net saving = gross − switching cost; break-even = first month whose cumulative EMI difference covers the costs (only when net saving > 0). **Open in calculator** encodes the outstanding (rounded to rupees), the market rate, the remaining months, the next EMI date, the fee as a % with GST 0 and the other charges into an `/emi` share link.

**Related features:** [F-LOAN-013](F-LOAN-013.md), [F-EMI-001](F-EMI-001.md), [F-EMI-007](F-EMI-007.md), [F-EMI-010](F-EMI-010.md), [D-LOAN-002](../dependencies.md#d-loan-002).

**Sources:** `apps/web/src/pages/loans/MarketCheckCard.tsx:17`, `apps/web/src/pages/loans/MarketCheckCard.tsx:50`, `apps/web/src/pages/loans/MarketCheckCard.tsx:81`, `apps/web/src/pages/loans/MarketCheckCard.tsx:100`, `apps/web/src/pages/loans/MarketCheckCard.tsx:129`, `apps/web/src/pages/loans/MarketCheckCard.tsx:135`, `apps/web/src/pages/loans/MarketCheckCard.tsx:150`, `apps/web/src/pages/loans/MarketCheckCard.tsx:162`, `apps/web/src/pages/loans/marketCheck.ts:27`, `apps/web/src/pages/loans/marketCheck.ts:44`, `apps/web/src/pages/loans/marketCheck.ts:69`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:45`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:61`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:92`, `packages/api/src/services/loans/loanChecks/lenderAlias.ts:8`, `packages/shared/src/loans/loanChecks.ts:55`, `packages/shared/src/loans/loanChecks.ts:88`
