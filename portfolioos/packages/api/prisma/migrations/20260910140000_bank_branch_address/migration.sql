-- Branch postal address for the "Share details" feature. Filled from the IFSC
-- via ifscLookup.service (Razorpay's public IFSC API) on save or on first
-- share, and editable because the upstream address text is often messy.
--
-- Additive and nullable; covered by the existing `bankaccount_owner` RLS
-- policy and `portfolioos_app` grant.
ALTER TABLE "BankAccount" ADD COLUMN "branchAddress" TEXT;
