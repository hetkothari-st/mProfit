-- Per-user transactional email config + per-property branding.
--
-- The rent reminder pipeline was originally wired to global SMTP env
-- vars, which makes it impossible to use the app as multi-tenant SaaS
-- (every landlord would send from the same Gmail). Move the config into
-- the DB so each user supplies their own SMTP creds + sender identity
-- through Settings → Notifications, and let each property carry its own
-- landlord-name + payment-instructions for the email body.

CREATE TABLE IF NOT EXISTS "UserNotificationConfig" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "smtpHost"            TEXT NOT NULL,
  "smtpPort"            INTEGER NOT NULL,
  "smtpSecure"          BOOLEAN NOT NULL DEFAULT false,
  "smtpUser"            TEXT NOT NULL,
  "smtpPassEnc"         TEXT NOT NULL,
  "fromName"            TEXT NOT NULL,
  "fromEmail"           TEXT NOT NULL,
  "paymentInstructions" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserNotificationConfig_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserNotificationConfig_userId_key" UNIQUE ("userId"),
  CONSTRAINT "UserNotificationConfig_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "UserNotificationConfig" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNotificationConfig" FORCE  ROW LEVEL SECURITY;
CREATE POLICY usernotifconfig_owner ON "UserNotificationConfig"
  USING      (app_is_system() OR "userId" = app_current_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_current_user_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserNotificationConfig" TO portfolioos_app;

ALTER TABLE "RentalProperty"
  ADD COLUMN IF NOT EXISTS "landlordName" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentInstructions" TEXT;
