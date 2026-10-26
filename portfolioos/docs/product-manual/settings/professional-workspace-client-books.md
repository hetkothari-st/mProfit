[Index](../INDEX.md)

# Settings — Professional workspace (Client books)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-ca-001"></a>
### Account type
| Attribute | Value |
|---|---|
| Control type | Select (new account only) |
| Location | **Client books → client → Chart of accounts → New account** |
| Purpose | Which statement side the balance falls on |
| Default | Asset (`apps/web/src/components/ca/AccountFormDialog.tsx:45`) |
| Values | Asset, Liability, Income, Expense, Equity |
| Depends on | Client's books right |
| Persists | Yes — server (client's books) |
| Stored in | Client's `Account.type` |
| Backend effect | Cannot be changed later from the page |
| Who can change | [R-PROF](../roles.md#r-prof) / [R-PRO](../roles.md#r-pro) with books right |
| Sources | `apps/web/src/api/ca.api.ts:419`, `packages/api/src/schemas/accounting.schema.ts:41` |

<a id="s-ca-002"></a>
### Voucher type
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Client books → client → Vouchers → Post voucher** |
| Purpose | Kind of voucher; also selects the next number series |
| Default | Journal (`apps/web/src/components/ca/VoucherFormDialog.tsx:51`) |
| Values | Journal, Payment, Receipt, Contra, Purchase, Sales |
| Depends on | Books right |
| Persists | Yes — server |
| Stored in | Client's `Voucher.type` |
| Backend effect | Next number fetched per (client, type) |
| Who can change | [R-PROF](../roles.md#r-prof) / [R-PRO](../roles.md#r-pro) with books right |
| Sources | `apps/web/src/api/ca.api.ts:420`, `packages/api/src/schemas/accounting.schema.ts:56` |

<a id="s-ca-003"></a>
### Transaction type and asset class
| Attribute | Value |
|---|---|
| Control type | Two selects |
| Location | **Client books → client → Transactions → Add transaction** |
| Purpose | Kind of trade and asset class; asset class decides which name fields show |
| Default | Buy / Equity (`apps/web/src/components/ca/AddTransactionDialog.tsx:41`) |
| Values | Types: Buy, Sell, SIP, Switch in, Switch out, Dividend payout, Dividend reinvest, Bonus, Split, Redemption · Asset classes: 26 (Equity, Mutual fund, ETF, bonds, deposits, NPS/PPF/EPF, gold/silver, crypto, REIT/InvIT, PMS/AIF/ULIP, foreign equity, real estate, art, cash, other) |
| Depends on | Transactions right |
| Persists | Yes — server |
| Stored in | Client's `Transaction` |
| Backend effect | Mutual fund → scheme fields; Equity/ETF/Foreign equity → symbol fields; others → asset name |
| Who can change | [R-PROF](../roles.md#r-prof) / [R-PRO](../roles.md#r-pro) with transactions right |
| Sources | `apps/web/src/api/ca.api.ts:394`, `apps/web/src/api/ca.api.ts:406`, `apps/web/src/components/ca/AddTransactionDialog.tsx:72` |

<a id="s-ca-004"></a>
### Report period filters
| Attribute | Value |
|---|---|
| Control type | Select + three date fields |
| Location | **Client books → client → Reports** |
| Purpose | Parameters for each report (each uses what it needs) |
| Default | Current FY (April–March); As-of and To = today; From blank (`apps/web/src/components/ca/ClientReportsTab.tsx:37`) |
| Values | Financial year: current and 5 previous · dates YYYY-MM-DD |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | Sent as `fy`, `asOf`, `from`, `to` |
| Who can change | [R-PROF](../roles.md#r-prof), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/components/ca/ClientReportsTab.tsx:81` |
