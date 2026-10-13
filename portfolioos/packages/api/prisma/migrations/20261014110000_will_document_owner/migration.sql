-- Will Maker stores generated PDFs in the vault. Its own migration because a
-- new enum value cannot be used in the transaction that adds it.
ALTER TYPE "DocumentOwnerType" ADD VALUE IF NOT EXISTS 'WILL';
