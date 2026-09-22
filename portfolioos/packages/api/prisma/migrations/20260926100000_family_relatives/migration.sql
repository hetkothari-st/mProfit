-- Who a family member is related to ("Father" of whom), so the tree can
-- place them and say so. Additive only.
ALTER TABLE "FamilyMember" ADD COLUMN "relatedToId" TEXT;
ALTER TABLE "FamilyInvitation" ADD COLUMN "relation" TEXT;
ALTER TABLE "FamilyInvitation" ADD COLUMN "relatedToId" TEXT;
ALTER TABLE "PendingFamilyInvite" ADD COLUMN "relatedToId" TEXT;
