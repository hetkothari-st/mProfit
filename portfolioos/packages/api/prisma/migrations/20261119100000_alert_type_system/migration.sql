-- Operator alerts (fleet-wide jobs: loan rates stale, data drift, MF reference data) were stored as CUSTOM
-- and landed in the admin's normal inbox, bell and "overdue" count. They get their own type so the inbox
-- can leave them out. The value is used by the next migration, in its own transaction.
ALTER TYPE "AlertType" ADD VALUE IF NOT EXISTS 'SYSTEM';
