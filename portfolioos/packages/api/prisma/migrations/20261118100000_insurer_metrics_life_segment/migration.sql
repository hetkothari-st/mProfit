-- Life-insurer claim data (IRDAI Handbook Table 15) alongside the health rows. Additive.
ALTER TABLE "InsurerMetrics"
  ADD COLUMN "segment"                      TEXT NOT NULL DEFAULT 'HEALTH',
  ADD COLUMN "claimsPaidInr"                DECIMAL(20,2),
  ADD COLUMN "claimSettlementRatioByAmount" DECIMAL(6,2);
CREATE INDEX "InsurerMetrics_segment_financialYear_idx" ON "InsurerMetrics"("segment", "financialYear");
