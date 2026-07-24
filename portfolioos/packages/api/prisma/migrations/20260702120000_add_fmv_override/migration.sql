-- CreateEnum
CREATE TYPE "FmvSource" AS ENUM ('SEED', 'USER');

-- CreateTable
CREATE TABLE "FmvOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isin" TEXT NOT NULL,
    "scripName" TEXT,
    "fmvPerUnit" DECIMAL(18,4) NOT NULL,
    "source" "FmvSource" NOT NULL DEFAULT 'SEED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FmvOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FmvOverride_userId_idx" ON "FmvOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FmvOverride_userId_isin_key" ON "FmvOverride"("userId", "isin");

-- AddForeignKey
ALTER TABLE "FmvOverride" ADD CONSTRAINT "FmvOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
