-- Follow-up hardening for the EPF/PPF auto-fetch foundation.
--
-- FIX 2: Add missing FK from PfFetchSession.userId → User.id
-- FIX 3: Add missing FK from PfFetchSession.ingestionFailureId → IngestionFailure.id
-- FIX 5: Set DEFAULT CURRENT_TIMESTAMP on ProvidentFundAccount.updatedAt
--        (so raw INSERTs that bypass Prisma don't fail / leave NULL).
-- FIX 1: Recreate epf_member_isolation RLS policy WITH CHECK clause
--        (Postgres INSERT bypasses USING-only policies; WITH CHECK is required).

-- ── FIX 2: PfFetchSession → User FK ──────────────────────────────────────────

ALTER TABLE "PfFetchSession"
  ADD CONSTRAINT "PfFetchSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── FIX 3: PfFetchSession → IngestionFailure FK ──────────────────────────────

ALTER TABLE "PfFetchSession"
  ADD CONSTRAINT "PfFetchSession_ingestionFailureId_fkey"
  FOREIGN KEY ("ingestionFailureId") REFERENCES "IngestionFailure"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── FIX 5: ProvidentFundAccount.updatedAt default ────────────────────────────

ALTER TABLE "ProvidentFundAccount"
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ── FIX 1: Recreate EpfMemberId RLS policy with WITH CHECK ───────────────────
-- The original policy (from 20260506120000) had USING but no WITH CHECK.
-- Without WITH CHECK, Postgres allows any authenticated user to INSERT a child
-- row pointing to another user's providentFundAccountId.

DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'app_current_user_id'
  ) THEN
    DROP POLICY IF EXISTS epf_member_isolation ON "EpfMemberId";
    CREATE POLICY epf_member_isolation ON "EpfMemberId"
      USING (
        app_is_system() OR EXISTS (
          SELECT 1 FROM "ProvidentFundAccount" pfa
          WHERE pfa.id = "EpfMemberId"."providentFundAccountId"
            AND pfa."userId" = app_current_user_id()
        )
      )
      WITH CHECK (
        app_is_system() OR EXISTS (
          SELECT 1 FROM "ProvidentFundAccount" pfa
          WHERE pfa.id = "EpfMemberId"."providentFundAccountId"
            AND pfa."userId" = app_current_user_id()
        )
      );
  END IF;
END $do$;
