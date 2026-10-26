# B01 discovery notes (asset classes)

Source commit 9d9025c4 · code-only.

## Scope (from _work/global/modules.md)
Routes 30, 36–43, 49–52: /stocks, /fo, /bonds, /fds, /fds/:holdingId, /gold, /gold/:holdingId, /crypto, /crypto/:holdingId, /nps, /post-office, /post-office/:holdingId, /others.
Overrides: /mutual-funds -> B02, /provident-fund -> B11 (listed as D-ASSET-003/004).

## Stack facts used
- All B01 pages read holdings via GET /api/portfolios/:id/holdings (HoldingProjection) and transactions via GET /api/transactions (server cap 200).
- Writes: POST/PATCH/DELETE /api/transactions -> transaction.service (owner check, duplicate guard 409, FIFO replay recomputeForAsset).
- Valuation: services/holdings/holdingsProjection.ts (accrual for FD/RD/PO; market via priceFeeds/router.service.ts; null for bonds/NPS/others).
- Gold page values client-side from /api/assets/commodities/live; server uses per-gram commodity price.
- Crypto: CoinGecko via CryptoMaster (13 seeded coins), live endpoint cache 10 s, job every 2 min.
- F&O: separate DerivativePosition model; /api/fo/*; expiry job 17:30 IST; broker OAuth in ingestion/fno/brokerOauth.
- Alerts: jobs/alertJobs.ts 20:45 IST per-user runAsUser -> depositReminders.service + alerts.service PO maturity.

## Module checklist
- [x] Stocks (StocksPage)
- [x] F&O (FuturesOptionsPage, fo.controller, foExpiry, brokerOauth)
- [x] Bonds (BondsPage, BondFormDialog, SimpleAssetPage)
- [x] FDs & RDs (FixedDepositsPage, FDFormDialog, FdDetailPage, depositReminders lib + service)
- [x] Gold & Silver (GoldPage, GoldSilverTopBar, GoldFormDialog, GoldAssetDetailPage; GoldAssetDetailSheet dead)
- [x] Crypto (CryptoPage, CryptoFormDialog, CryptoDetailPage, cryptoUtils)
- [x] NPS (NpsPage, PPFNpsFormDialog NPS mode)
- [x] Post Office (PostOfficePage, PostOfficeFormDialog, PostOfficeDetailPage, poSchemes)
- [x] Others (OtherAssetsPage, OtherAssetFormDialog)

## Exhaustiveness check
Every button/link/select found by reading each component is listed in a feature's Controls table. Unused code: FuturesOptionsPage UnderlyingActivity (F-FNO-012), GoldAssetDetailSheet (F-ASSET-002), SimpleAssetPage formOptions/groupHoldingsByClass props (not used by any B01 page), OtherAssetFormDialog TXN_BY_CLASS.REAL_ESTATE (no option).
