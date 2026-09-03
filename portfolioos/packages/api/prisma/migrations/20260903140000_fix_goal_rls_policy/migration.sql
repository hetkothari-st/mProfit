-- Bring the Goal RLS policy in line with every other user-scoped table.
--
-- 20260529180000_phase_2c_goals installed:
--
--   ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY "goal_owner" ON "Goal"
--     USING ("userId" = current_setting('app.current_user_id', true));
--
-- Three things are missing compared with 20260421140000_phase_4_5_rls:
--
-- 1. No `app_is_system()` branch. This is the only policy in the schema
--    without one, so background jobs and fixture setup running under
--    runAsSystem cannot read or write goals at all — runAsSystem sets
--    app.bypass_rls, not app.current_user_id, so the predicate is NULL and
--    every row is filtered out.
-- 2. No WITH CHECK. Reads were guarded, writes were not: nothing stopped an
--    INSERT or UPDATE claiming another user's userId.
-- 3. No FORCE ROW LEVEL SECURITY, so the table owner is exempt. That matters
--    the moment anything connects as the owner — which is how the whole
--    codebase behaved until the runtime role was switched to portfolioos_app.
--
-- It also reads the GUC directly rather than through app_current_user_id(),
-- which is merely inconsistent, not wrong. Aligned here anyway so there is one
-- spelling of "who is the current user" to audit.
--
-- Separately, and fixed in the same change as this migration:
-- "Goal" and "BankAccount" were absent from USER_SCOPED_MODELS in
-- src/lib/prisma.ts, so the Prisma hook never issued set_config for them.
-- With the policy active and no GUC set, every goal read returned zero rows.
-- A policy and its USER_SCOPED_MODELS entry are two halves of one mechanism;
-- neither works alone.

DROP POLICY IF EXISTS "goal_owner" ON "Goal";

ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Goal" FORCE  ROW LEVEL SECURITY;

CREATE POLICY goal_owner ON "Goal"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON "Goal" TO portfolioos_app;

-- BankAccount is in the same position: RLS is on, but it was missing from
-- USER_SCOPED_MODELS. Its policy already carries app_is_system(), so only the
-- grant is re-asserted here for consistency with the tables above.
GRANT SELECT, INSERT, UPDATE, DELETE ON "BankAccount" TO portfolioos_app;
