-- A net-worth snapshot can now say whether the prices behind it were real.
--
-- Between the AMFI NAVAll column change and the fix, the NAV sync imported
-- zero rows: mutual-fund holdings kept their last known NAV and every nightly
-- snapshot taken in that window recorded a total computed from stale prices.
--
-- Those rows are not corrected in place. getDashboardNetWorth() reads live
-- HoldingProjection and takes no asOf, so there is no way to recompute what a
-- past day was actually worth — src/scripts/backfillNetWorthHistory.ts says
-- the same thing in its own header. Overwriting them with today's numbers
-- would be inventing history. They get a flag instead, and the UI shows it.
--
-- Additive and defaulted, so every existing row reads OK, which is what they
-- are unless a backfill run says otherwise.
ALTER TABLE "NetWorthSnapshot"
  ADD COLUMN "dataQuality" TEXT NOT NULL DEFAULT 'OK',
  ADD COLUMN "dataQualityReason" TEXT,
  ADD COLUMN "dataQualityAt" TIMESTAMP(3);

-- Only two values are meaningful; anything else is a bug writing to the
-- column, and a snapshot that lies about its own quality is worse than one
-- with no flag at all.
ALTER TABLE "NetWorthSnapshot"
  ADD CONSTRAINT "NetWorthSnapshot_dataQuality_check"
  CHECK ("dataQuality" IN ('OK', 'ESTIMATED'));

-- Finding the flagged rows is a per-user question ("is any point on my chart
-- an estimate?"), which the existing (userId, asOf) index already serves.
-- No new index.
