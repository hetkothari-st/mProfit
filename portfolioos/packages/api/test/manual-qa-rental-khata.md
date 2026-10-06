# Manual QA — rental khata ledger

> **Status: UNEXECUTED.** This checklist was written but not worked through — the
> dev server is not running and the database is empty in this environment. Tick
> items only after exercising them against a live app + a running Postgres with
> real data.

- [ ] Add a property and a tenancy with a security deposit → khata shows "Deposit held" and the deposit does not change the balance.
- [ ] Balance equals the sum of unpaid rent charges immediately after creating the tenancy.
- [ ] Record a part payment → month shows PARTIAL, balance drops by that amount.
- [ ] Record the remainder → month shows RECEIVED, balance drops to zero.
- [ ] Record an over-payment → balance goes negative and reads "In advance".
- [ ] Record a payment larger than one month with two months overdue → oldest month settles first.
- [ ] Pin a payment to a specific month → that month settles even though an older one is open; the excess spills to the older month.
- [ ] Add a LATE_FEE → balance increases; add a DISCOUNT → balance decreases.
- [ ] Delete a payment entry → balance and month status return to exactly their prior values.
- [ ] Skip a month with no payments → it leaves the balance; unskip restores it.
- [ ] Skip a month that has a payment → rejected with a clear error.
- [ ] Collections tab lists only tenants with dues, sorted by amount, with the right oldest pending month.
- [ ] Remind opens WhatsApp with the tenant's number, the amount, and the property's payment instructions.
- [ ] Remind is disabled for a tenant with no phone number.
- [ ] Share statement downloads a PDF whose closing balance matches the screen.
- [ ] Every money value in the API responses is a string, not a JSON number.
- [ ] Dashboard rent figures and the rental P&L still match what they showed before this branch.
- [ ] Cross-user check: with user A's session, GET another user's tenancy ledger → 403 or 404, never 200.

## Added during review (not in the original task brief)

- [ ] Overpay one month so the surplus spills onto a later month via FIFO, then try "unmark received" on that later month → it refuses with a message pointing at the khata. Delete the payment from the khata instead → both months return to their prior state. (This is a known, deliberate limitation: undo works on payments pinned to a month, and spillover payments are removed from the khata directly.)
- [ ] Reclassify a ledger entry across the money-moving boundary (PAYMENT → DISCOUNT and back) → the portfolio's cash position gains and loses exactly one CashFlow row each time, and never orphans one.
- [ ] The tenant khata page and the collections tab were built before the backend endpoints existed, so neither was ever clicked through against a live server. Exercise every control on both: add an entry in each direction, delete one, switch tabs mid-dialog, use Remind with and without a tenant phone number, and download a statement.
- [ ] Run the app in dark mode and check the khata page's balance header, row colours and sticky bottom bar, plus the collections tab — none of it has been seen rendered.
