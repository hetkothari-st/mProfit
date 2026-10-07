-- Invitation tokens: looked up by SHA-256 hash, kept encrypted for resending.
-- Additive: the plaintext columns stay until the boot job
-- (sealLegacyInviteTokens) has moved each value into "…Enc".

ALTER TABLE "Client" ADD COLUMN "inviteTokenHash" TEXT;
ALTER TABLE "Client" ADD COLUMN "inviteTokenEnc" TEXT;
UPDATE "Client"
  SET "inviteTokenHash" = encode(sha256(convert_to("inviteToken", 'UTF8')), 'hex')
  WHERE "inviteToken" IS NOT NULL;
CREATE UNIQUE INDEX "Client_inviteTokenHash_key" ON "Client"("inviteTokenHash");

ALTER TABLE "FamilyInvitation" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "FamilyInvitation" ADD COLUMN "tokenEnc" TEXT;
UPDATE "FamilyInvitation"
  SET "tokenHash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
ALTER TABLE "FamilyInvitation" ALTER COLUMN "tokenHash" SET NOT NULL;
ALTER TABLE "FamilyInvitation" ALTER COLUMN "token" DROP NOT NULL;
CREATE UNIQUE INDEX "FamilyInvitation_tokenHash_key" ON "FamilyInvitation"("tokenHash");
