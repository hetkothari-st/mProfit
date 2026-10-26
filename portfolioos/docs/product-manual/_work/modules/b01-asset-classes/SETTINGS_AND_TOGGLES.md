# Settings and Toggles Reference — B01 Asset classes fragment

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Stocks, Futures & Options, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Other Assets (batch B01)

<!-- BEGIN SETTINGS -->
## Gold & Silver → Live rate bar

### Gold purity <!-- S-GOLD-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Asset Classes → Gold & Silver**, rate bar next to **Gold** (aria label "Gold purity") |
| Purpose | Choose which gold karat's price per gram the bar shows |
| Default | `24` (24K · 999) — first option (source: apps/web/src/lib/metalPurity.ts:32, apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:43) |
| Values | `24` 24K · 999 (factor 1) · `22` 22K · 916 (22/24) · `18` 18K · 750 (18/24) · `14` 14K · 585 (14/24) |
| Depends on | Live gold price available |
| Persists | This device only |
| Stored in | localStorage `everypaisa.goldTicker.karat` |
| Backend effect | None; does not change holding values |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (any signed-in user) |
| Sources | apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:37, apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:53 |

### Silver purity <!-- S-GOLD-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Asset Classes → Gold & Silver**, rate bar next to **Silver** (aria label "Silver purity") |
| Purpose | Choose which silver grade's price per gram the bar shows |
| Default | `999` (999 Fine) — first option (source: apps/web/src/lib/metalPurity.ts:39) |
| Values | `999` 999 Fine (×1) · `925` 925 Sterling (×0.925) · `800` 800 (×0.8) |
| Depends on | Live silver price available |
| Persists | This device only |
| Stored in | localStorage `everypaisa.goldTicker.silverPurity` |
| Backend effect | None |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:39, apps/web/src/lib/metalPurity.ts:38 |

## Futures & Options → Portfolio F&O settings (no screen)

### Auto-approve expiry close <!-- S-FNO-001 -->
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

### Default equity tax treatment <!-- S-FNO-002 -->
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
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| everypaisa.goldTicker.karat | Gold purity chosen in the Gold & Silver rate bar | Purity picked | Never (until changed) | No — preference only; ignored if not a valid option |
| everypaisa.goldTicker.silverPurity | Silver purity chosen in the rate bar | Purity picked | Never (until changed) | No — preference only |
| Detail-page navigation state (Gold, Crypto, Post Office, FD) | The holding row handed from the list to its detail page (in browser history, not storage) | Clicking a list row | Not refreshed | Yes — Gold, Crypto and Post Office detail figures stay as they were when opened until you reopen from the list; a refresh or direct link loses it (FD looks the holding up instead) |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| ENABLE_FO_EXPIRY_CRON | Turns the 17:30 IST F&O expiry-close job on or off | Job runs; set to `false` to disable |
| ENABLE_PRICE_CRONS | Turns all price jobs (stocks, commodities, crypto, F&O bhavcopy/live) on or off | Jobs run; `false` disables them and values stop updating |
| ENABLE_ALERT_CRONS | Turns the 20:45 IST daily alert scan (deposit, Post Office maturity alerts) on or off | Scan runs; `false` disables it |
| MAX_UPLOAD_SIZE_MB | Maximum size of an entry photo upload | 50 MB |
| FRONTEND_URL | Used to build the "frontend callback hint" shown with the broker redirect address | Defaults to a localhost address |
<!-- END OPERATOR-CONFIG -->
