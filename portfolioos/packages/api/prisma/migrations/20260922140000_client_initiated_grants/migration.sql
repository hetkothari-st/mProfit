-- Letting the account holder start the relationship.
--
-- The product is used by the people whose money it is; a professional is
-- someone they bring in. Until now only a CA could open a relationship, which
-- inverted that: the person granting consent could not initiate it.
--
-- A client-initiated invitation is the SAME `Client` row, created by the
-- account holder with no advisor attached yet. That reuse is deliberate —
-- every scope column, every policy and the whole audit trail then apply
-- unchanged the moment a professional accepts. A separate invitation table
-- would have to grow its own copy of all of it.
--
-- `advisorId` therefore becomes nullable. Nothing is granted while it is null:
-- `app_is_active_ca_for` and its siblings all compare it to
-- `app_current_user_id()`, and null equals nobody. The row is visible to the
-- account holder through the existing `userId = app_current_user_id()` branch
-- of client_access, which is exactly who should be able to see and cancel
-- their own open invitation.

ALTER TABLE "Client" ALTER COLUMN "advisorId" DROP NOT NULL;

CREATE TYPE "ClientInitiator" AS ENUM ('ADVISOR', 'CLIENT');

-- Existing rows were all opened by a CA, which is what the default records.
ALTER TABLE "Client"
  ADD COLUMN "initiatedBy" "ClientInitiator" NOT NULL DEFAULT 'ADVISOR';

CREATE INDEX "Client_userId_initiatedBy_idx" ON "Client"("userId", "initiatedBy");
