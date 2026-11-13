-- A held fund's rating moved to another form band on the monthly re-rate.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'MF_RATING_CHANGE';
