-- Property photos and map pins, for Real Estate (OwnedProperty) and Rentals
-- (RentalProperty). Additive only.
--
-- Photos are stored in the database (no file storage or extra service): the
-- browser shrinks each one to ~1600px plus a ~480px thumbnail before upload,
-- and the API caps size and count and checks the bytes really are an image.
-- Each photo belongs to exactly one property; deleting the property deletes
-- its photos.
--
-- Map pins: coordinates are looked up once per address via OpenStreetMap
-- Nominatim (or placed by hand), and `geocodedAddress` records which address
-- they came from so an unchanged address is never looked up twice.

ALTER TABLE "RentalProperty"
  ADD COLUMN "latitude"        DOUBLE PRECISION,
  ADD COLUMN "longitude"       DOUBLE PRECISION,
  ADD COLUMN "locationSource"  TEXT,
  ADD COLUMN "geocodedAddress" TEXT,
  ADD COLUMN "geocodedAt"      TIMESTAMP(3);

ALTER TABLE "OwnedProperty"
  ADD COLUMN "latitude"        DOUBLE PRECISION,
  ADD COLUMN "longitude"       DOUBLE PRECISION,
  ADD COLUMN "locationSource"  TEXT,
  ADD COLUMN "geocodedAddress" TEXT,
  ADD COLUMN "geocodedAt"      TIMESTAMP(3);

CREATE TABLE "PropertyPhoto" (
  "id"               TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "ownedPropertyId"  TEXT,
  "rentalPropertyId" TEXT,
  "mimeType"         TEXT NOT NULL,
  "data"             BYTEA NOT NULL,
  "thumbMimeType"    TEXT NOT NULL,
  "thumb"            BYTEA NOT NULL,
  "width"            INTEGER NOT NULL,
  "height"           INTEGER NOT NULL,
  "sizeBytes"        INTEGER NOT NULL,
  "caption"          TEXT,
  "sortOrder"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PropertyPhoto_pkey" PRIMARY KEY ("id"),
  -- Exactly one owner.
  CONSTRAINT "PropertyPhoto_one_owner"
    CHECK (("ownedPropertyId" IS NULL) <> ("rentalPropertyId" IS NULL))
);

CREATE INDEX "PropertyPhoto_userId_ownedPropertyId_sortOrder_idx"
  ON "PropertyPhoto"("userId", "ownedPropertyId", "sortOrder");
CREATE INDEX "PropertyPhoto_userId_rentalPropertyId_sortOrder_idx"
  ON "PropertyPhoto"("userId", "rentalPropertyId", "sortOrder");

ALTER TABLE "PropertyPhoto" ADD CONSTRAINT "PropertyPhoto_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyPhoto" ADD CONSTRAINT "PropertyPhoto_ownedPropertyId_fkey"
  FOREIGN KEY ("ownedPropertyId") REFERENCES "OwnedProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyPhoto" ADD CONSTRAINT "PropertyPhoto_rentalPropertyId_fkey"
  FOREIGN KEY ("rentalPropertyId") REFERENCES "RentalProperty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- §3.6 RLS: PropertyPhoto carries userId directly. Same guarded pattern as
-- the Document vault migration, so it's safe where the helper functions or
-- the app role don't exist (e.g. Neon).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'app_current_user_id') THEN
    EXECUTE 'ALTER TABLE "PropertyPhoto" ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE "PropertyPhoto" FORCE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY propertyphoto_owner ON "PropertyPhoto"
      USING (app_is_system() OR "userId" = app_current_user_id())
      WITH CHECK (app_is_system() OR "userId" = app_current_user_id())';
  END IF;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'portfolioos_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "PropertyPhoto" TO portfolioos_app';
  END IF;
END
$do$;
