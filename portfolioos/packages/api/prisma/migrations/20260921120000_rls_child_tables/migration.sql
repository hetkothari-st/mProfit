-- Row-level security for the four child tables that never had it.
--
-- These reach their owner through a parent rather than carrying a `userId`,
-- and were left behind when the parents were protected: Loan, LoanGiven,
-- CreditCard and Transaction all have policies, while their children have
-- none. Anything holding a valid session could read every user's loan
-- repayments, credit-card statements and transaction photos, with only the
-- application's own WHERE clauses in the way — the posture RLS exists to stop
-- relying on.
--
-- Two of them already carry a CA read policy from
-- 20260908160000_ca_report_read_surface. A policy on a table without RLS
-- enabled does nothing, so those were inert; enabling it here is what makes
-- them take effect, alongside the owner policies below.
--
-- The matching half of this change shipped in src/lib/prisma.ts: all four are
-- in USER_SCOPED_MODELS, so the session variable is actually set for their
-- queries. Without that, every read here would return zero rows — which is
-- exactly how loan EMI vouchers went missing before the entries were added.
--
-- Shape follows 20260421140000_phase_4_5_rls: ENABLE + FORCE (so the owner is
-- not exempt), an app_is_system() branch (background jobs under runAsSystem),
-- and WITH CHECK so writes are guarded too.

-- Loan repayments → Loan.userId
ALTER TABLE "LoanPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanPayment" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loanpayment_owner ON "LoanPayment";
CREATE POLICY loanpayment_owner ON "LoanPayment"
  USING      (app_is_system() OR EXISTS (SELECT 1 FROM "Loan" p WHERE p.id = "LoanPayment"."loanId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "Loan" p WHERE p.id = "LoanPayment"."loanId" AND p."userId" = app_current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoanPayment" TO portfolioos_app;

-- Entries against money lent out → LoanGiven.userId
ALTER TABLE "LoanGivenEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LoanGivenEntry" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loangivenentry_owner ON "LoanGivenEntry";
CREATE POLICY loangivenentry_owner ON "LoanGivenEntry"
  USING      (app_is_system() OR EXISTS (SELECT 1 FROM "LoanGiven" p WHERE p.id = "LoanGivenEntry"."loanId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "LoanGiven" p WHERE p.id = "LoanGivenEntry"."loanId" AND p."userId" = app_current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoanGivenEntry" TO portfolioos_app;

-- Card statements → CreditCard.userId
ALTER TABLE "CreditCardStatement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditCardStatement" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS creditcardstatement_owner ON "CreditCardStatement";
CREATE POLICY creditcardstatement_owner ON "CreditCardStatement"
  USING      (app_is_system() OR EXISTS (SELECT 1 FROM "CreditCard" p WHERE p.id = "CreditCardStatement"."cardId" AND p."userId" = app_current_user_id()))
  WITH CHECK (app_is_system() OR EXISTS (SELECT 1 FROM "CreditCard" p WHERE p.id = "CreditCardStatement"."cardId" AND p."userId" = app_current_user_id()));
GRANT SELECT, INSERT, UPDATE, DELETE ON "CreditCardStatement" TO portfolioos_app;

-- Photos of a contract note or receipt → Transaction → Portfolio.userId
ALTER TABLE "TransactionPhoto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionPhoto" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transactionphoto_owner ON "TransactionPhoto";
CREATE POLICY transactionphoto_owner ON "TransactionPhoto"
  USING (app_is_system() OR EXISTS (
    SELECT 1 FROM "Transaction" t
    JOIN "Portfolio" p ON p.id = t."portfolioId"
    WHERE t.id = "TransactionPhoto"."transactionId" AND p."userId" = app_current_user_id()
  ))
  WITH CHECK (app_is_system() OR EXISTS (
    SELECT 1 FROM "Transaction" t
    JOIN "Portfolio" p ON p.id = t."portfolioId"
    WHERE t.id = "TransactionPhoto"."transactionId" AND p."userId" = app_current_user_id()
  ));
GRANT SELECT, INSERT, UPDATE, DELETE ON "TransactionPhoto" TO portfolioos_app;
