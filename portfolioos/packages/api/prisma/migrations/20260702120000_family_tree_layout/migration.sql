-- Family tree editor — draggable + linkable UI.
-- Adds a nullable JSON column to persist per-family node positions
-- and user-drawn custom edges. Additive, no data migration.

ALTER TABLE "Family"
  ADD COLUMN "treeLayout" JSONB;
