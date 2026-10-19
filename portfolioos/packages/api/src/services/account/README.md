# services/account/

The user's own account settings and lifecycle.

- `accountDeletion.service.ts` — account deletion with a 30-day grace period, then the purge.
- `userPreferences.service.ts` — per-user preferences, including which asset-class sections show in the sidebar.
- `extensionPairing.service.ts` — pairing the browser extension (PF/PPF fetch) with an account.

Jobs: `jobs/accountDeletionJob.ts`. HTTP: `routes/userPreferences.routes.ts`, `routes/auth.routes.ts` (deletion), `routes/pf.routes.ts` (pairing).
