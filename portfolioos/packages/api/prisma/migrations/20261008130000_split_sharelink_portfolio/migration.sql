-- SplitShareLink remembers its portfolio even while its CashFlow is gone (deleted expense).
-- The table is empty everywhere, so the temporary default is safe.
ALTER TABLE "SplitShareLink" ADD COLUMN "portfolioId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SplitShareLink" ALTER COLUMN "portfolioId" DROP DEFAULT;
