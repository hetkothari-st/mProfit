[Index](../INDEX.md)

# Settings — Transactions

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-txn-001"></a>
### Transactions portfolio filter
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Transactions page |
| Purpose | Show one portfolio's transactions |
| Default | **All portfolios** (source: `apps/web/src/pages/transactions/TransactionsPage.tsx:18`) |
| Values | All portfolios · one portfolio; changing it returns to page 1 |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `portfolioId` query on `/api/transactions` |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/transactions/TransactionsPage.tsx:84` |
