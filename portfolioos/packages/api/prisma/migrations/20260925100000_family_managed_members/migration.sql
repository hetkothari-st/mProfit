-- Managed family profiles: people without an email (a grandparent, a child)
-- whose finances another family member keeps. Additive only.

-- The profile's manager. A managed profile is also `isShadowClient`, so every
-- sign-in path already refuses it.
ALTER TABLE "User" ADD COLUMN "managedById" TEXT;
ALTER TABLE "User"
  ADD CONSTRAINT "User_managedById_fkey"
  FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "User_managedById_idx" ON "User"("managedById");

-- "Grandfather", "Wife" — shown on the family tree.
ALTER TABLE "FamilyMember" ADD COLUMN "relation" TEXT;

-- A pending (unpaid) seat can now hold a managed profile instead of an
-- email invitation.
ALTER TABLE "PendingFamilyInvite" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'INVITE';
ALTER TABLE "PendingFamilyInvite" ALTER COLUMN "invitedEmail" DROP NOT NULL;
ALTER TABLE "PendingFamilyInvite" ADD COLUMN "relation" TEXT;
ALTER TABLE "PendingFamilyInvite" ADD COLUMN "managedById" TEXT;
ALTER TABLE "PendingFamilyInvite"
  ADD CONSTRAINT "PendingFamilyInvite_managedById_fkey"
  FOREIGN KEY ("managedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
