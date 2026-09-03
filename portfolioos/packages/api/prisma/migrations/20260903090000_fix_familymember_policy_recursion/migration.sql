-- Fix: infinite recursion in the FamilyMember RLS policy (Postgres 42P17).
--
-- The policy installed by 20260701130000_family_hof_foundation answers "is the
-- caller an ACTIVE OWNER of this family" with a subquery over FamilyMember
-- itself:
--
--   CREATE POLICY familymember_access ON "FamilyMember"
--     USING (... OR EXISTS (SELECT 1 FROM "FamilyMember" own WHERE ...))
--
-- Postgres applies a table's policy to every reference to that table,
-- including one inside the policy's own expression. Evaluating the policy
-- therefore re-enters the policy, and the planner aborts with
-- "infinite recursion detected in policy for relation FamilyMember".
--
-- Because Portfolio's policy joins through FamilyMember, this breaks EVERY
-- portfolio read — and it breaks system-context reads too, so background jobs
-- and tests fail identically.
--
-- Why nobody noticed: the application connected as a role carrying BYPASSRLS,
-- so these policies were never evaluated. FORCE ROW LEVEL SECURITY overrides
-- the table-owner exemption but NOT the BYPASSRLS attribute. The recursion
-- surfaced the moment the runtime role was switched to portfolioos_app
-- (NOSUPERUSER, NOBYPASSRLS), which is what the design intended all along.
--
-- Fix: move the ownership lookup into a SECURITY DEFINER function. It executes
-- as its owner (the migration role, which can bypass RLS), so the read of
-- FamilyMember inside it does not re-enter the policy. The policy itself keeps
-- exactly the same semantics — this is a recursion fix, not a permission
-- change: identical rows in, identical rows out.

-- STABLE: one evaluation per row is not required, and the planner may cache
-- within a statement. SECURITY DEFINER: runs as owner, so the inner read is
-- not subject to FamilyMember's policy.
-- search_path is pinned: a SECURITY DEFINER function with a mutable
-- search_path can be hijacked by a caller-created object shadowing a name.
CREATE OR REPLACE FUNCTION app_is_active_family_owner(target_family_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "FamilyMember" own
    WHERE own."familyId" = target_family_id
      AND own."userId" = app_current_user_id()
      AND own.role = 'OWNER'
      AND own.status = 'ACTIVE'
  );
$$;

COMMENT ON FUNCTION app_is_active_family_owner(TEXT) IS
  'RLS helper. SECURITY DEFINER so the FamilyMember lookup does not re-enter FamilyMember''s own policy (42P17). Returns rows for app_current_user_id() only — it cannot be used to read another user''s membership.';

-- The function reads only rows matching app_current_user_id(), so granting
-- EXECUTE does not widen what the app can learn: it answers one boolean about
-- the caller themselves.
GRANT EXECUTE ON FUNCTION app_is_active_family_owner(TEXT) TO portfolioos_app;

-- Rewrite the recursive policy. Semantics are unchanged: own row, or an
-- ACTIVE OWNER of the same family, or system context.
DROP POLICY IF EXISTS familymember_access ON "FamilyMember";
CREATE POLICY familymember_access ON "FamilyMember"
  USING (
    app_is_system()
    OR "userId" = app_current_user_id()
    OR app_is_active_family_owner("familyId")
  )
  WITH CHECK (
    app_is_system()
    -- Self-write (accept invite / leave family): the row's own userId must
    -- equal the caller. This handles the accept flow inserting the caller's
    -- own membership row.
    OR "userId" = app_current_user_id()
    OR app_is_active_family_owner("familyId")
  );

-- The sibling policies below are NOT self-referential — they read FamilyMember
-- from a different table's policy, which is legal. They are rewritten anyway
-- so that every ownership check in the schema goes through one function: if
-- the ownership rule ever changes, it changes in exactly one place.
DROP POLICY IF EXISTS familyinvitation_access ON "FamilyInvitation";
CREATE POLICY familyinvitation_access ON "FamilyInvitation"
  USING (
    app_is_system()
    OR "invitedById" = app_current_user_id()
    OR app_is_active_family_owner("familyId")
  )
  WITH CHECK (
    app_is_system()
    OR "invitedById" = app_current_user_id()
    OR app_is_active_family_owner("familyId")
  );
