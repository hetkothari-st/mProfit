# Settings and Toggles Reference — Data in (B07)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Import, Email ingestion, Gmail connection and inbox scans, CAS, Documents

<!-- BEGIN SETTINGS -->
## Import → Upload a file

### Target portfolio (optional) <!-- S-IMPORT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Import → Upload a file** |
| Purpose | Portfolio that receives the transactions of the next uploaded file |
| Default | **Default / first portfolio** (empty value) (source: `apps/web/src/pages/imports/ImportPage.tsx:41`) |
| Values | A portfolio: every row goes there · Empty: server uses your portfolio marked default, else your first portfolio (`packages/api/src/services/imports/import.service.ts:343`) |
| Depends on | You must own the portfolio ("Portfolio not found" otherwise) |
| Persists | No — page state only; stored on the import job (`ImportJob.portfolioId`) for that file |
| Stored in | `ImportJob.portfolioId` |
| Backend effect | Rows of that job are written to the portfolio; reprocessing keeps it |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/imports/ImportPage.tsx:155`, `packages/api/src/services/imports/import.service.ts:74` |

## Import → Unlock dialog

### Remember this password for future locked files <!-- S-IMPORT-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Tools → Import → Import history → Needs password** dialog |
| Purpose | Keep a working file password for automatic use on later locked files |
| Default | `on` (source: `apps/web/src/components/upload/PasswordPromptDialog.tsx:42`); server default `true` (`packages/api/src/controllers/imports.controller.ts:179`) |
| Values | `on`: a password that unlocked the file is added at the front of your saved list (max 10); a PAN-shaped password is saved as profile PAN instead, only if you have none · `off`: used once (a PAN-shaped password is still saved to an empty profile PAN) |
| Depends on | Only applied when the password actually unlocked the file |
| Persists | Yes — server |
| Stored in | `User.savedFilePasswordsEnc` (encrypted list) or `User.pan`/`panEnc` |
| Backend effect | Saved passwords are tried first on every future locked import (`packages/api/src/lib/decryptIfNeeded.ts:189`) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/components/upload/PasswordPromptDialog.tsx:97`, `packages/api/src/controllers/imports.controller.ts:206`, `packages/api/src/lib/userDocPasswords.ts:39` |

## Email ingestion → Monitored senders

### Active / Paused (Pause polling / Resume polling) <!-- S-INGEST-001 -->
| Attribute | Value |
|---|---|
| Control type | Toggle (power icon) |
| Location | **Inbox → Connect your Gmail → Sender settings**, each sender row |
| Purpose | Whether the sender's emails are fetched |
| Default | `on` (Active) — schema default; `packages/api/src/services/gmail/monitoredSenders.service.ts:101` creates without overriding |
| Values | `on`: included in the poll query and trusted for attachment file-name relaxation · `off`: ignored by both |
| Depends on | A connected, active Gmail |
| Persists | Yes — server |
| Stored in | `MonitoredSender.isActive` |
| Backend effect | Poll query built from active senders only (`packages/api/src/ingestion/gmail/poller.ts:236`); attachment sync trust list (`packages/api/src/ingestion/gmail/gmail.connector.ts:386`) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:158`, `packages/api/src/controllers/monitoredSenders.controller.ts:22` |

### Auto-commit <!-- S-INGEST-002 -->
| Attribute | Value |
|---|---|
| Control type | Toggle (lightning icon); also **Enable auto-commit** banner |
| Location | **Sender settings** rows; banner in **Pending review** |
| Purpose | Let a sender's events be written without manual review |
| Default | `on` for every new sender (source: `packages/api/src/services/gmail/monitoredSenders.service.ts:99`) — the UI help text implies it starts off |
| Values | `on`: new events with all figures found and confidence ≥ 0.70 are confirmed and written immediately; others wait in review · `off`: every event waits in **Pending review** |
| Depends on | Turning it on is refused while approved count < S-INGEST-003 ("Approve <n> more event(s) from this sender before enabling auto-commit."); creation bypasses this |
| Persists | Yes — server |
| Stored in | `MonitoredSender.autoCommitEnabled` |
| Backend effect | Event status PARSED vs PENDING_REVIEW and auto-projection (`packages/api/src/ingestion/gmail/pipeline.ts:171`, `packages/api/src/ingestion/gmail/pipeline.ts:522`) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:164`, `packages/api/src/controllers/monitoredSenders.controller.ts:54` |

### Auto-commit after N confirmed events <!-- S-INGEST-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Sender settings → Add sender manually** |
| Purpose | Approvals needed before auto-commit can be (re-)enabled and the offer banner shows |
| Default | `5` (source: `apps/web/src/pages/ingestion/SendersPage.tsx:23`, `packages/api/src/services/gmail/monitoredSenders.service.ts:75`) |
| Values | Whole number 1–100 |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `MonitoredSender.autoCommitAfter` |
| Backend effect | Guard on enabling auto-commit; banner condition `confirmedEventCount ≥ autoCommitAfter` |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (at creation only in the UI; API also accepts it on update) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:106`, `packages/api/src/controllers/monitoredSenders.controller.ts:16` |

### Display label (optional) <!-- S-INGEST-004 -->
| Attribute | Value |
|---|---|
| Control type | Text |
| Location | **Sender settings → Add sender manually** |
| Purpose | Friendly name shown instead of the address |
| Default | Empty; server fills the institution seed label only when the value is missing (null) |
| Values | Up to 120 characters |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `MonitoredSender.displayLabel` |
| Backend effect | None beyond display |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (at creation only in the UI) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:96`, `packages/api/src/services/gmail/monitoredSenders.service.ts:90` |

