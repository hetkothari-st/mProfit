# Documentation Gaps — Data in (B07)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Import, Email ingestion, Gmail connection and inbox scans, CAS, Documents

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; nothing was seen in a browser.
- Google OAuth, Gmail, Anthropic (Claude), Gemini and Redis need live credentials and services; their responses and timings were not exercised.
- Production values of operator switches (`ENABLE_LLM_PARSER`, `MAILBOX_POLL_INTERVAL_MIN`, `GEMINI_API_KEY`, AI budget AppSettings) are unknown; behaviour is documented for each value.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-INGEST-008 | Whether email-text parsing runs in production | `ENABLE_LLM_PARSER` and `ANTHROPIC_API_KEY` values on the host; with the default (`false`) every monitored email becomes a hidden failure record and no events appear | Deployment config not readable from the repo | Check the host's environment |
| F-MAIL-006 | Actual poll interval | `MAILBOX_POLL_INTERVAL_MIN` on the host (default 3; page text says 10) | Deployment config | Check env; align the page text |
| F-IMPORT-008 | Whether the AI contract-note parser and the Gemini CAS fallback are active | Depends on `ANTHROPIC_API_KEY`/`ENABLE_LLM_PARSER` and `GEMINI_API_KEY` | Deployment config | Check env |
| F-MAIL-004 | Classifier availability and accuracy | Whether inbox-scan documents are classified or all left for manual review | Needs live AI and Gmail | Run a scan on a test account |
| F-DOCS-002 | OCR and AI-fallback quality | How often real documents are filed correctly vs left for review | Needs real documents and a running worker | Test with sample documents |
| F-MAIL-001 | Gmail "send" permission consent screen | How Google's consent screen presents the two permissions | Needs a live OAuth flow | Review the consent screen |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-INGEST-006 | Defect: every new monitored sender is created with auto-commit ON (the UI never sends the flag, the service defaults it to true), contradicting the page header "Everything is reviewable before it lands in your records", the threshold help text, and the server guard that refuses enabling auto-commit before N approvals | `packages/api/src/services/gmail/monitoredSenders.service.ts:99`, `apps/web/src/pages/ingestion/SendersPage.tsx:120`, `apps/web/src/pages/ingestion/IngestionPage.tsx:170`, `packages/api/src/controllers/monitoredSenders.controller.ts:54` | Should new senders start in review mode (auto-commit off)? |
| F-INGEST-008 | Defect: senders saved in `@domain` form (offered by the Senders page) are put into the Gmail query but the poller matches From addresses by exact lookup only, so their emails are counted "unmatched" and never parsed | `packages/api/src/ingestion/gmail/poller.ts:165`, `packages/api/src/services/gmail/monitoredSenders.service.ts:47`, `apps/web/src/pages/ingestion/SendersPage.tsx:91` | Match domain senders by suffix (as the attachment sync already does at `packages/api/src/ingestion/gmail/gmail.connector.ts:96`)? |
| F-IMPORT-004 | Defect: a wrong password on the Import page closes the unlock dialog with "Password accepted — reprocessing"; the reprocess endpoint returns 200 with the job still NEEDS_PASSWORD, so the dialog's "That password didn't unlock the file" path never runs | `packages/api/src/controllers/imports.controller.ts:234`, `apps/web/src/pages/imports/ImportPage.tsx:49`, `apps/web/src/hooks/useUploadWithPasswordRetry.ts:126` | Return FILE_LOCKED when the job is still locked? |
| F-IMPORT-003 | Defect: jobs failed by the worker or the orphan sweep store `errorLog.workerError` (e.g. "Import was interrupted. Please upload the file again."), but the **Errors** button only appears for failed rows/warnings and the dialog never renders `workerError`, so these jobs show **Failed** with no reason | `packages/api/src/jobs/importWorker.ts:61`, `packages/api/src/jobs/importWorker.ts:144`, `apps/web/src/pages/imports/ImportPage.tsx:307`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:24` | Show workerError in the dialog? |
| F-MAIL-001 | Mismatch: Gmail connection requests `gmail.send` as well as `gmail.readonly`, while the ingestion page says the scan is "(read-only)" | `packages/api/src/ingestion/gmail/gmail.connector.ts:26`, `apps/web/src/pages/ingestion/IngestionPage.tsx:385` | Update the copy, or request send only when rent reminders are enabled? |
| F-MAIL-002 | Defect: the access-lost message tells users to "Click Reconnect on the Mailboxes page", but `/mailboxes` redirects to `/ingestion` and there is no Reconnect button | `packages/api/src/ingestion/gmail/gmail.connector.ts:247`, `apps/web/src/App.tsx:268` | Reword to "Add another" on Connect your Gmail? |
| F-MAIL-002 | Defect: **Disconnect** does not invalidate the `mailboxes` cache, so the account stays listed until **Refresh** | `apps/web/src/pages/ingestion/IngestionPage.tsx:356` | Invalidate after success? |
| F-INGEST-004 | Mismatch: empty-state text says "poller runs every 10 minutes"; the default interval is 3 minutes | `apps/web/src/pages/ingestion/IngestionPage.tsx:967`, `packages/api/src/config/env.ts:91` | Make the text match or omit the number |
| F-IMPORT-001 | Defect: a file with an unsupported extension dropped on the Import box (the drop zone does not filter like the picker) is rejected by multer with a plain `Error`, which the error handler maps to 500 "Internal server error" in production; same for the Documents sorter | `packages/api/src/middleware/upload.ts:61`, `packages/api/src/middleware/documentUpload.ts:56`, `packages/api/src/middleware/errorHandler.ts:111`, `apps/web/src/pages/imports/ImportDropzone.tsx:20` | Throw a BadRequestError with the "Unsupported file type" text? |
| F-MAIL-001 | Defect: "Google did not return a refresh token …" is a plain `Error`, so users see "Internal server error" in production instead of the actionable message | `packages/api/src/ingestion/gmail/gmail.connector.ts:162`, `packages/api/src/middleware/errorHandler.ts:111` | Map to a 400 with the message? |
| F-CAS-001 | Stale copy: **Next steps** mention an IMAP mailbox and "Imports → CAS PDF", neither of which exists in the app; the controller comment also says the poller picks CAS up "once an IMAP account is set" | `packages/api/src/controllers/cas.controller.ts:109`, `packages/api/src/controllers/cas.controller.ts:110`, `packages/api/src/controllers/cas.controller.ts:11` | Point to Gmail connection and Tools → Import |
| F-IMPORT-002 | Every uploaded PDF is typed CONTRACT_NOTE_PDF (and spreadsheets GENERIC_EXCEL) from the extension, so a CAS upload shows **CONTRACT NOTE PDF** in **Type** | `packages/api/src/controllers/imports.controller.ts:48` | Show the parser used instead? |
| F-MAIL-003 | Mismatch: scan setup says "Both dates inclusive" and allows from = until, but the server rejects it with "lookbackTo must be after lookbackFrom" | `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:88`, `packages/api/src/services/gmail/gmailScanJobs.service.ts:16` | Allow a one-day scan (`<` instead of `<=`)? |
| F-INGEST-009 | Approved SIP_INSTALLMENT, FD_CREATION/FD_MATURITY, RENT_*, VEHICLE_CHALLAN and VALUATION_SNAPSHOT events are marked PROJECTED with no record written, though they leave the review queue as if committed | `packages/api/src/ingestion/projection.ts:537` | Warn on approval, or project SIPs as transactions? |
| F-INGEST-006 | Defect: the add-sender form sends `displayLabel: ''` when left blank; the server keeps `''` (only null triggers the seed label) and lists show `displayLabel ?? address`, i.e. an empty name | `apps/web/src/pages/ingestion/SendersPage.tsx:22`, `packages/api/src/services/gmail/monitoredSenders.service.ts:90`, `apps/web/src/pages/ingestion/SendersPage.tsx:212` | Send null for blank labels? |
| F-MAIL-005 | Copy promises "You approve each new sender once", but attachment sync imports from any sender whose attachment name matches the statement patterns, and senders start with auto-commit on | `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:75`, `packages/api/src/ingestion/gmail/gmail.connector.ts:443` | Reword the banner |
| F-INGEST-002 | Card says "scoring is done locally from subject keywords"; scoring runs on the server and also uses message snippets | `apps/web/src/pages/ingestion/IngestionPage.tsx:660`, `packages/api/src/ingestion/gmail/keywords.ts:156` | Reword |
| F-INGEST-007 | The **Auto-committed** tab lists every PROJECTED event, including ones approved by hand | `apps/web/src/pages/ingestion/ReviewPage.tsx:37` | Rename the tab to "Committed"? |
| F-INGEST-004 | **View original in Gmail** always opens Gmail account `/u/0`, which may be a different Google account than the connected one | `apps/web/src/pages/ingestion/IngestionPage.tsx:1128` | Use the authuser parameter with the connected address? |
| F-MAIL-007 | **Scan inbox** runs only the attachment sync, not the monitored-sender email reader, so email-text events still wait for the next poll | `apps/web/src/context/ScanContext.tsx:35`, `packages/api/src/controllers/mailboxes.controller.ts:128` | Run both? |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-IMPORT-011 | Ingestion failures page `/import/failures` (also `/ops/ingestion-failures`): unresolved/resolved/all filters, adapter filter, cursor paging (50), detail with stack and raw payload, **Retry parse** for gmail.*/email.* adapters, **Mark as resolved** (Entered manually, Retried successfully, Ignored, Fixed externally, Data corrected & re-uploaded) | Hidden — nav item and Import page link commented out | `apps/web/src/components/layout/navItems.tsx:122`, `apps/web/src/pages/imports/ImportPage.tsx:137`, `apps/web/src/App.tsx:262`, `apps/web/src/pages/imports/FailuresPage.tsx:127` |
| F-IMPORT-012 | "Market data & scoring failures" card (global feed runs with FAILED/REFUSED status) | Hidden (only on the hidden page) | `apps/web/src/pages/imports/FailuresPage.tsx:455` |
| F-IMPORT-013 | GET one import job | Backend-only (`importsApi.get` has no caller) | `packages/api/src/routes/imports.routes.ts:26` |
| F-INGEST-010 | Edit/read one event (`PATCH`/`GET /api/canonical-events/:id`) — type, date, amount, quantity, price, counterparty, instrument, portfolio | Backend-only | `packages/api/src/controllers/canonicalEvents.controller.ts:35` |
| F-INGEST-011 | LLM spend gauge in the sidebar and `GET /api/ingestion/budget` | Hidden (component commented out) | `apps/web/src/components/layout/SidebarNav.tsx:190` |
| F-INGEST-012 | Auto-discovery after connect (`/ingestion?auto-discover=1` auto-runs the scan and preselects seed matches and scores ≥ 4) | Hidden — nothing links with this parameter (the callback goes to `/gmail/scan-setup`) | `apps/web/src/pages/ingestion/IngestionPage.tsx:60`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:55` |
| F-MAIL-008 | `MailboxesPage` ("Email Inbox Gateway": IMAP accounts, test, sync) — imported in App.tsx but never routed; `/mailboxes` redirects. IMAP create/test/update/delete endpoints have no live caller; existing IMAP rows are still polled | Hidden (dead page) | `apps/web/src/App.tsx:37`, `apps/web/src/App.tsx:268`, `apps/web/src/pages/mailboxes/MailboxesPage.tsx:123`, `packages/api/src/jobs/mailboxPoller.ts:228` |
| F-MAIL-009 | `POST /api/gmail/:id/sync` (used only by the dead page) | Backend-only | `packages/api/src/routes/gmail.routes.ts:19` |
| F-MAIL-010 | Inbox scan cancel/resume, auto-approve rule list/create/delete endpoints | Backend-only (rules are created only via approve-with-rule from Reports) | `packages/api/src/routes/gmailScan.routes.ts:31`, `packages/api/src/routes/gmailScan.routes.ts:44` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-INGEST-001 | While managing a family member, the ingestion page still shows Connect Gmail, discovery and the sender/event lists | `/api/gmail` and `/api/mailboxes` refuse ("Switch back to your own account to do this."), but `/api/monitored-senders` and `/api/canonical-events` accept and act on the managed person, who has no Gmail | `packages/api/src/services/family/managedProfile.service.ts:45` |
| F-INGEST-006 | Senders page help says auto-commit is offered after N approvals | API creates senders with auto-commit already on, bypassing its own threshold guard | `packages/api/src/services/gmail/monitoredSenders.service.ts:99` |
| F-IMPORT-012 | (Hidden page) card says these failures "affect every account" | Endpoint returns global rows to any signed-in user by design | `packages/api/src/controllers/ingestionFailures.controller.ts:51` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Split B07 into five chapters: Import (IMPORT), Email ingestion (INGEST), Gmail connection and inbox scans (MAIL), CAS (CAS), Documents (DOCS) | One "Data in" chapter | Mirrors the sidebar entries and keeps feature IDs per area |
| Documented the Gmail auto-connect banner and the scan shortcut (ScanContext) under MAIL; the **Scan inbox** button itself lives on B02's Mutual Funds page | Leave the shortcut to B02 | Brief assigns the scan context to B07; B02 lists it as a dependency |
| The inbox-scan approval screen (**Reports → Inbox imports**) is left to B08 and listed as D-MAIL-001; B07 documents the scan pipeline behind it | Document the tab here | Route ownership: `/reports` belongs to B08 |
| `/import/failures` documented as Hidden (inventory + gaps only), not as a user-manual feature | Full manual section | Skill rule: Hidden features are not taught to users; it is unreachable from the UI |
| IMAP mailboxes (dead MailboxesPage) folded into one Hidden row F-MAIL-008 | Separate rows per endpoint | No UI caller exists; only the poller still uses existing rows |
| Confirmed B02's open question (F-MF-003 auto-tried passwords): profile PAN, PAN+DOB variants, DOB formats, email, phone, plus saved file passwords | — | Traced in `packages/api/src/lib/pdf.ts:92` and `packages/api/src/lib/decryptIfNeeded.ts:187` |
| No new R- IDs; family-view roles marked "Same as base plan" | — | Every endpoint here filters by the signed-in user id |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
| `alerts@hdfcbank.net` | Placeholder of the **Email address** field, `apps/web/src/pages/ingestion/SendersPage.tsx:88` | A generic bank alert address used as example text in the app, not user data (audit run with `--allow-email-domain hdfcbank.net`) |
<!-- END ALLOWLIST -->
