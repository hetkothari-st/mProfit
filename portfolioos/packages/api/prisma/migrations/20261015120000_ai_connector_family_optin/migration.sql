-- AI Connector Part 2: a person opts in to being included in family members'
-- ChatGPT/Claude connections (spec section 7.2). Off by default.
ALTER TABLE "User" ADD COLUMN "aiConnectorFamilyOptIn" BOOLEAN NOT NULL DEFAULT false;
