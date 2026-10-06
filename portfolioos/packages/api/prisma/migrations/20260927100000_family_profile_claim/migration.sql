-- An invitation can hand a managed profile to the person it belongs to:
-- accepting turns that profile into their own account. Additive only.
ALTER TABLE "FamilyInvitation" ADD COLUMN "claimForUserId" TEXT;
