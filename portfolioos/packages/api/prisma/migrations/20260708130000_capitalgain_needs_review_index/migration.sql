-- TASK-01 fix-mf-debt-equity-tax-classification: `needsReview`/`reviewReason`
-- were already added to CapitalGain by migration 20260708120000 (a
-- concurrently-developed fix for CII-indexation gaps that landed on main
-- with the same column names for a different reason — see the merged
-- comment on CapitalGain.needsReview in schema.prisma). This migration only
-- adds the supporting index for filtering rows that need manual review.

CREATE INDEX "CapitalGain_portfolioId_needsReview_idx" ON "CapitalGain"("portfolioId", "needsReview");
