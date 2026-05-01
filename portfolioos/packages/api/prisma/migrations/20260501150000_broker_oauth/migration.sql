-- BrokerCredential: add OAuth fields, relax accessToken/tokenExpiresAt to nullable.
-- Existing v1 rows lose nothing — accessToken/tokenExpiresAt remain populated.
-- New rows can be created with only apiKey + apiSecret/totpSecret and complete
-- OAuth later.

ALTER TABLE "BrokerCredential" ADD COLUMN "apiSecret" TEXT;
ALTER TABLE "BrokerCredential" ADD COLUMN "clientCode" TEXT;
ALTER TABLE "BrokerCredential" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "BrokerCredential" ADD COLUMN "redirectUri" TEXT;
ALTER TABLE "BrokerCredential" ADD COLUMN "loginState" TEXT;
ALTER TABLE "BrokerCredential" ADD COLUMN "loginStateExpiresAt" TIMESTAMP(3);

ALTER TABLE "BrokerCredential" ALTER COLUMN "accessToken" DROP NOT NULL;
ALTER TABLE "BrokerCredential" ALTER COLUMN "tokenExpiresAt" DROP NOT NULL;

CREATE UNIQUE INDEX "BrokerCredential_loginState_key"
  ON "BrokerCredential"("loginState")
  WHERE "loginState" IS NOT NULL;
