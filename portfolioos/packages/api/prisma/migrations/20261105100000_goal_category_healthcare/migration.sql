-- Healthcare goals (a medical corpus, a planned procedure) grow at health
-- inflation rather than the personal basket rate. Additive enum value only.
ALTER TYPE "GoalCategory" ADD VALUE IF NOT EXISTS 'HEALTHCARE' AFTER 'VEHICLE_PURCHASE';
