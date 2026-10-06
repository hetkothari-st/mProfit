# Security

## Reporting a vulnerability

Email **security@<your-domain>** (to be filled in by the owner) with steps to
reproduce. Please don't open a public issue. We aim to acknowledge within 2
business days and to fix critical issues within 7 days.

## How user data is protected

| Layer | What |
|---|---|
| Tenant isolation | Postgres row-level security on every user-scoped table. The API connects as `portfolioos_app` (NOSUPERUSER, NOBYPASSRLS); production refuses to boot on a role that bypasses RLS. |
| Identifiers at rest | PAN, vehicle plate and engine number, bank/loan account numbers, CIF, policy numbers and tenant contacts are AES-256-GCM ciphertext (`APP_ENCRYPTION_KEY`), with keyed fingerprints for lookups. Plaintext copies are cleared once `PII_BACKFILL_CLEAR_PLAINTEXT=true`. |
| Files at rest | Vault documents are sealed with a per-user data key (`lib/userKeys.ts`), itself wrapped by a key derived from `APP_ENCRYPTION_KEY`. |
| Third-party secrets | Broker keys and tokens, mailbox passwords and OAuth tokens are encrypted under `SECRETS_KEY`. |
| Transport and browser | HTTPS with HSTS; exact-origin CORS; enforced CSP on the web app; `CSP: sandbox` on every API response. |
| Logs | Credentials, identifiers and URL tokens are redacted before logging. |
| LLM calls | Typed PII is redacted before anything is sent to Anthropic; zero retention must be enabled on the account (`ANTHROPIC_ZERO_RETENTION_CONFIRMED`). |

## Keys and secrets

Production secrets live in Railway service variables, never in the repo.

| Secret | Losing it means | Keep a copy |
|---|---|---|
| `APP_ENCRYPTION_KEY` | Every encrypted identifier and every vault file is **unrecoverable**. | Password manager, offline. Required before setting `PII_BACKFILL_CLEAR_PLAINTEXT=true`. |
| `SECRETS_KEY` | Users must reconnect brokers and mailboxes. | Password manager. |
| `JWT_SECRET` | Everyone is signed out (no data loss). | Optional. |
| `BACKUP_PASSPHRASE` | Backups can't be opened. | Password manager, **not** next to the backups. |
| `ONLYOFFICE_JWT_SECRET` | Document editing stops until both services share a new one. | Optional. |

**Rotation.** `JWT_SECRET`: replace it; users sign in again. `SECRETS_KEY`: the
boot job moves legacy rows onto the current key, but there is no general
re-key job yet. `APP_ENCRYPTION_KEY`: there is no re-encryption job yet, so
don't rotate it without one. A per-user-key re-wrap (`UserDataKey`) would only
need the KEK changed; identifier columns would need full re-encryption.

## Backups and restore

Scripts: `portfolioos/scripts/db-backup.sh` and `portfolioos/scripts/db-restore-verify.sh`.
They need Docker and OpenSSL; Postgres tools run from the official image
(`PG_IMAGE`, default `postgres:17`, which must be at least the server's
version).

**Take a backup.** Use the owner connection (`DIRECT_URL`), not the app role,
or RLS hides rows from the dump:

```bash
export DATABASE_URL='<production owner connection string>'
export BACKUP_PASSPHRASE='<from the password manager>'
portfolioos/scripts/db-backup.sh ./backups
```

This writes `everypaisa-<UTC>.dump.enc` plus a `.sha256`. The dump is
encrypted before it reaches disk. Store it off Railway (e.g. an encrypted
drive or private bucket) and keep at least the last 7 daily and 4 weekly.

**Verify a restore (quarterly).**

```bash
BACKUP_PASSPHRASE=... portfolioos/scripts/db-restore-verify.sh backups/everypaisa-<UTC>.dump.enc "$DATABASE_URL"
```

This checks the checksum, decrypts straight into a throwaway Postgres
container, restores, compares every table's row count with the source, and
removes the container. Rows written after the backup show up as differences.
Last verified on 2026-10-06 against a test database: 116 tables and 2,985 rows,
all counts matched. **Production restore drill:** not yet run. Record the date
and result here when it is.

**Real restore.** Restore into a new database, point `DATABASE_URL` and
`DIRECT_URL` at it, then re-create the `portfolioos_app` role and grants (the
dump omits ownership and ACLs). `APP_ENCRYPTION_KEY` must be the same value as
when the backup was taken.

## If the server or a secret is compromised

1. **Contain.** Rotate the Railway project tokens and the DB password. Set
   `JWT_SECRET` to a new value (signs everyone out).
2. **Revoke third-party access.**
   - Gmail: in Google Cloud Console, reset the OAuth client secret. That
     invalidates every refresh token issued to the app. Then clear
     `MailboxAccount` tokens so users reconnect.
   - Brokers and Account Aggregator: revoke the app's keys in each broker's
     developer console and in Finvu.
3. **Assess.** Use `AuditLog` (append-only for users) for PII reveals,
   exports, logins and managed-profile access. Also check Railway deploy logs.
4. **Notify.** Under the DPDP Act, notify the Data Protection Board and the
   affected users without delay, with what happened, which data, and what
   users should do.
5. **Recover.** Restore from the last verified backup if data was altered.
   Rotate `SECRETS_KEY` and `APP_ENCRYPTION_KEY` only once a re-encryption
   job exists (see Rotation).
