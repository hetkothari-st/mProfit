-- Documents sorter: a merged or renamed folder keeps the names it used to have,
-- so a misspelling that was merged away does not create its folder again.
ALTER TABLE "DocumentPerson" ADD COLUMN "aliasKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
