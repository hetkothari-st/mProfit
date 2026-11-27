-- Firm seats: a CA's staff work on the clients the CA assigns them.
--
-- Every CA access rule used to ask one question: is the current user the
-- grant's advisor (Client."advisorId")? It now asks app_acts_for_client():
-- the advisor, OR an ACTIVE staff seat of that advisor's firm assigned to
-- this client. The seven access functions every client-books policy goes
-- through are recreated with that one substitution and nothing else, so the
-- grant's own limits (status, window, portfolios, categories, asset classes,
-- edit rights) bind a staff member exactly as they bind the CA.
--
-- Deliberately NOT extended to staff: writing the Client row itself (the
-- grant), invoices and the practice profile, and the seats themselves.

CREATE TYPE "FirmSeatStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TABLE "FirmSeat" (
  "id" TEXT NOT NULL,
  "firmOwnerId" TEXT NOT NULL,
  "staffUserId" TEXT,
  "name" TEXT NOT NULL,
  "invitedEmail" TEXT NOT NULL,
  "inviteTokenHash" TEXT,
  "inviteExpiresAt" TIMESTAMP(3),
  "status" "FirmSeatStatus" NOT NULL DEFAULT 'PENDING',
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FirmSeat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FirmSeat_inviteTokenHash_key" ON "FirmSeat"("inviteTokenHash");
CREATE INDEX "FirmSeat_firmOwnerId_status_idx" ON "FirmSeat"("firmOwnerId", "status");
CREATE INDEX "FirmSeat_staffUserId_status_idx" ON "FirmSeat"("staffUserId", "status");
ALTER TABLE "FirmSeat" ADD CONSTRAINT "FirmSeat_firmOwnerId_fkey"
  FOREIGN KEY ("firmOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirmSeat" ADD CONSTRAINT "FirmSeat_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FirmSeatClient" (
  "id" TEXT NOT NULL,
  "seatId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FirmSeatClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FirmSeatClient_seatId_clientId_key" ON "FirmSeatClient"("seatId", "clientId");
CREATE INDEX "FirmSeatClient_clientId_idx" ON "FirmSeatClient"("clientId");
ALTER TABLE "FirmSeatClient" ADD CONSTRAINT "FirmSeatClient_seatId_fkey"
  FOREIGN KEY ("seatId") REFERENCES "FirmSeat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FirmSeatClient" ADD CONSTRAINT "FirmSeatClient_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'STAFF_ASSIGNED';
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'STAFF_UNASSIGNED';

-- ─── The one question ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app_acts_for_client(client_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c.id = client_id
      AND c."advisorId" IS NOT NULL
      AND (
        c."advisorId" = app_current_user_id()
        OR EXISTS (
          SELECT 1
          FROM "FirmSeat" s
          JOIN "FirmSeatClient" a ON a."seatId" = s.id
          WHERE s."staffUserId" = app_current_user_id()
            AND s.status = 'ACTIVE'
            AND s."firmOwnerId" = c."advisorId"
            AND a."clientId" = c.id
        )
      )
  );
$$;
GRANT EXECUTE ON FUNCTION app_acts_for_client(TEXT) TO portfolioos_app;

-- ─── The seven access functions, advisor check swapped for the question ─

CREATE OR REPLACE FUNCTION public.app_ca_grant_covers_portfolio(owner_id text, portfolio_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND (
        c."scopeAllPortfolios"
        OR EXISTS (
          SELECT 1 FROM "ClientPortfolioScope" s
          WHERE s."clientId" = c.id AND s."portfolioId" = portfolio_id
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_ca_may_see_portfolio(portfolio_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "Portfolio" p
    JOIN "Client" c ON c."userId" = p."userId"
    WHERE p.id = portfolio_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND (
        c."scopeAllPortfolios"
        OR EXISTS (
          SELECT 1 FROM "ClientPortfolioScope" s
          WHERE s."clientId" = c.id AND s."portfolioId" = p.id
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_ca_may_see_category(owner_id text, wanted_category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND (c."scopeAllCategories" OR wanted_category = ANY(c."visibleCategories"))
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_ca_may_see_asset_class(owner_id text, wanted_asset_class text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom" <= now())
      AND (c."accessUntil" IS NULL OR c."accessUntil" >= now())
      AND (c."scopeAllAssetClasses" OR wanted_asset_class = ANY(c."visibleAssetClasses"::TEXT[]))
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_ca_may_edit(owner_id text, wanted_section text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND CASE wanted_section
            WHEN 'BOOKS'        THEN c."canEditBooks"
            WHEN 'TRANSACTIONS' THEN c."canEditTransactions"
            WHEN 'IMPORTS'      THEN c."canEditImports"
            WHEN 'FMV'          THEN c."canEditFmv"
            ELSE false
          END
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_ca_covers_all_asset_classes(owner_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = owner_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
      AND c."scopeAllAssetClasses"
  );
$function$;

CREATE OR REPLACE FUNCTION public.app_is_active_ca_for(target_user_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM "Client" c
    WHERE c."userId" = target_user_id
      AND app_acts_for_client(c.id)
      AND c.status = 'ACTIVE'
      AND (c."accessFrom" IS NULL OR c."accessFrom"::date <= app_ist_today())
      AND (c."accessUntil" IS NULL OR c."accessUntil"::date >= app_ist_today())
  );
$function$;

-- ─── Policies keyed on the advisor directly ──────────────────────────

-- Staff READ the grant they work under; only the advisor and the client
-- write it (client_access is unchanged).
CREATE POLICY client_staff_read ON "Client"
  FOR SELECT USING (app_is_system() OR app_acts_for_client(id));

DROP POLICY clientportfolioscope_read ON "ClientPortfolioScope";
CREATE POLICY clientportfolioscope_read ON "ClientPortfolioScope"
  FOR SELECT USING (
    app_is_system()
    OR app_acts_for_client("clientId")
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "ClientPortfolioScope"."clientId" AND c."userId" = app_current_user_id())
  );

DROP POLICY clientfiling_read ON "ClientFiling";
CREATE POLICY clientfiling_read ON "ClientFiling"
  FOR SELECT USING (
    app_is_system()
    OR app_acts_for_client("clientId")
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "ClientFiling"."clientId" AND c."userId" = app_current_user_id())
  );
DROP POLICY clientfiling_write ON "ClientFiling";
CREATE POLICY clientfiling_write ON "ClientFiling"
  FOR ALL USING (app_is_system() OR app_acts_for_client("clientId"))
  WITH CHECK (app_is_system() OR app_acts_for_client("clientId"));

DROP POLICY clientnote_advisor ON "ClientNote";
CREATE POLICY clientnote_advisor ON "ClientNote"
  FOR ALL USING (app_is_system() OR app_acts_for_client("clientId"))
  WITH CHECK (app_is_system() OR app_acts_for_client("clientId"));

DROP POLICY clienttask_advisor ON "ClientTask";
CREATE POLICY clienttask_advisor ON "ClientTask"
  FOR ALL USING (app_is_system() OR app_acts_for_client("clientId"))
  WITH CHECK (app_is_system() OR app_acts_for_client("clientId"));

DROP POLICY documentrequest_parties ON "DocumentRequest";
CREATE POLICY documentrequest_parties ON "DocumentRequest"
  FOR ALL USING (
    app_is_system()
    OR app_acts_for_client("clientId")
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "DocumentRequest"."clientId" AND c."userId" = app_current_user_id())
  )
  WITH CHECK (
    app_is_system()
    OR app_acts_for_client("clientId")
    OR EXISTS (SELECT 1 FROM "Client" c WHERE c.id = "DocumentRequest"."clientId" AND c."userId" = app_current_user_id())
  );

-- The firm reads the whole trail of a client it acts for: the CA sees what
-- their staff did, a staff member sees what happened before them.
CREATE POLICY caauditlog_firm_read ON "CaAuditLog"
  FOR SELECT USING (app_is_system() OR app_acts_for_client("clientId"));

-- ─── The seats themselves ────────────────────────────────────────────

ALTER TABLE "FirmSeat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FirmSeat" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FirmSeatClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FirmSeatClient" FORCE ROW LEVEL SECURITY;

CREATE POLICY firmseat_owner ON "FirmSeat"
  FOR ALL USING (app_is_system() OR "firmOwnerId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "firmOwnerId" = app_current_user_id());
CREATE POLICY firmseat_staff_read ON "FirmSeat"
  FOR SELECT USING (app_is_system() OR "staffUserId" = app_current_user_id());

CREATE POLICY firmseatclient_owner ON "FirmSeatClient"
  FOR ALL USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "FirmSeat" s WHERE s.id = "FirmSeatClient"."seatId" AND s."firmOwnerId" = app_current_user_id())
  )
  WITH CHECK (
    app_is_system()
    OR EXISTS (
      SELECT 1 FROM "FirmSeat" s
      JOIN "Client" c ON c.id = "FirmSeatClient"."clientId"
      WHERE s.id = "FirmSeatClient"."seatId"
        AND s."firmOwnerId" = app_current_user_id()
        AND c."advisorId" = app_current_user_id()
    )
  );
CREATE POLICY firmseatclient_staff_read ON "FirmSeatClient"
  FOR SELECT USING (
    app_is_system()
    OR EXISTS (SELECT 1 FROM "FirmSeat" s WHERE s.id = "FirmSeatClient"."seatId" AND s."staffUserId" = app_current_user_id())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON "FirmSeat" TO portfolioos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FirmSeatClient" TO portfolioos_app;
