-- Cross-document disagreements found during extraction (endorsement vs schedule vs wording). Additive.
ALTER TABLE "ExtractedPolicyData" ADD COLUMN "conflicts" JSONB;
