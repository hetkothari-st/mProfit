[Index](../INDEX.md)

# Settings — Futures & Options

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-fno-001"></a>
### Auto-approve expiry close
| Attribute | Value |
|---|---|
| Control type | Boolean (API only — no control in the app) |
| Location | None in the UI; `PATCH /api/fo/settings/:portfolioId` `{ autoApproveExpiryClose }` |
| Purpose | Let the 17:30 IST expiry job close expiring F&O positions without waiting for **Approve** |
| Default | `false` (source: packages/api/prisma/schema.prisma:2863) |
| Values | `true`: when a settlement price exists the job approves the close immediately · `false`: request waits on the **Expiry** tab |
| Depends on | A stored settlement price (never auto-closes without one) |
| Persists | Yes — server |
| Stored in | PortfolioSetting.autoApproveExpiryClose (per portfolio) |
| Backend effect | Read by `scanExpiringPositions` |
| Who can change | Portfolio owner via the API |
| Sources | packages/api/src/controllers/fo.controller.ts:274, packages/api/src/services/fo/foExpiry.service.ts:77 |

<a id="s-fno-002"></a>
### Default equity tax treatment
| Attribute | Value |
|---|---|
| Control type | Enum (API only — no control in the app) |
| Location | None in the UI; `PATCH /api/fo/settings/:portfolioId` `{ defaultEquityTaxTreatment }` |
| Purpose | Intended per-portfolio default for treating equity trades as capital gains or business income |
| Default | `CAPITAL_GAINS` (source: packages/api/prisma/schema.prisma:622) |
| Values | `CAPITAL_GAINS` · `BUSINESS_INCOME` |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Portfolio.defaultEquityTaxTreatment |
| Backend effect | None found: no code reads the stored value |
| Who can change | Portfolio owner via the API |
| Sources | packages/api/src/controllers/fo.controller.ts:283 |
