-- The rate a bank account pays, for idle-savings advice (Act on it).
ALTER TABLE "BankAccount" ADD COLUMN "interestRatePct" DECIMAL(5,2);
