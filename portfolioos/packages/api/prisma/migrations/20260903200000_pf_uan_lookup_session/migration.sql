-- UAN lookup reuses the PF fetch session machinery.
--
-- Finding a member's UAN happens BEFORE any ProvidentFundAccount exists — the
-- lookup is what produces the identifier an account is later created with. So
-- providentFundAccountId becomes nullable and a `kind` discriminator says which
-- of the two flows a session is.
--
-- The alternative was a placeholder account row per attempt, which leaves
-- identifier-less accounts behind on every failed lookup, or a second session
-- model, which duplicates a state machine (INITIATED → AWAITING_CAPTCHA →
-- AWAITING_OTP → …) that would then have to be kept in step twice.
--
-- Existing rows are all passbook fetches, which is why the default matches.

CREATE TYPE "PfSessionKind" AS ENUM ('UAN_LOOKUP', 'PASSBOOK_FETCH');

ALTER TABLE "PfFetchSession"
  ADD COLUMN "kind" "PfSessionKind" NOT NULL DEFAULT 'PASSBOOK_FETCH';

ALTER TABLE "PfFetchSession"
  ALTER COLUMN "providentFundAccountId" DROP NOT NULL;

-- The RLS policy on PfFetchSession keys off "userId", which is unchanged and
-- still NOT NULL, so a session with no account is scoped exactly as before.
-- Worth stating because dropping NOT NULL on a foreign key is the kind of
-- change that quietly widens what a policy matches when the policy joins
-- through that key — this one does not.
