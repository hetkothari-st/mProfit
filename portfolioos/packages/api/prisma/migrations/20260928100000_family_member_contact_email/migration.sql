-- Where to reach a member who has no login, for the hand-over invitation
-- later. Not their User.email, which stays an unroutable placeholder.
ALTER TABLE "FamilyMember" ADD COLUMN "contactEmail" TEXT;
