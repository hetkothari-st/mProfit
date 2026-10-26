---
id: F-INGEST-009
title: "What approving an event creates"
module: "Email ingestion"
status: Live
roles: "Approving users"
settings: []
related: [F-INGEST-004, F-INGEST-008]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# What approving an event creates

`F-INGEST-009` · Live · Roles: Approving users

**What it does:** Turns a confirmed event into a record in your books: buys and sells become transactions; money in and money out become cash-flow entries; some types are only marked as handled.

**Why it exists:** Code comments: approved events must update holdings and dashboards through the normal derived records, with the event kept as the audit trail.

**Where to find it:** Automatic on approval or auto-commit. Results appear in **Overview → Transactions** and **Overview → Cash Activity**.

**Who can use it:** Every user approving events.

**Steps:** Not applicable — runs when you approve ([F-INGEST-004](F-INGEST-004.md)) or on auto-commit.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results by event type:**
- **BUY**, **SELL** → a transaction (asset class Mutual Fund when the ISIN starts with "INF", otherwise Equity); if the same trade already exists from a contract note or CAS, the event is linked to it and nothing new is written. **FNO_TRADE** → an F&O transaction.
- **DIVIDEND**, **INTEREST_CREDIT**, **MATURITY_CREDIT**, **UPI_CREDIT**, **NEFT_CREDIT** → cash-flow inflow.
- **INTEREST_DEBIT**, **EMI_DEBIT**, **CARD_PURCHASE**, **CARD_PAYMENT**, **UPI_DEBIT**, **NEFT_DEBIT** → cash-flow outflow.
- **PREMIUM_PAID** → cash-flow outflow, then an attempt to link it to a matching insurance policy.
- **RENT_RECEIVED**, **RENT_PAID**, **VEHICLE_CHALLAN**, **FD_CREATION**, **FD_MATURITY**, **SIP_INSTALLMENT**, **VALUATION_SNAPSHOT**, provident-fund types, F&O lifecycle types and **OTHER** → marked handled with no record written.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "… requires amount and quantity to project" / "… requires amount to project" | Missing figures | Reject and enter by hand |
| "User has no portfolio to project this event into" | No portfolio | Create one |
| "FNO_TRADE requires underlying, instrument_type, expiry_date, side" | Incomplete F&O event | Enter the trade by hand |

**Limitations:** An approved SIP instalment, FD, rent or challan email creates no transaction or cash-flow entry. Bonds, FDs and other classes are never created from emails. Rows go to the event's portfolio, else your default, else your first portfolio.

**How it works:** Projection accepts only CONFIRMED events (already PROJECTED → no-op). The domain row, the status flip to PROJECTED and the back-reference are written in one database transaction; holdings for the asset are recomputed afterwards.

**Related features:** [F-INGEST-004](F-INGEST-004.md), [F-INGEST-008](F-INGEST-008.md), [D-INGEST-001](../dependencies.md#d-ingest-001), [D-INGEST-002](../dependencies.md#d-ingest-002), [D-IMPORT-006](../dependencies.md#d-import-006).

**Sources:** `packages/api/src/ingestion/projection.ts:100`, `packages/api/src/ingestion/projection.ts:145`, `packages/api/src/ingestion/projection.ts:154`, `packages/api/src/ingestion/projection.ts:463`, `packages/api/src/ingestion/projection.ts:485`, `packages/api/src/ingestion/projection.ts:503`, `packages/api/src/ingestion/projection.ts:510`, `packages/api/src/ingestion/projection.ts:537`
