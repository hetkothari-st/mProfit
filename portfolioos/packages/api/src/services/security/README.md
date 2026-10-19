# services/security/

Encryption-at-rest, key rotation, and security notifications.

- `piiAtRest.service.ts` — encrypts PAN / registration numbers and other identifiers at rest; backfills on boot.
- `appKeyRotation.service.ts` — re-encrypts values after `APP_ENCRYPTION_KEY` rotation (steps in repo-root `SECURITY.md`).
- `secretRotation.service.ts` — re-encrypts stored third-party secrets (OAuth tokens, API keys, passwords) under the current `SECRETS_KEY`.
- `securityAlerts.service.ts` — new-device sign-in and similar alerts, built on the `AuditLog` trail.

Jobs: `jobs/keyRotationJobs.ts`, `jobs/secretRotationJobs.ts`, `jobs/securityAlertJobs.ts`, `jobs/piiAtRestJobs.ts`. Crypto helpers: `lib/secrets.ts`, `lib/userKeys.ts`.
