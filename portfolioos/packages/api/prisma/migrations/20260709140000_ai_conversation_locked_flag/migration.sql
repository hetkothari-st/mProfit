-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "AiConversation_userId_locked_idx" ON "AiConversation"("userId", "locked");
