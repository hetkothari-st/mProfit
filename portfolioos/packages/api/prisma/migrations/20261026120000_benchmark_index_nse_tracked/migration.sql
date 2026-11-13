-- =============================================================================
-- Sectoral, thematic and factor NSE TRI benchmarks for index funds.
--
-- Mirrors NSE_TRACKED_INDICES in packages/api/src/priceFeeds/benchmarkIndexSeed.ts
-- (35 rows). Each was verified live on 2026-10-26 to return daily TRI history
-- from 2016 on niftyindices.com. All are total-return series: the
-- BenchmarkIndex_isTotalReturn_check constraint from the 20260904180000 seed
-- still applies.
--
-- No price rows here. The nightly benchmarkPriceJob sees each new index empty
-- and fetches its full history (EMPTY_INDEX_HISTORY_DAYS); the nightly scheme
-- metadata job re-resolves index funds' benchmarkIndexCode from their names.
-- =============================================================================

INSERT INTO "BenchmarkIndex" ("code", "name", "provider", "isTotalReturn")
VALUES
  ('NIFTY_NEXT50_TRI', 'Nifty Next 50 TRI', 'NSE', true),
  ('NIFTY_MIDCAP50_TRI', 'Nifty Midcap 50 TRI', 'NSE', true),
  ('NIFTY_MIDCAP100_TRI', 'Nifty Midcap 100 TRI', 'NSE', true),
  ('NIFTY_SMALLCAP50_TRI', 'Nifty Smallcap 50 TRI', 'NSE', true),
  ('NIFTY_MICROCAP250_TRI', 'Nifty Microcap 250 TRI', 'NSE', true),
  ('NIFTY_BANK_TRI', 'Nifty Bank TRI', 'NSE', true),
  ('NIFTY_PRIVATE_BANK_TRI', 'Nifty Private Bank TRI', 'NSE', true),
  ('NIFTY_PSU_BANK_TRI', 'Nifty PSU Bank TRI', 'NSE', true),
  ('NIFTY_FIN_SERVICES_TRI', 'Nifty Financial Services TRI', 'NSE', true),
  ('NIFTY_FIN_SERVICES_EX_BANK_TRI', 'Nifty Financial Services Ex-Bank TRI', 'NSE', true),
  ('NIFTY_IT_TRI', 'Nifty IT TRI', 'NSE', true),
  ('NIFTY_PHARMA_TRI', 'Nifty Pharma TRI', 'NSE', true),
  ('NIFTY_HEALTHCARE_TRI', 'Nifty Healthcare TRI', 'NSE', true),
  ('NIFTY_AUTO_TRI', 'Nifty Auto TRI', 'NSE', true),
  ('NIFTY_FMCG_TRI', 'Nifty FMCG TRI', 'NSE', true),
  ('NIFTY_INDIA_CONSUMPTION_TRI', 'Nifty India Consumption TRI', 'NSE', true),
  ('NIFTY_INFRA_TRI', 'Nifty Infrastructure TRI', 'NSE', true),
  ('NIFTY_COMMODITIES_TRI', 'Nifty Commodities TRI', 'NSE', true),
  ('NIFTY_MNC_TRI', 'Nifty MNC TRI', 'NSE', true),
  ('NIFTY_INDIA_MANUFACTURING_TRI', 'Nifty India Manufacturing TRI', 'NSE', true),
  ('NIFTY_INDIA_DIGITAL_TRI', 'Nifty India Digital TRI', 'NSE', true),
  ('NIFTY100_ESG_SECTOR_LEADERS_TRI', 'Nifty100 ESG Sector Leaders TRI', 'NSE', true),
  ('NIFTY50_SHARIAH_TRI', 'Nifty50 Shariah TRI', 'NSE', true),
  ('NIFTY50_EQUAL_WEIGHT_TRI', 'Nifty50 Equal Weight TRI', 'NSE', true),
  ('NIFTY100_EQUAL_WEIGHT_TRI', 'Nifty100 Equal Weight TRI', 'NSE', true),
  ('NIFTY50_VALUE20_TRI', 'Nifty50 Value 20 TRI', 'NSE', true),
  ('NIFTY500_VALUE50_TRI', 'Nifty500 Value 50 TRI', 'NSE', true),
  ('NIFTY100_LOW_VOL30_TRI', 'Nifty100 Low Volatility 30 TRI', 'NSE', true),
  ('NIFTY100_QUALITY30_TRI', 'Nifty100 Quality 30 TRI', 'NSE', true),
  ('NIFTY200_QUALITY30_TRI', 'Nifty200 Quality 30 TRI', 'NSE', true),
  ('NIFTY200_MOMENTUM30_TRI', 'Nifty200 Momentum 30 TRI', 'NSE', true),
  ('NIFTY_MIDCAP150_MOMENTUM50_TRI', 'Nifty Midcap150 Momentum 50 TRI', 'NSE', true),
  ('NIFTY_MIDCAP150_QUALITY50_TRI', 'Nifty Midcap150 Quality 50 TRI', 'NSE', true),
  ('NIFTY_ALPHA50_TRI', 'Nifty Alpha 50 TRI', 'NSE', true),
  ('NIFTY_ALPHA_LOW_VOL30_TRI', 'Nifty Alpha Low-Volatility 30 TRI', 'NSE', true)
ON CONFLICT ("code") DO NOTHING;
