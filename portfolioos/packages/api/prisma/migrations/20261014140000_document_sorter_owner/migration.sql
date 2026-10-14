-- Document sorter: files filed per person (docs/superpowers/specs/2026-10-14-document-sorter-design.md).
-- Its own migration: a new enum value cannot be used in the transaction that adds it.
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'PERSON_DOCS';
