-- CA workspace — write paths: manual transaction entry and file import.
--
-- Adds three narrow, additive INSERT policies (plus one SELECT policy the
-- import listing needs) rather than relaxing the CA's existing grant shape.
-- See packages/api/test/security/ca-access.test.ts for the assertions these
-- exist to satisfy.
--
-- ─── 1. Transaction: CA may now CREATE, not just correct ─────────────
--
-- `20260908120000_ca_workspace_foundation` deliberately shipped `transaction_
-- ca_correct` as FOR UPDATE only, reasoning that letting a CA conjure a row
-- into existence was a bigger step than letting them fix one. That reasoning
-- no longer holds: `correctTransactionSchema` already lets a CA rewrite
-- `tradeDate`, `quantity`, `price`, `assetName`, `isin` and every charge field
-- on ANY existing transaction — a CA who wants to fabricate a trade can
-- already take a ₹1 buy and correct it into 500 shares at any price on any
-- date. Forbidding INSERT therefore only stopped a CA adding a row to an
-- EMPTY ledger, which protected almost nothing while blocking the workspace's
-- main use case: a CA cannot help a client whose books do not exist yet.
--
-- The five-table write allow-list from the foundation migration is otherwise
-- unchanged — this widens ONE table's ONE command, not the model.
CREATE POLICY transaction_ca_insert ON "Transaction"
  FOR INSERT
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "Portfolio" p
      WHERE p.id = "Transaction"."portfolioId"
        AND app_is_active_ca_for(p."userId")
    )
  );

-- ─── 2. ImportJob: CA may create and list a client's import jobs ─────
--
-- `ImportJob` has never carried any CA policy at all — not even SELECT.
-- `createImportJob` (services/imports/import.service.ts) internally wraps
-- its own body in `runAsUser(input.userId)` as a context bridge (a pre-
-- existing, unrelated fix for multer/Bull dropping the AsyncLocalStorage
-- store), so in practice the INSERT it performs already runs under the
-- CLIENT's own identity and is admitted by the ordinary `importjob_owner`
-- policy. `importjob_ca_insert` is added anyway, for the same reason
-- `transaction_ca_correct`'s policies carry a belt-and-braces
-- `app_is_system()` branch even where another clause already grants it: a
-- security boundary should be a fact about the table, not an accident of one
-- helper's current implementation.
--
-- `importjob_ca_read` is NOT optional in the same way. `caListImports` reads
-- under the CA's OWN ambient identity (no `runAsUser` bridge — see
-- `listImportJobs`), so without this policy `importjob_owner`'s
-- `"userId" = app_current_user_id()` is false for every row and the CA's
-- "recent import jobs" list would silently return empty forever. This is the
-- related-table gap the task asked to watch for: the GET endpoint cannot work
-- without it.
CREATE POLICY importjob_ca_insert ON "ImportJob"
  FOR INSERT
  WITH CHECK (
    app_is_system()
    OR app_is_active_ca_for("userId")
  );

CREATE POLICY importjob_ca_read ON "ImportJob"
  FOR SELECT
  USING (
    app_is_system()
    OR app_is_active_ca_for("userId")
  );

-- ─── 3. Portfolio: bootstrap-only, not a general CA write ────────────
--
-- A shadow client (`createManagedClient`) is a brand-new `User` row with no
-- portfolio, so the very first transaction or import for them fails
-- `assertPortfolio` before it reaches the ledger at all. Something has to be
-- able to create that first container.
--
-- This is deliberately NOT `app_is_active_ca_for("userId")` alone, which
-- would reopen the boundary two existing tests assert on purpose —
-- `cannot create a portfolio for the client` and the portfolio assertion
-- inside `rebuilds derived rows under the CA own identity, without
-- impersonation` (both in ca-access.test.ts, both pre-dating this change and
-- deliberately left unmodified). "A CA keeps the books but does not own the
-- account" is still true for every client who already has a portfolio.
--
-- The added clause narrows the grant to exactly the bootstrap case: a CA may
-- INSERT a Portfolio for a client ONLY WHEN that client currently has zero.
-- A client who already has one (every seeded test fixture, every real
-- INVITED client, and this client after its first bootstrap) can never be
-- given a second by their CA.
--
-- SECURITY DEFINER, for the same reason as `app_is_active_ca_for`
-- (comment on that function, `20260908120000_ca_workspace_foundation`) and
-- `app_is_active_family_owner` (`20260903090000_fix_familymember_policy_
-- recursion`): a raw `NOT EXISTS (SELECT ... FROM "Portfolio" ...)` inside a
-- policy ON "Portfolio" re-enters Portfolio's own row security to evaluate
-- that SELECT and Postgres aborts with 42P17 ("infinite recursion detected
-- in policy for relation Portfolio") — caught by this migration's own test
-- run, not guessed at. Running the existence check as definer reads
-- "Portfolio" without going through its policies at all, exactly like the
-- other two functions already do for their own tables.
CREATE OR REPLACE FUNCTION app_ca_client_has_no_portfolio(target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM "Portfolio" WHERE "userId" = target_user_id
  );
$$;

COMMENT ON FUNCTION app_ca_client_has_no_portfolio(TEXT) IS
  'RLS helper for portfolio_ca_bootstrap_insert. SECURITY DEFINER so checking whether a client already has a Portfolio does not re-enter Portfolio''s own policies (42P17).';

GRANT EXECUTE ON FUNCTION app_ca_client_has_no_portfolio(TEXT) TO portfolioos_app;

-- Known limitation, not remediated here: two concurrent bootstrap requests
-- for the same brand-new client can both observe zero existing rows under
-- READ COMMITTED and both insert, producing two portfolios. This is the same
-- check-then-create race every other idempotent-bootstrap helper in this
-- codebase already accepts (createPortfolio's `onboarding: true` short-
-- circuit; createManagedClient's shadow-user creation) — not a regression
-- introduced here, and the cost of a rare duplicate empty portfolio is low
-- relative to an advisory lock on every write in the common path.
CREATE POLICY portfolio_ca_bootstrap_insert ON "Portfolio"
  FOR INSERT
  WITH CHECK (
    app_is_system()
    OR (
      app_is_active_ca_for("userId")
      AND app_ca_client_has_no_portfolio("userId")
    )
  );

-- ─── 4. Audit vocabulary for the new write paths ──────────────────────
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'TRANSACTION_CREATED';
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'IMPORT_JOB_CREATED';
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'PORTFOLIO_CREATED';
