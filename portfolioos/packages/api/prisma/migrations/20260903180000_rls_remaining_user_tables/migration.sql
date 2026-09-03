-- Give the remaining user-owned tables the row-level security every other
-- user table has.
--
-- These twelve carry a `userId` and had NO policy at all. Not "a policy that
-- was never wired up" — the class of bug fixed in the preceding commits — but
-- no database-level isolation whatsoever. They were guarded only by the
-- application remembering to write `where: { userId }`, which is precisely the
-- posture RLS exists to stop relying on. Loan, CreditCard and Income are
-- ordinary financial data; BrokerAccount and MailboxAccount hold third-party
-- connection state.
--
-- Deliberately NOT included, and exempted by name in
-- test/invariants/user-scoped-coverage.test.ts:
--
--   RefreshToken, PasswordResetToken
--
-- Both are read during flows where the caller has no identity yet — token
-- refresh and password reset happen before authentication, by definition. A
-- userId-based policy cannot apply when there is no current user: the hook
-- would issue no session variable, the predicate would evaluate against NULL,
-- and every lookup would return nothing, breaking sign-in refresh and password
-- reset entirely. Their security model is the token itself — a 48-byte random
-- secret, single-use, expiring — not the caller's identity.
--
-- Every policy below follows the shape from 20260421140000_phase_4_5_rls:
-- ENABLE + FORCE (so the table owner is not exempt), an app_is_system()
-- branch (so background jobs under runAsSystem still work), and WITH CHECK
-- (so writes are guarded, not just reads).
--
-- Each table is also added to USER_SCOPED_MODELS in src/lib/prisma.ts in the
-- same change. A policy without that entry reads as empty; an entry without a
-- policy guards nothing.

ALTER TABLE "BrokerAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrokerAccount" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brokeraccount_owner ON "BrokerAccount";
CREATE POLICY brokeraccount_owner ON "BrokerAccount"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "BrokerAccount" TO portfolioos_app;

ALTER TABLE "MailboxAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MailboxAccount" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mailboxaccount_owner ON "MailboxAccount";
CREATE POLICY mailboxaccount_owner ON "MailboxAccount"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "MailboxAccount" TO portfolioos_app;

ALTER TABLE "GmailScanJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GmailScanJob" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmailscanjob_owner ON "GmailScanJob";
CREATE POLICY gmailscanjob_owner ON "GmailScanJob"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "GmailScanJob" TO portfolioos_app;

ALTER TABLE "GmailDiscoveredDoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GmailDiscoveredDoc" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmaildiscovereddoc_owner ON "GmailDiscoveredDoc";
CREATE POLICY gmaildiscovereddoc_owner ON "GmailDiscoveredDoc"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "GmailDiscoveredDoc" TO portfolioos_app;

ALTER TABLE "GmailAutoApproveRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GmailAutoApproveRule" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmailautoapproverule_owner ON "GmailAutoApproveRule";
CREATE POLICY gmailautoapproverule_owner ON "GmailAutoApproveRule"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "GmailAutoApproveRule" TO portfolioos_app;

ALTER TABLE "VehicleValuationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VehicleValuationLog" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehiclevaluationlog_owner ON "VehicleValuationLog";
CREATE POLICY vehiclevaluationlog_owner ON "VehicleValuationLog"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "VehicleValuationLog" TO portfolioos_app;

ALTER TABLE "SipPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SipPlan" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sipplan_owner ON "SipPlan";
CREATE POLICY sipplan_owner ON "SipPlan"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "SipPlan" TO portfolioos_app;

ALTER TABLE "Loan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Loan" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_owner ON "Loan";
CREATE POLICY loan_owner ON "Loan"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Loan" TO portfolioos_app;

ALTER TABLE "CreditCard" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditCard" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS creditcard_owner ON "CreditCard";
CREATE POLICY creditcard_owner ON "CreditCard"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "CreditCard" TO portfolioos_app;

ALTER TABLE "Income" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Income" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS income_owner ON "Income";
CREATE POLICY income_owner ON "Income"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "Income" TO portfolioos_app;

ALTER TABLE "HealthScoreSnapshot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HealthScoreSnapshot" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS healthscoresnapshot_owner ON "HealthScoreSnapshot";
CREATE POLICY healthscoresnapshot_owner ON "HealthScoreSnapshot"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "HealthScoreSnapshot" TO portfolioos_app;

ALTER TABLE "AiChatSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiChatSession" FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aichatsession_owner ON "AiChatSession";
CREATE POLICY aichatsession_owner ON "AiChatSession"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiChatSession" TO portfolioos_app;
