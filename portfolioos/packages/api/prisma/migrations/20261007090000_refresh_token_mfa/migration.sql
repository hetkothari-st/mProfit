-- Remember whether a session was signed in with a second factor, so it
-- survives token refresh. Gates the CA / adviser workspace. Additive.
ALTER TABLE "RefreshToken" ADD COLUMN "mfa" BOOLEAN NOT NULL DEFAULT false;
