-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('INVESTOR', 'HNI', 'FAMILY_OFFICE', 'ADVISOR', 'CA', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'LITE', 'PLUS', 'HNI', 'FAMILY_OFFICE', 'ADVISOR');

-- CreateEnum
CREATE TYPE "PortfolioType" AS ENUM ('INVESTMENT', 'TRADING', 'GOAL', 'STRATEGY');

-- CreateEnum
CREATE TYPE "Exchange" AS ENUM ('BSE', 'NSE', 'MCX', 'NFO', 'BFO');

-- CreateEnum
CREATE TYPE "MFCategory" AS ENUM ('EQUITY', 'DEBT', 'HYBRID', 'SOLUTION_ORIENTED', 'OTHER', 'ETF', 'INDEX_FUND', 'ELSS', 'FMP', 'LIQUID');

-- CreateEnum
CREATE TYPE "CorporateActionType" AS ENUM ('DIVIDEND', 'BONUS', 'SPLIT', 'MERGER', 'DEMERGER', 'RIGHTS', 'BUYBACK');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'FUTURES', 'OPTIONS', 'MUTUAL_FUND', 'ETF', 'BOND', 'GOVT_BOND', 'CORPORATE_BOND', 'FIXED_DEPOSIT', 'NPS', 'PPF', 'EPF', 'PMS', 'AIF', 'REIT', 'INVIT', 'GOLD_BOND', 'GOLD_ETF', 'PHYSICAL_GOLD', 'PHYSICAL_SILVER', 'ULIP', 'INSURANCE', 'REAL_ESTATE', 'PRIVATE_EQUITY', 'CRYPTOCURRENCY', 'ART_COLLECTIBLES', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'SWITCH_IN', 'SWITCH_OUT', 'SIP', 'DIVIDEND_REINVEST', 'DIVIDEND_PAYOUT', 'BONUS', 'SPLIT', 'MERGER_IN', 'MERGER_OUT', 'DEMERGER_IN', 'DEMERGER_OUT', 'RIGHTS_ISSUE', 'INTEREST_RECEIVED', 'MATURITY', 'REDEMPTION', 'DEPOSIT', 'WITHDRAWAL', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "OptionType" AS ENUM ('CALL', 'PUT');

