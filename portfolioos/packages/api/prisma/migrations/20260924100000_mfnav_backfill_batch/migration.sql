-- Which backfill put this NAV row here.
--
-- A historical backfill inserts millions of rows into a table that also
-- receives the nightly sync. Without a marker, "undo the backfill" means
-- deleting by date range — which would take the nightly sync's rows with it,
-- including the ones that were there before the backfill ran.
--
-- With it, reversal is exact:
--
--   DELETE FROM "MFNav" WHERE "backfillBatchId" = '<batch>';
--
-- Nullable, and null on every existing row: rows the nightly sync wrote are
-- not part of any batch, and that is the distinction the column exists to
-- record. The backfill only ever sets it on rows it INSERTS — a row that
-- already existed keeps its NAV and its null, so a reversal can never delete
-- data the backfill did not create.
ALTER TABLE "MFNav" ADD COLUMN "backfillBatchId" TEXT;

-- Partial: the column is null on the overwhelming majority of rows, and the
-- only query that reads it asks for one batch.
CREATE INDEX "MFNav_backfillBatchId_idx"
    ON "MFNav"("backfillBatchId") WHERE "backfillBatchId" IS NOT NULL;
