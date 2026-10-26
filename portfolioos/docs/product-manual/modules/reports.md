[Index](../INDEX.md)

# Reports

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Reports** page (sidebar **Tools → Reports**, route `/reports`, page title "Reports — Capital gains, income, XIRR and historical valuation") is where you read and download figures computed from your transactions: on-screen tables for capital gains, income, XIRR and valuation history, four statements, a catalog of 42 print-style "Tax & MIS" downloads, and the review queue for documents found in your Gmail. A data-checks banner above the tabs says whether the figures can be trusted. The same reporting engine also powers the **Download** button that appears on many other pages ([F-REPORT-016](../features/F-REPORT-016.md)), and a nightly job keeps stored figures in step with your transactions ([F-REPORT-017](../features/F-REPORT-017.md)).

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-REPORT-001](../features/F-REPORT-001.md) | Reports page filters and tabs | Live | Gives the page its common filter card — Portfolio, Report for (only when you can report on someone else), Financial Year (only on tabs that … |
| [F-REPORT-002](../features/F-REPORT-002.md) | Report search | Live | A search box above the filters ("Search reports… e.g. |
| [F-REPORT-003](../features/F-REPORT-003.md) | Data checks banner and Fix now | Live | Above every tab except Inbox imports, a line says whether the reports can be trusted: "All data checks passed." with "Data as of: … |
| [F-REPORT-004](../features/F-REPORT-004.md) | Summary tab | Live | Shows three cards — Portfolio (name, currency, number of transactions and holdings), Unrealised (Invested, Value, P&L) and XIRR (Overall, … |
| [F-REPORT-005](../features/F-REPORT-005.md) | Unrealised P&L tab | Live | Lists every open holding with Asset, Class, Qty, Avg, CMP (current market price), Invested, Value, P&L and %, under a heading "N holdings · … |
| [F-REPORT-006](../features/F-REPORT-006.md) | Capital gains tabs: Intraday, STCG, LTCG, Schedule 112A | Live | Four tabs listing realised gains for the chosen FY, one row per FIFO match of a sale to a purchase: Asset, Buy Date, Sell Date, Qty, Buy ₹, … |
| [F-REPORT-007](../features/F-REPORT-007.md) | Income tab | Live | Lists dividends, interest and maturity credits in the FY (Date, Type, Asset, Amount, Narration), headed "Dividends ₹… · Interest ₹… · Total … |
| [F-REPORT-008](../features/F-REPORT-008.md) | XIRR tab | Live | Table "Annualized Returns (XIRR)" with rows Overall, 1 Year, 3 Year, 5 Year and columns XIRR, Invested, Terminal Value, Cashflows. |
| [F-REPORT-009](../features/F-REPORT-009.md) | Historical tab | Live | "Monthly valuation history · N points": one row per month-end since your first transaction, with Cost, Value and number of Holdings. |
| [F-REPORT-010](../features/F-REPORT-010.md) | Excel / PDF download of the open tab | Live | On Unrealised P&L, Intraday, STCG, LTCG, Schedule 112A and Income, the Excel and PDF buttons download the same report as a file named … |
| [F-REPORT-011](../features/F-REPORT-011.md) | Statements tab | Live | Four download cards, each with PDF and Excel: Holdings Statement (per-asset positions by class with avg cost, market value, unrealised P&L … |
| [F-REPORT-012](../features/F-REPORT-012.md) | Tax & MIS downloads — inputs and free reports | Live | The Tax & MIS downloads tab is a catalog of 42 print-style reports (PDF + Excel each; Export to Tally is ZIP). |
| [F-REPORT-013](../features/F-REPORT-013.md) | Tax & CA Report Catalog (Plus) | Live | 34 further catalog reports, available from the Plus plan: Grandfathering LTCG (Sec 112A); Demat Account-wise Holdings; M2M Report — Equity … |
| [F-REPORT-014](../features/F-REPORT-014.md) | Accounting reports and Export to Tally (Pro/Advisor) | Live | Six catalog entries for the double-entry books: Trial Balance, Account Ledger — All Accounts, Profit & Loss Statement, Balance Sheet, Chart … |
| [F-REPORT-015](../features/F-REPORT-015.md) | Inbox imports tab | Live | The review queue for attachments found by a Gmail scan. |
| [F-REPORT-016](../features/F-REPORT-016.md) | Download Report dialog (on other pages) | Live | A Download button used on the dashboard and on many asset and liability pages (stocks, mutual funds, F&O, crypto, deposits, post office, … |
| [F-REPORT-017](../features/F-REPORT-017.md) | Nightly stored-data integrity check | Live | Every night at 02:15 IST the app first retries failed imports and emails, then, for every portfolio of every active user, recomputes … |

Settings for this module: [settings/reports.md](../settings/reports.md)
