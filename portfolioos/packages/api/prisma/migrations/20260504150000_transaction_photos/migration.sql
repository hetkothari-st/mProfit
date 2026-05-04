-- AddTransactionPhoto table for gold/silver (and other) entry photo attachments

CREATE TABLE "TransactionPhoto" (
  "id"            TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "fileName"      TEXT NOT NULL,
  "filePath"      TEXT NOT NULL,
  "mimeType"      TEXT NOT NULL,
  "sizeBytes"     INTEGER NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransactionPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TransactionPhoto_transactionId_idx" ON "TransactionPhoto"("transactionId");

ALTER TABLE "TransactionPhoto"
  ADD CONSTRAINT "TransactionPhoto_transactionId_fkey"
  FOREIGN KEY ("transactionId")
  REFERENCES "Transaction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
