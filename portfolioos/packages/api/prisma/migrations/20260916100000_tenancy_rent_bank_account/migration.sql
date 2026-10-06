-- Where a tenant's rent lands. Nullable: a tenancy without an account keeps
-- behaving as it did, with rent booking to the suspense ledger on export.
ALTER TABLE "Tenancy" ADD COLUMN "bankAccountId" TEXT;

ALTER TABLE "Tenancy"
  ADD CONSTRAINT "Tenancy_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Tenancy_bankAccountId_idx" ON "Tenancy"("bankAccountId");
