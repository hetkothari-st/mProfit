-- RenameTable
ALTER TABLE "SalaryIncome" RENAME TO "Income";

-- RenameColumn
ALTER TABLE "Income" RENAME COLUMN "employerName" TO "sourceName";

-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('SALARY', 'BUSINESS', 'TRADING', 'FREELANCE', 'RENTAL', 'INTEREST_DIVIDEND', 'CAPITAL_GAINS', 'OTHER');

-- AlterTable
ALTER TABLE "Income" ADD COLUMN "type" "IncomeType" NOT NULL DEFAULT 'SALARY';

-- RenameConstraint
ALTER TABLE "Income" RENAME CONSTRAINT "SalaryIncome_pkey" TO "Income_pkey";

-- RenameForeignKey
ALTER TABLE "Income" RENAME CONSTRAINT "SalaryIncome_userId_fkey" TO "Income_userId_fkey";

-- RenameIndex
ALTER INDEX "SalaryIncome_userId_isActive_idx" RENAME TO "Income_userId_isActive_idx";