## Gmail → Shell banner

### Dismiss (Gmail auto-connect banner) <!-- S-MAIL-001 -->
| Attribute | Value |
|---|---|
| Control type | Button (cross) |
| Location | Banner at the top of every signed-in page |
| Purpose | Hide the "Auto-import statements from your inbox." banner |
| Default | Not dismissed |
| Values | Dismissed: banner never shows on this browser · Not dismissed: shows when its other conditions hold |
| Depends on | Banner shows only for @gmail.com/@googlemail.com sign-in emails with no active Gmail connection and Gmail sign-in configured |
| Persists | This device only |
| Stored in | localStorage `gmail-auto-connect-dismissed` |
| Backend effect | None |
| Who can change | Any signed-in user who sees the banner |
| Sources | `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:11`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72` |

## Gmail → Choose how far back to scan

### Scan from / Scan until <!-- S-MAIL-002 -->
| Attribute | Value |
|---|---|
| Control type | Date pickers + presets (**Last 7 days**, **Last 30 days**, **Last 1 year**, **Last 5 years**) |
| Location | `/gmail/scan-setup` (after connecting Gmail) |
| Purpose | Date window of the inbox scan |
| Default | From 5 years ago to today (source: `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:31`) |
| Values | Any range ending today or earlier; the server requires **Scan until** after **Scan from** |
| Depends on | An active Gmail |
| Persists | Stored on the scan job only |
| Stored in | `GmailScanJob.lookbackFrom` / `lookbackTo` |
| Backend effect | Gmail query `after:` / `before:` (until + 1 day) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:46`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:61` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| localStorage `gmail-auto-connect-dismissed` | `1` when the Gmail banner was dismissed | On dismiss | Never cleared by the app | Yes — stays dismissed on this browser even after disconnecting Gmail |
| React Query `imports` (memory) | Import history | On page load; every 2 s while a job is Pending/Processing; after upload, delete, reprocess, scan | **Refresh** button | Yes — no polling once all jobs are final |
| React Query `mailboxes` (memory) | Connected email accounts (shared by ingestion page, banner, scan shortcut; banner keeps it 60 s) | On load | After Gmail callback; **Refresh** | Yes — not refreshed after **Disconnect** |
| React Query `monitored-senders`, `canonical-events` (memory) | Senders and events | On load | After approve/reject/enable/remove; **Refresh** | Yes — new polled events appear only after a refresh or remount |
| React Query `doc-sorter/tree` (memory) | Documents folder tree | On load | Every 3 s while a file is being read; after each change | Briefly |
| Documents progress list (component state) | Last 12 uploads and their status | On upload | — | Lost when leaving the page |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `MAX_UPLOAD_SIZE_MB` | Upload size limit for imports (Documents uses the lower of this and 25) | 50 MB |
| `UPLOAD_DIR` | Where uploaded and emailed files are written before processing | `./uploads` |
| `REDIS_URL` | Bull queues `imports`, `gmail-scan`, `doc-sort` | Jobs cannot be queued; imports stay Pending until restart |
| `ENABLE_IMPORT_WORKER` | `false` disables the import worker | Enabled |
| `ENABLE_MAILBOX_POLLER` | `false` stops all mailbox polling (Gmail events, Gmail attachments, IMAP) | Enabled (`true`) |
| `MAILBOX_POLL_INTERVAL_MIN` | Minutes between polls | 3 (the ingestion page text says 10) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL` | Purpose: Google sign-in for Gmail (secret is a credential) | Gmail connect fails; banner hidden |
| `ANTHROPIC_API_KEY` | Purpose: credential for Claude (email parsing, generic contract notes, inbox-scan classification, Documents fallback) | AI features refuse; emails become failure records |
| `ENABLE_LLM_PARSER` | Must be `true` in production for any AI parsing call | Default `false`: AI gate closed in production |
| `LLM_MODEL` | Model for email parsing | `claude-haiku-4-5-20251001` |
| `ANTHROPIC_ZERO_RETENTION_CONFIRMED` | Advisory flag logged at start | `false` |
| `GEMINI_API_KEY` | Purpose: credential for the Gemini AI fallback of the CAMS/KFintech CAS parser | Fallback skipped |
| `ENABLE_DATA_INTEGRITY_CRON` | `false` disables the 02:15 IST job that also runs ingestion recovery | Enabled |
| `NODE_ENV` | `production` hides unmapped error text ("Internal server error") and requires `ENABLE_LLM_PARSER` | — |
| AppSetting `llm.monthly_warn_inr`, `llm.monthly_cap_inr` (+ `.user.<id>` overrides), `llm.usd_inr_fx` | Monthly AI budget per user and FX rate | ₹500 warn, ₹1,000 cap, ₹90/USD |
<!-- END OPERATOR-CONFIG -->
