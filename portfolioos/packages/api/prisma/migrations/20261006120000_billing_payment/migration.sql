-- F8: a verified Razorpay payment could be re-sent to /verify-payment and each
-- replay reset planExpiresAt to now + cycle, so one purchase renewed forever.
-- Record every payment that activates a plan; the unique payment id makes a
-- second activation impossible.

CREATE TABLE "BillingPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "tier" "PlanTier" NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingPayment_razorpayPaymentId_key" ON "BillingPayment"("razorpayPaymentId");
CREATE INDEX "BillingPayment_userId_createdAt_idx" ON "BillingPayment"("userId", "createdAt");

ALTER TABLE "BillingPayment" ADD CONSTRAINT "BillingPayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Owner-only, same pattern as LoanGiven. The unique index is global, so a
-- replay by the owner still collides even though RLS hides other users' rows.
ALTER TABLE "BillingPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingPayment" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billingpayment_owner ON "BillingPayment";
CREATE POLICY billingpayment_owner ON "BillingPayment"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "BillingPayment" TO portfolioos_app;
