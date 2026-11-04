-- Personal inflation: remember which loan / policy / property an expense was
-- added from, so the same source is never added twice. Additive only.
ALTER TABLE "InflationBasketItem" ADD COLUMN "sourceRef" TEXT;

-- NULLs are distinct in Postgres, so typed-in items (sourceRef NULL) never clash.
CREATE UNIQUE INDEX "InflationBasketItem_userId_sourceRef_key" ON "InflationBasketItem"("userId", "sourceRef");