-- CreateEnum
CREATE TYPE "CapitalGainType" AS ENUM ('INTRADAY', 'SHORT_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "CashFlowType" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'PURCHASE', 'SALES');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('CONTRACT_NOTE_PDF', 'CONTRACT_NOTE_EXCEL', 'CONTRACT_NOTE_HTML', 'MF_CAS_PDF', 'MF_CAS_EXCEL', 'BACK_OFFICE_CSV', 'BANK_STATEMENT_PDF', 'BANK_STATEMENT_CSV', 'NPS_STATEMENT', 'GENERIC_CSV', 'GENERIC_EXCEL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('FD_MATURITY', 'BOND_MATURITY', 'MF_LOCK_IN_EXPIRY', 'SIP_DUE', 'INSURANCE_PREMIUM', 'DIVIDEND_RECEIVED', 'CORPORATE_ACTION', 'PRICE_TARGET', 'CUSTOM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "pan" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'INVESTOR',
    "plan" "PlanTier" NOT NULL DEFAULT 'FREE',
    "planExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "advisorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "pan" TEXT,
    "phone" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "PortfolioType" NOT NULL DEFAULT 'INVESTMENT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioGroupMember" (
    "portfolioId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "PortfolioGroupMember_pkey" PRIMARY KEY ("portfolioId","groupId")
);

-- CreateTable
CREATE TABLE "StockMaster" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" "Exchange" NOT NULL,
    "isin" TEXT,
    "sector" TEXT,
    "industry" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MutualFundMaster" (
    "id" TEXT NOT NULL,
    "schemeCode" TEXT NOT NULL,
    "schemeName" TEXT NOT NULL,
    "amcName" TEXT NOT NULL,
    "category" "MFCategory" NOT NULL,
    "subCategory" TEXT,
    "isin" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MutualFundMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPrice" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "open" DECIMAL(18,4) NOT NULL,
    "high" DECIMAL(18,4) NOT NULL,
    "low" DECIMAL(18,4) NOT NULL,
    "close" DECIMAL(18,4) NOT NULL,
    "volume" BIGINT,

    CONSTRAINT "StockPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MFNav" (
    "id" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nav" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "MFNav_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateAction" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "type" "CorporateActionType" NOT NULL,
    "exDate" DATE NOT NULL,
    "ratio" DECIMAL(18,6),
    "amount" DECIMAL(18,4),
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "stockId" TEXT,
    "fundId" TEXT,
    "assetName" TEXT,
    "isin" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "avgCostPrice" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "currentPrice" DECIMAL(18,4),
    "currentValue" DECIMAL(18,4),
    "unrealisedPnL" DECIMAL(18,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "holdingId" TEXT,
    "assetClass" "AssetClass" NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "stockId" TEXT,
    "fundId" TEXT,
    "assetName" TEXT,
    "isin" TEXT,
    "tradeDate" DATE NOT NULL,
    "settlementDate" DATE,
    "quantity" DECIMAL(18,6) NOT NULL,
    "price" DECIMAL(18,4) NOT NULL,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "brokerage" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "stt" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "stampDuty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "exchangeCharges" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "gst" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sebiCharges" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(18,4) NOT NULL,
    "strikePrice" DECIMAL(18,4),
    "expiryDate" DATE,
    "optionType" "OptionType",
    "lotSize" INTEGER,
    "maturityDate" DATE,
    "interestRate" DECIMAL(8,4),
    "interestFrequency" TEXT,
    "broker" TEXT,
    "exchange" "Exchange",
    "orderNo" TEXT,
    "tradeNo" TEXT,
    "narration" TEXT,
    "importJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalGain" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "sellTransactionId" TEXT NOT NULL,
    "buyTransactionId" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL,
    "assetName" TEXT NOT NULL,
    "isin" TEXT,
    "buyDate" DATE NOT NULL,
    "sellDate" DATE NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "buyPrice" DECIMAL(18,4) NOT NULL,
    "sellPrice" DECIMAL(18,4) NOT NULL,
    "buyAmount" DECIMAL(18,4) NOT NULL,
    "sellAmount" DECIMAL(18,4) NOT NULL,
    "indexedCostOfAcquisition" DECIMAL(18,4),
    "capitalGainType" "CapitalGainType" NOT NULL,
    "gainLoss" DECIMAL(18,4) NOT NULL,
    "taxableGain" DECIMAL(18,4) NOT NULL,
    "financialYear" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalGain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlow" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "CashFlowType" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentId" TEXT,
    "openingBalance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "voucherNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT,
    "isAutoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherEntry" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "narration" TEXT,
    "transactionId" TEXT,

    CONSTRAINT "VoucherEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "broker" TEXT,
    "totalRows" INTEGER,
    "successRows" INTEGER,
    "failedRows" INTEGER,
    "errorLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "triggerDate" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Client_advisorId_idx" ON "Client"("advisorId");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE INDEX "Portfolio_clientId_idx" ON "Portfolio"("clientId");

-- CreateIndex
CREATE INDEX "PortfolioGroup_userId_idx" ON "PortfolioGroup"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMaster_symbol_key" ON "StockMaster"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "StockMaster_isin_key" ON "StockMaster"("isin");

-- CreateIndex
CREATE UNIQUE INDEX "MutualFundMaster_schemeCode_key" ON "MutualFundMaster"("schemeCode");

-- CreateIndex
CREATE INDEX "StockPrice_stockId_idx" ON "StockPrice"("stockId");

-- CreateIndex
CREATE UNIQUE INDEX "StockPrice_stockId_date_key" ON "StockPrice"("stockId", "date");

-- CreateIndex
CREATE INDEX "MFNav_fundId_idx" ON "MFNav"("fundId");

-- CreateIndex
CREATE UNIQUE INDEX "MFNav_fundId_date_key" ON "MFNav"("fundId", "date");

-- CreateIndex
CREATE INDEX "CorporateAction_stockId_exDate_idx" ON "CorporateAction"("stockId", "exDate");

-- CreateIndex
CREATE INDEX "Holding_portfolioId_idx" ON "Holding"("portfolioId");

-- CreateIndex
CREATE INDEX "Holding_stockId_idx" ON "Holding"("stockId");

-- CreateIndex
CREATE INDEX "Holding_fundId_idx" ON "Holding"("fundId");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_portfolioId_assetClass_stockId_fundId_isin_key" ON "Holding"("portfolioId", "assetClass", "stockId", "fundId", "isin");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_tradeDate_idx" ON "Transaction"("portfolioId", "tradeDate");

-- CreateIndex
CREATE INDEX "Transaction_stockId_idx" ON "Transaction"("stockId");

-- CreateIndex
CREATE INDEX "Transaction_fundId_idx" ON "Transaction"("fundId");

-- CreateIndex
CREATE INDEX "Transaction_importJobId_idx" ON "Transaction"("importJobId");

-- CreateIndex
CREATE INDEX "CapitalGain_portfolioId_financialYear_idx" ON "CapitalGain"("portfolioId", "financialYear");

-- CreateIndex
CREATE INDEX "CapitalGain_sellTransactionId_idx" ON "CapitalGain"("sellTransactionId");

-- CreateIndex
CREATE INDEX "CashFlow_portfolioId_date_idx" ON "CashFlow"("portfolioId", "date");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_userId_code_key" ON "Account"("userId", "code");

-- CreateIndex
CREATE INDEX "Voucher_userId_date_idx" ON "Voucher"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_userId_type_voucherNo_key" ON "Voucher"("userId", "type", "voucherNo");

-- CreateIndex
CREATE INDEX "VoucherEntry_voucherId_idx" ON "VoucherEntry"("voucherId");

-- CreateIndex
CREATE INDEX "VoucherEntry_debitAccountId_idx" ON "VoucherEntry"("debitAccountId");

-- CreateIndex
CREATE INDEX "VoucherEntry_creditAccountId_idx" ON "VoucherEntry"("creditAccountId");

-- CreateIndex
CREATE INDEX "ImportJob_userId_createdAt_idx" ON "ImportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_userId_triggerDate_idx" ON "Alert"("userId", "triggerDate");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_advisorId_fkey" FOREIGN KEY ("advisorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGroup" ADD CONSTRAINT "PortfolioGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGroupMember" ADD CONSTRAINT "PortfolioGroupMember_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioGroupMember" ADD CONSTRAINT "PortfolioGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PortfolioGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPrice" ADD CONSTRAINT "StockPrice_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "StockMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MFNav" ADD CONSTRAINT "MFNav_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "MutualFundMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateAction" ADD CONSTRAINT "CorporateAction_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "StockMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "StockMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "MutualFundMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES "Holding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "StockMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "MutualFundMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "ImportJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapitalGain" ADD CONSTRAINT "CapitalGain_sellTransactionId_fkey" FOREIGN KEY ("sellTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlow" ADD CONSTRAINT "CashFlow_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_debitAccountId_fkey" FOREIGN KEY ("debitAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoucherEntry" ADD CONSTRAINT "VoucherEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
