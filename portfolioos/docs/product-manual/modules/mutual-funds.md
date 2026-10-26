[Index](../INDEX.md)

# Mutual Funds

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Mutual Funds** page (sidebar **Asset Classes → Mutual Funds**, route `/mutual-funds`) shows every mutual fund you hold across all your portfolios, priced from the AMFI NAV, together with every way the app offers to bring mutual fund data in: a CAS PDF upload, two "send me my CAS by email" requests, an inbox scan, a manual transaction, and an operator-facing Finvu (account aggregator) sandbox. It also carries a free Direct-vs-Regular check. The deeper research (scores, overlap, tax lots) lives in [Mutual Fund Analytics](#mutual-fund-analytics), reached with the **Portfolio analysis** button.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-MF-001](../features/F-MF-001.md) | Mutual fund holdings overview | Live | Shows four summary tiles — Current value, Invested, Unrealised P&L, Return — and a holdings table with one row per mutual fund position: … |
| [F-MF-002](../features/F-MF-002.md) | Mutual fund transactions list | Live | Lists your mutual fund transactions (newest first) under the heading Transactions with Date, Scheme (and ISIN), Type, Units (3 decimals), … |
| [F-MF-003](../features/F-MF-003.md) | CAS PDF upload and Recent imports | Live | The Automated CAS Import card lets you drop or choose a CAMS / KFintech Consolidated Account Statement (CAS) file; the file is parsed in … |
| [F-MF-004](../features/F-MF-004.md) | Sync AMFI NAV | Live | The Sync AMFI NAV button downloads the current AMFI NAV file on demand and stores the latest NAV for every scheme, creating scheme records … |
| [F-MF-005](../features/F-MF-005.md) | Sync MF via CASParser | Live | The Sync MF via CASParser button opens the dialog Sync Mutual Funds via PAN + Email. |
| [F-MF-006](../features/F-MF-006.md) | Sync via CAMS / KFintech | Live | The Sync via CAMS / KFintech button opens Sync Mutual Funds via CAMS + KFintech CAS. |
| [F-MF-007](../features/F-MF-007.md) | Scan inbox | Live | The Scan inbox button checks your connected Gmail for new CAS emails right away instead of waiting for the scheduled poll. |
| [F-MF-008](../features/F-MF-008.md) | Direct vs Regular & overlap | Live | The card Plan analysis — Direct vs Regular & overlap counts your schemes by plan type and groups schemes that look like the same fund under … |
| [F-MF-009](../features/F-MF-009.md) | Finvu (Account Aggregator) sandbox explorer | Partial | The card Finvu (Account Aggregator) via Finfactor Wealthscape lets you send a Unique identifier to eight Finfactor Wealthscape mutual fund … |
| [F-MF-010](../features/F-MF-010.md) | Finvu import to portfolio | Partial | In the Import into EveryPaisa box of the Finvu card, Import to portfolio fetches the insights and full statement for the current Unique … |

Settings for this module: [settings/mutual-funds.md](../settings/mutual-funds.md)
