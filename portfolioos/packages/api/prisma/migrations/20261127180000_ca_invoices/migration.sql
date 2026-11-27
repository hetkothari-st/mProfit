-- A CA's practice profile and fee invoices to clients. Practice-private: only
-- the CA reads or writes them. Invoices are never deleted (a mistake is
-- cancelled and keeps its number), so the client FK restricts and the app
-- role gets no DELETE on them.

CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'CANCELLED');

CREATE TABLE "PracticeProfile" (
  "userId" TEXT NOT NULL,
  "firmName" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "stateCode" TEXT NOT NULL,
  "gstin" TEXT,
  "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
  "paymentNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PracticeProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "advisorId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "invoiceDate" DATE NOT NULL,
  "financialYear" TEXT NOT NULL,
  "seller" JSONB NOT NULL,
  "buyerName" TEXT NOT NULL,
  "buyerAddress" TEXT,
  "buyerGstin" TEXT,
  "placeOfSupply" TEXT NOT NULL,
  "taxable" DECIMAL(14,2) NOT NULL,
  "cgst" DECIMAL(14,2) NOT NULL,
  "sgst" DECIMAL(14,2) NOT NULL,
  "igst" DECIMAL(14,2) NOT NULL,
  "total" DECIMAL(14,2) NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "paidOn" DATE,
  "paymentNote" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_advisorId_number_key" ON "Invoice"("advisorId", "number");
CREATE INDEX "Invoice_advisorId_financialYear_idx" ON "Invoice"("advisorId", "financialYear");
CREATE INDEX "Invoice_clientId_idx" ON "Invoice"("clientId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InvoiceLine" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "sac" TEXT,
  "amount" DECIMAL(14,2) NOT NULL,
  "gstRatePct" DECIMAL(5,2) NOT NULL,
  CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PracticeProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PracticeProfile" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;

CREATE POLICY practiceprofile_owner ON "PracticeProfile"
  FOR ALL USING (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

CREATE POLICY invoice_advisor ON "Invoice"
  FOR ALL USING (app_is_system() OR "advisorId" = app_current_user_id())
  WITH CHECK (
    app_is_system()
    OR (
      "advisorId" = app_current_user_id()
      AND EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "Invoice"."clientId" AND c."advisorId" = app_current_user_id())
    )
  );

CREATE POLICY invoiceline_advisor ON "InvoiceLine"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = "InvoiceLine"."invoiceId" AND i."advisorId" = app_current_user_id())
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "Invoice" i WHERE i.id = "InvoiceLine"."invoiceId" AND i."advisorId" = app_current_user_id())
  );

GRANT SELECT, INSERT, UPDATE ON "PracticeProfile" TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE ON "Invoice" TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE ON "InvoiceLine" TO portfolioos_app;
