-- CreateEnum
CREATE TYPE "CommodityType" AS ENUM ('GOLD', 'SILVER', 'PLATINUM');

-- CreateTable
CREATE TABLE "CommodityPrice" (
    "id" TEXT NOT NULL,
    "commodity" "CommodityType" NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'GRAM_24K',
    "source" TEXT NOT NULL DEFAULT 'IBJA',

    CONSTRAINT "CommodityPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoMaster" (
    "id" TEXT NOT NULL,
    "coinGeckoId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoPrice" (
    "id" TEXT NOT NULL,
    "cryptoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "priceInr" DECIMAL(24,8) NOT NULL,
    "priceUsd" DECIMAL(24,8),

    CONSTRAINT "CryptoPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FXRate" (
    "id" TEXT NOT NULL,
    "baseCcy" TEXT NOT NULL,
    "quoteCcy" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'RBI',

    CONSTRAINT "FXRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommodityPrice_commodity_date_idx" ON "CommodityPrice"("commodity", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CommodityPrice_commodity_date_unit_key" ON "CommodityPrice"("commodity", "date", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoMaster_coinGeckoId_key" ON "CryptoMaster"("coinGeckoId");

-- CreateIndex
CREATE INDEX "CryptoPrice_cryptoId_date_idx" ON "CryptoPrice"("cryptoId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoPrice_cryptoId_date_key" ON "CryptoPrice"("cryptoId", "date");

-- CreateIndex
CREATE INDEX "FXRate_baseCcy_quoteCcy_date_idx" ON "FXRate"("baseCcy", "quoteCcy", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FXRate_baseCcy_quoteCcy_date_key" ON "FXRate"("baseCcy", "quoteCcy", "date");

-- AddForeignKey
ALTER TABLE "CryptoPrice" ADD CONSTRAINT "CryptoPrice_cryptoId_fkey" FOREIGN KEY ("cryptoId") REFERENCES "CryptoMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
