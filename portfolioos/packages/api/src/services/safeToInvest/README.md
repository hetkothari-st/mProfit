# Safe-to-Invest

A monthly SIP sized on the user's lean-month income, so it never has to be paused.

```
lean-month income   P20 of the last 12 complete IST months of income credits
− fixed costs       active EMIs + premiums/12 + owner-occupied maintenance
                    + Personal Inflation items with isFixed (deduped by sourceRef)
− everyday buffer   P75 of monthly card/UPI/NEFT spend − those fixed expenses
                    (or the user's override, or 30% of lean with < 3 months of debits)
= safe amount       floored to ₹500, never below 0
```

- **Computed on read** (`safeToInvest.service.ts#getSummary`) from `CanonicalEvent`
  (CONFIRMED/PROJECTED). A newly approved bank alert shows on the next load; there is
  no cache to invalidate.
- **Income credits**: UPI_CREDIT / NEFT_CREDIT, classified by `creditClassifier.ts`.
  Own-account transfers (user's first + last name, "self", sweeps), refunds, loan
  payouts, investment money and non-INR credits are left out with a reason. The user
  overrides per credit (`SafeToInvestCreditDecision`) or types a month's total
  (`SafeToInvestMonth`).
- **Gaps**: a month with no bank events at all is a gap, excluded from the maths —
  never ₹0. A month with debits but no income credits is a real ₹0 month.
- **Thin history**: under 6 months of data, lean = declared `Income` trimmed
  (salary 90%, rental 85%, other 80%, capital gains ignored); no stability score.
- **Stability score**: lean ÷ median × 100 (≥85 stable, 60–84 somewhat variable, <60 variable).
- **Top-up**: `topUpShare` (default 50%) of the current month's income above lean, floored to ₹100.
- **Current SIPs**: active `SipPlan` rows normalised to monthly, else the 3-month
  average of SIP transactions; "missed months" counts months without a SIP after the first.
- **Not used**: uploaded bank statements (they land as CASH `Transaction` rows and would
  double count against alerts). The app never edits real SIP mandates.
- **Spending store (`stiSpendStore.ts`)**: once the user agrees to the spending
  notice (Personal Inflation) and the store has rows in the window, income and
  the buffer come from `SpendTxn` / `SpendMonthlyCategory` instead
  (`dataSource: 'SPENDING'`), so both pages use the same figures:
  - Income: credits categorised `income`, duplicates across sources counted
    once, own-account transfers, refunds, investment money and loan payouts
    left out. The user's per-credit choices still win (except on a duplicate).
  - Buffer: everyday categories plus unsorted spending and cash, one-offs
    out, refunds netted; card bills count only when no card purchases are
    seen. A fixed expense matched to a bank payment has that payment taken
    out month by month, instead of every fixed expense being subtracted.
  Without consent, everything above works from bank alerts as before.
