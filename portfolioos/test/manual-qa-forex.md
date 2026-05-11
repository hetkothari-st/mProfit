# Forex Feature — Manual QA Checklist

Run after the forex feature is deployed and migrations
`20260511120000_forex` + `20260511130000_foreign_exchanges` are applied.

## Setup

- [ ] `pnpm dev` starts API + web cleanly.
- [ ] Open `http://localhost:5173`, log in.
- [ ] Sidebar shows "Forex" entry under Asset Classes (Globe icon).
- [ ] `/dashboard` shows the compact FX strip with at least USD/INR, EUR/INR, GBP/INR, JPY/INR rates.
- [ ] Strip badges show `RBI` (if scrape succeeded) or `YAHOO` (fallback).

## /forex page

- [ ] Page renders without console errors.
- [ ] Live ticker shows 11+ INR pairs and 6 cross pairs.
- [ ] Manual "Refresh" button updates rates and toasts a count.
- [ ] Ticker auto-updates every ~30 s (watch the source badge tick).

## Cash tab

- [ ] "Add balance" opens dialog. Required fields: currency, balance.
- [ ] Create USD 1000 balance with account # "9876543210", account label "Wise".
- [ ] Row appears with `··· 3210` masked account, balance `$1,000.00`, INR equivalent computed via live USDINR.
- [ ] Total card shows sum of all balances converted to INR.
- [ ] Edit pencil opens dialog; account # field is empty (leave blank to keep existing). Change balance to $1200, save. Row updates.
- [ ] Delete row. Confirm prompt → deletion succeeds.

## FX Pairs tab

- [ ] "Add transaction" opens TransactionFormDialog with FOREX_PAIR pre-selected.
- [ ] Form shows currency dropdown + fxRateAtTrade input under "Foreign currency" panel.
- [ ] Add BUY 1000 USDINR @ 82.00 (currency USD, fxRate 82.00).
- [ ] Holding appears in table. Live value = qty × current USDINR rate.
- [ ] Add SELL 500 USDINR @ 83.00.
- [ ] After SELL: open position drops to 500.
- [ ] Speculative P&L section shows realised P&L row for USDINR in current FY ≈ +500 (matched 500 × (83−82)).

## Foreign Equities tab

- [ ] "Add transaction" with FOREIGN_EQUITY.
- [ ] Asset search resolves "AAPL"; exchange defaults to NASDAQ.
- [ ] Set currency USD, fxRate 83.00, buy 10 @ $200.
- [ ] Holding appears; totalCost = ₹1,66,000 (10 × $200 × 83); currentValue = qty × live USD price × live USDINR.
- [ ] Edit transaction: currency/fxRate fields preserved on form open; modify and save retains values.

## LRS & TCS tab

- [ ] Utilisation gauge shows 0% initially.
- [ ] Record remittance: USD 1000, purpose INVESTMENT, today.
- [ ] Utilisation gauge advances proportionally.
- [ ] Record remittance approaching limit (e.g. USD 249,000 at $1=₹83 → ~₹2.06Cr) — gauge turns amber.
- [ ] Attempt remittance that exceeds USD 250k cap: server rejects with "LRS limit exceeded" message.
- [ ] In-dialog warning banner appears with "Adjust" + "Confirm anyway" buttons.
- [ ] Click "Confirm anyway" → server accepts with `forceConfirmed: true`; row persists; gauge crosses 100%.
- [ ] Create TcsCredit row (via API or future UI), link remittance with tcsDeducted > 0 → TcsCredit.usedAmount auto-increments.
- [ ] Delete the linked remittance → usedAmount auto-decrements.
- [ ] TCS table renders FY, collector, TAN, amount columns (no "Used" column per design).

## Dashboard accuracy

- [ ] After all above, `/dashboard` net-worth includes FOREIGN_EQUITY holdings in INR (not USD).
- [ ] Allocation breakdown labels show "Foreign Equity" and "FX Pair" (human-readable, not raw enum).
- [ ] Portfolio-value-over-time chart: invested line stays flat after the last transaction date (no drop to zero — confirms today-overwrite fix).
- [ ] Tooltip on chart shows consistent invested across post-last-tx range.

## Tax / Reports

- [ ] Capital gains report includes FOREIGN_EQUITY rows with 24-month LTCG threshold, no indexation column.
- [ ] FOREX_PAIR transactions do NOT appear in Capital Gains report (correctly classified as business income).
- [ ] Future Schedule FA section can be populated from `ForexBalance` + `LrsRemittance` + foreign-stock holdings.

## Regression

- [ ] INR-only transactions still load and behave unchanged.
- [ ] Existing EQUITY transactions show `currency=null` in API responses (backward compat).
- [ ] Existing reports (xlsx, pdf) still export without errors.
- [ ] Phase 4.5 invariant tests still pass (`pnpm --filter @portfolioos/api exec vitest run`).

## Security

- [ ] `ForexBalance.accountNumberEnc` is encrypted at rest (verify via SQL `SELECT account_number_enc FROM "ForexBalance" LIMIT 1` shows AES-GCM envelope, not plain).
- [ ] `GET /api/forex/balances` response contains `accountLast4` but no `accountNumberEnc`.
- [ ] `POST /api/forex/balances/:id/reveal` returns full account # only for the owning user; other-user request returns 403.
- [ ] `GET /api/forex/pairs/:portfolioId/pnl` returns 403/404 when portfolioId belongs to another user.
- [ ] RLS: cross-tenant `SELECT * FROM "ForexBalance"` via `portfolioos_app` role returns only current user's rows.

## Failure modes

- [ ] RBI scrape fails (block egress to rbi.org.in) → ticker still populates via Yahoo, source badge = YAHOO.
- [ ] LRS create without USD/INR rate available (`getLatestFxRate` returns null) → error message "No FX rate available for X→INR".
- [ ] Stale FX rate (date > 7 days old) — no auto-block; ticker shows old date in badge tooltip.
