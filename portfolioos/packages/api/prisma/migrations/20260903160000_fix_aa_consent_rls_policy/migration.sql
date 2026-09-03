-- Bring the AaConsent RLS policy in line with every other user-scoped table.
--
-- 20260603120000_aa_consent installed only:
--
--   CREATE POLICY "aa_consent_owner" ON "AaConsent"
--     USING ("userId" = current_setting('app.current_user_id', true));
--
-- After the Goal fix, this was the last policy in the schema still missing all
-- three guards:
--
-- 1. No `app_is_system()` branch, so background jobs and fixture setup running
--    under runAsSystem cannot touch the table at all — runAsSystem sets
--    app.bypass_rls, not app.current_user_id, so the predicate is NULL and
--    every row is filtered out. AA consent refresh is exactly the kind of
--    thing a scheduled job does.
-- 2. No WITH CHECK, so reads were guarded and writes were not: nothing stopped
--    an INSERT or UPDATE claiming another user's consent row. For an
--    Account Aggregator consent artefact — the record of what a user
--    authorised a third party to fetch on their behalf — that is the write
--    that matters most.
-- 3. No FORCE ROW LEVEL SECURITY, so the table owner was exempt entirely.
--
-- AaConsent is also being added to USER_SCOPED_MODELS in the same change.
-- Without that entry the policy never receives a session variable and the
-- table reads empty; without the policy the entry guards nothing. Both halves
-- are required.

DROP POLICY IF EXISTS "aa_consent_owner" ON "AaConsent";

ALTER TABLE "AaConsent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AaConsent" FORCE  ROW LEVEL SECURITY;

CREATE POLICY aa_consent_owner ON "AaConsent"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "AaConsent" TO portfolioos_app;
