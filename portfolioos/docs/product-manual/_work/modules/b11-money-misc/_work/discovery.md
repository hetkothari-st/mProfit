# B11 discovery notes (money-misc)

Source commit 9d9025c4 · code-only · written by the B11 agent.

## Routes (App.tsx)
- /forex → pages/forex/ForexPage (tabs Cash, FX pairs, Foreign equities, LRS & TCS)
- /provident-fund → pages/assetClasses/ProvidentFundPage (override: B11); /provident-fund/extension → pages/pf/PfExtensionPairPage; /ppf, /epf → redirect
- /insurance, /insurance/:id, /insurance/coverage, /insurance/emergency-sheet, /insurance/help
- /goals, /income, /cashflows, /accounting

## Backend
- /api/insurance (insurance.routes.ts) — policies, premiums, claims, coverage, import suggestions, tax summary, gmail-fetch, documents, alerts/trigger
- /api/epfppf (pf.routes.ts) — accounts, sessions + SSE, passbook upload, uan-lookup, password-reset, extension pairing
- /api/forex — ticker, balances, lrs, tcs, pair pnl
- /api/goals (GOAL_PROJECTIONS, Plus), /api/income, /api/cashflows (+forecast), /api/accounting (ACCOUNTING_MODULE, Pro/Advisor), /api/reports/download/tally-export
- Jobs: alert scan 20:45 IST (insurance premium + claim reminders), insurance Gmail scan 05:30 IST, PF nudge 03:30 IST, FX hourly, pf-headless-fetch Bull queue

## Module checklist
- [x] Insurance (F-INS-001…025)
- [x] PPF & EPF (F-PF-001…011)
- [x] Forex (F-FX-001…009)
- [x] Goals (F-GOAL-001…004)
- [x] Income (F-INC-001…004)
- [x] Cash Activity (F-CASH-001…002)
- [x] Accounting (F-ACCT-001…014)

## Working method
Deliverables are written in `_work/src/` (and the manual in `_work/parts/`) with `@@path#anchor@@` tokens; a resolver replaces each token with `path:line` of the first line containing the anchor (`##n` for the n-th), so every citation points at the line holding the quoted token.
