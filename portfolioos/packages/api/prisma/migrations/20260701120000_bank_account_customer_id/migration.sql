-- Add optional bank-issued customer identification number (CIF / CustID)
-- to BankAccount. Nullable — legacy rows keep NULL.

ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
