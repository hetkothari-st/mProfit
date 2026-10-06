-- Sending a client their invitation from inside the app is a thing done TO a
-- client's relationship, so it belongs on the trail they can read — and the
-- send limits are counted off that same trail rather than a counter column
-- that could disagree with it.
ALTER TYPE "CaAuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_EMAILED';
