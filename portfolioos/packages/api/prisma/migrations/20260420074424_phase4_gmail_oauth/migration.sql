-- CreateEnum
CREATE TYPE "MailboxProvider" AS ENUM ('IMAP', 'GMAIL_OAUTH');

-- AlterTable
ALTER TABLE "MailboxAccount" ADD COLUMN     "accessTokenEnc" TEXT,
ADD COLUMN     "googleEmail" TEXT,
ADD COLUMN     "historyId" TEXT,
ADD COLUMN     "provider" "MailboxProvider" NOT NULL DEFAULT 'IMAP',
ADD COLUMN     "refreshTokenEnc" TEXT,
ADD COLUMN     "tokenExpiresAt" TIMESTAMP(3),
ALTER COLUMN "host" DROP NOT NULL,
ALTER COLUMN "port" DROP NOT NULL,
ALTER COLUMN "username" DROP NOT NULL,
ALTER COLUMN "passwordEnc" DROP NOT NULL;
