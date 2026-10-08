-- Split Expenses RLS hardening (follow-up to 20261007150000_split_expenses).
-- Per-command policies, forge-proof attribution columns, soft-delete-only
-- ledger tables, append-only activity. See task-3 review notes.

-- Helpers answer only about app_current_user_id(); nobody but the app role
-- needs EXECUTE.
REVOKE EXECUTE ON FUNCTION app_is_split_member(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_is_split_group_creator(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_split_expense_group(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app_split_group_is_empty(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_split_member(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_is_split_group_creator(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_split_expense_group(TEXT) TO portfolioos_app;
GRANT EXECUTE ON FUNCTION app_split_group_is_empty(TEXT) TO portfolioos_app;

-- ── SplitGroup ───────────────────────────────────────────────────────
DROP POLICY splitgroup_access ON "SplitGroup";
CREATE POLICY splitgroup_select ON "SplitGroup" FOR SELECT
  USING (app_is_system() OR app_is_split_member(id)
         OR ("createdById" = app_current_user_id() AND app_split_group_is_empty(id)));
CREATE POLICY splitgroup_insert ON "SplitGroup" FOR INSERT
  WITH CHECK (app_is_system()
         OR ("createdById" = app_current_user_id() AND app_split_group_is_empty(id)));
CREATE POLICY splitgroup_update ON "SplitGroup" FOR UPDATE
  USING (app_is_system() OR app_is_split_member(id))
  WITH CHECK (app_is_system() OR app_is_split_member(id));
CREATE POLICY splitgroup_delete ON "SplitGroup" FOR DELETE
  USING (app_is_system());

-- ── SplitMember ──────────────────────────────────────────────────────
DROP POLICY splitmember_access ON "SplitMember";
CREATE POLICY splitmember_select ON "SplitMember" FOR SELECT
  USING (app_is_system() OR "userId" = app_current_user_id() OR app_is_split_member("groupId"));
-- Bootstrap (own row into a group the caller created) only while the group
-- has no member rows at all, so a creator who left cannot re-insert herself.
CREATE POLICY splitmember_insert ON "SplitMember" FOR INSERT
  WITH CHECK (app_is_system() OR app_is_split_member("groupId")
              OR ("userId" = app_current_user_id()
                  AND app_is_split_group_creator("groupId")
                  AND app_split_group_is_empty("groupId")));
CREATE POLICY splitmember_update ON "SplitMember" FOR UPDATE
  USING (app_is_system() OR app_is_split_member("groupId"))
  WITH CHECK (app_is_system() OR app_is_split_member("groupId"));
CREATE POLICY splitmember_delete ON "SplitMember" FOR DELETE
  USING (app_is_system() OR app_is_split_member("groupId"));

-- ── SplitExpense / SplitSettlement: soft delete only, createdById pinned ──
DROP POLICY splitexpense_access ON "SplitExpense";
CREATE POLICY splitexpense_select ON "SplitExpense" FOR SELECT
  USING (app_is_system() OR app_is_split_member("groupId"));
CREATE POLICY splitexpense_insert ON "SplitExpense" FOR INSERT
  WITH CHECK (app_is_system() OR (app_is_split_member("groupId") AND "createdById" = app_current_user_id()));
CREATE POLICY splitexpense_update ON "SplitExpense" FOR UPDATE
  USING (app_is_system() OR app_is_split_member("groupId"))
  WITH CHECK (app_is_system() OR app_is_split_member("groupId"));
CREATE POLICY splitexpense_delete ON "SplitExpense" FOR DELETE
  USING (app_is_system());

DROP POLICY splitsettlement_access ON "SplitSettlement";
CREATE POLICY splitsettlement_select ON "SplitSettlement" FOR SELECT
  USING (app_is_system() OR app_is_split_member("groupId"));
CREATE POLICY splitsettlement_insert ON "SplitSettlement" FOR INSERT
  WITH CHECK (app_is_system() OR (app_is_split_member("groupId") AND "createdById" = app_current_user_id()));
CREATE POLICY splitsettlement_update ON "SplitSettlement" FOR UPDATE
  USING (app_is_system() OR app_is_split_member("groupId"))
  WITH CHECK (app_is_system() OR app_is_split_member("groupId"));
CREATE POLICY splitsettlement_delete ON "SplitSettlement" FOR DELETE
  USING (app_is_system());

-- ── SplitComment: soft delete only, authorUserId pinned ───────────────
DROP POLICY splitcomment_access ON "SplitComment";
CREATE POLICY splitcomment_select ON "SplitComment" FOR SELECT
  USING (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId")));
CREATE POLICY splitcomment_insert ON "SplitComment" FOR INSERT
  WITH CHECK (app_is_system()
    OR (app_is_split_member(app_split_expense_group("expenseId")) AND "authorUserId" = app_current_user_id()));
CREATE POLICY splitcomment_update ON "SplitComment" FOR UPDATE
  USING (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId")))
  WITH CHECK (app_is_system() OR app_is_split_member(app_split_expense_group("expenseId")));
CREATE POLICY splitcomment_delete ON "SplitComment" FOR DELETE
  USING (app_is_system());

-- ── SplitActivity: append-only (no UPDATE policy at all) ──────────────
DROP POLICY splitactivity_access ON "SplitActivity";
CREATE POLICY splitactivity_select ON "SplitActivity" FOR SELECT
  USING (app_is_system() OR app_is_split_member("groupId"));
CREATE POLICY splitactivity_insert ON "SplitActivity" FOR INSERT
  WITH CHECK (app_is_system() OR (app_is_split_member("groupId") AND "actorUserId" = app_current_user_id()));
CREATE POLICY splitactivity_delete ON "SplitActivity" FOR DELETE
  USING (app_is_system());

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX "SplitLabel_groupId_idx" ON "SplitLabel"("groupId");
CREATE INDEX "SplitLabel_ownerUserId_idx" ON "SplitLabel"("ownerUserId");
CREATE INDEX "SplitExpenseLabel_labelId_idx" ON "SplitExpenseLabel"("labelId");
