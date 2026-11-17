-- Scope extraction-doc dedupe to a single check.
-- A global UNIQUE(sourceHash) made a second health check (same file re-used)
-- find no docs of its own, and let one user's file hash collide with another's.
DROP INDEX IF EXISTS "PolicyExtractionDoc_sourceHash_key";
CREATE UNIQUE INDEX "PolicyExtractionDoc_checkId_sourceHash_key" ON "PolicyExtractionDoc"("checkId", "sourceHash");
