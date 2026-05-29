-- Phase 2c — Financial goals
--
-- Adds the Goal model + supporting enums. Per-user; cascades on User
-- delete. `portfolioIds` is a text[] FK array so a single goal can be
-- backed by multiple portfolios without a join table (a Goal × Portfolio
-- relationship table is the cleaner long-term shape but is over-spec
-- for v1 — array works for the typical 1-3 portfolios per goal).

CREATE TYPE "GoalCategory" AS ENUM (
  'RETIREMENT',
  'CHILD_EDUCATION',
  'HOME_PURCHASE',
  'EMERGENCY_FUND',
  'FIRE_CORPUS',
  'VEHICLE_PURCHASE',
  'TRAVEL',
  'WEALTH_BUILDING',
  'CUSTOM'
);

CREATE TYPE "GoalPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ACHIEVED', 'PAUSED', 'ABANDONED');

CREATE TABLE "Goal" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "category"       "GoalCategory" NOT NULL DEFAULT 'CUSTOM',
  "priority"       "GoalPriority" NOT NULL DEFAULT 'MEDIUM',
  "status"         "GoalStatus"   NOT NULL DEFAULT 'ACTIVE',
  "targetAmount"   DECIMAL(18,2) NOT NULL,
  "initialAmount"  DECIMAL(18,2) NOT NULL DEFAULT 0,
  "inflationRate"  DECIMAL(5,4),
  "expectedReturn" DECIMAL(5,4),
  "targetDate"     DATE NOT NULL,
  "startDate"      DATE NOT NULL DEFAULT CURRENT_DATE,
  "portfolioIds"   TEXT[] NOT NULL DEFAULT '{}',
  "notes"          TEXT,
  "achievedAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Goal_userId_status_idx"     ON "Goal" ("userId", "status");
CREATE INDEX "Goal_userId_targetDate_idx" ON "Goal" ("userId", "targetDate");

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS policy — every read/write must match app.current_user_id.
ALTER TABLE "Goal" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goal_owner" ON "Goal"
  USING ("userId" = current_setting('app.current_user_id', true));
