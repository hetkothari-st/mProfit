-- RLS hardening found in the 2026-10-06 endpoint sweep. Policies only; no
-- data changes. None of these was reachable through the API (the app layer
-- already refuses), so this restores the database as the second line.
--
-- 1. Portfolio and Family: `portfolio_access` / `family_access` are FOR ALL.
--    Their USING clause admits any ACTIVE family member (so viewers can read),
--    and WITH CHECK limits writes to owners/contributors. But DELETE is judged
--    by USING alone, so at the database level a VIEWER could delete a
--    family-shared portfolio, or the family itself. A RESTRICTIVE policy is
--    ANDed with every permissive one, so this narrows DELETE without touching
--    reads or the CA policies.
CREATE POLICY portfolio_delete_owner ON "Portfolio"
  AS RESTRICTIVE
  FOR DELETE
  USING (
    app_is_system()
    OR "userId" = app_current_user_id()
    OR (
      "familyId" IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM "FamilyMember" fm
        WHERE fm."familyId" = "Portfolio"."familyId"
          AND fm."userId" = app_current_user_id()
          AND fm.status = 'ACTIVE'::"FamilyMemberStatus"
          AND fm.role = 'OWNER'::"FamilyRole"
      )
    )
  );

CREATE POLICY family_delete_owner ON "Family"
  AS RESTRICTIVE
  FOR DELETE
  USING (
    app_is_system()
    OR "createdById" = app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM "FamilyMember" fm
      WHERE fm."familyId" = "Family".id
        AND fm."userId" = app_current_user_id()
        AND fm.status = 'ACTIVE'::"FamilyMemberStatus"
        AND fm.role = 'OWNER'::"FamilyRole"
    )
  );

-- 2. AuditLog: `auditlog_owner` was FOR ALL with WITH CHECK (true), so a user
--    could insert rows under anyone's userId and update or delete their own
--    trail. An audit trail is append-only: users read their own rows and
--    insert rows about themselves; only system context (account purge, the
--    FK's ON DELETE SET NULL) may change or remove one.
DROP POLICY IF EXISTS auditlog_owner ON "AuditLog";

CREATE POLICY auditlog_read ON "AuditLog"
  FOR SELECT
  USING (app_is_system() OR "userId" = app_current_user_id());

CREATE POLICY auditlog_insert ON "AuditLog"
  FOR INSERT
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());

CREATE POLICY auditlog_system_update ON "AuditLog"
  FOR UPDATE
  USING (app_is_system())
  WITH CHECK (app_is_system());

CREATE POLICY auditlog_system_delete ON "AuditLog"
  FOR DELETE
  USING (app_is_system());
