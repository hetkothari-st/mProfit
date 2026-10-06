-- EMI schedule on loans given: a repayment or waiver can be marked against a
-- specific instalment. Additive only; existing entries stay untied (NULL) and
-- keep counting toward the schedule oldest instalment first.
ALTER TABLE "LoanGivenEntry" ADD COLUMN "installmentNo" INTEGER;
CREATE INDEX "LoanGivenEntry_loanId_installmentNo_idx" ON "LoanGivenEntry"("loanId", "installmentNo");
