
## Gmail connection and inbox scans

Connecting a Gmail account (Google sign-in, no password stored) powers three separate things: the email-text events of [Email ingestion](#email-ingestion); a regular *attachment import* that picks up contract notes, CAS PDFs and statements from your inbox and sends them to [Import](#import); and an on-demand *inbox scan* that looks through a date range of mail for financial attachments for you to approve. The review screen for inbox-scan documents is **Reports → Inbox imports** (documented in the Reports chapter).

### Connect Gmail <!-- F-MAIL-001 -->
**What it does:** Sends you to Google to choose an account and grant access, then stores an encrypted access grant for that mailbox. After a successful connection you land on the scan-range page (F-MAIL-003).

**Why it exists:** The empty state explains it: "EveryPaisa scans Gmail for financial emails (read-only) and turns them into transactions. Connect once — we never scan anything except the senders you explicitly allow."

**Where to find it:** **Inbox → Connect your Gmail**, step **1 Connect your email** → **Connect Gmail**; or **Add another** on the **Email accounts** card; or **Connect Gmail** on the shell banner (F-MAIL-005). Google returns you to `/gmail/callback`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Denied to R-MANAGER ("Switch back to your own account to do this.").

**Steps**
1. Click **Connect Gmail** (or **Add another**). The browser goes to Google's account chooser and consent screen.
2. Choose the Google account and allow access.
3. Google sends you back; the page shows "Connecting Gmail…", then a toast "Connected <email>".
4. After about half a second you are taken to **Choose how far back to scan** (F-MAIL-003). If something failed you are taken back to **Email ingestion**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Disabled while the sign-in link is being created; shown when no Gmail is connected |
| **Add another** | Button | Connects another (or reconnects the same) Google account | Shown when at least one Gmail is connected |

**Fields and rules:** None in the app; Google asks for account and consent.

**Settings and toggles here:** None.

**Results:** A Gmail mailbox record is created (or, for the same address, updated and re-activated with a fresh grant). From the next poll the app imports matching attachments (F-MAIL-006) and reads monitored senders' emails (F-INGEST-008).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Google sign-in" | Gmail sign-in is not configured on the server, or a network error | Ask the operator; try again |
| "Google rejected: <error>" | You cancelled or Google refused consent | Try again and allow access |
| "Incomplete response from Google — please try connecting again" | Missing code or state in the return address | Start again |
| "Invalid or expired OAuth state — start the connect flow again" | The sign-in was started by another session, reused, or took too long | Click **Connect Gmail** again |
| "Internal server error" | Google did not return a long-lived grant (for example access was granted before) or another unmapped error | Remove the app's access at your Google account permissions page, then connect again |

**Limitations:** The app asks Google for permission to read **and send** email (send is used for rental rent reminders), although the screen describes the connection as read-only. Reconnecting the same address replaces its grant.

**How it works:** `GET /api/gmail/auth-url` issues a single-use state value tied to you and returns Google's URL with offline access, prompt "select_account consent" and scopes `gmail.readonly` and `gmail.send`. The callback page posts `code` and `state` to `POST /api/gmail/callback`; the server rejects a state not issued to you, exchanges the code, requires a refresh token, reads the mailbox address from Gmail, and stores refresh and access tokens encrypted. If the callback page was opened as a pop-up (rental reminders), it closes itself instead of navigating.

**Related features:** F-MAIL-002, F-MAIL-003, F-MAIL-006, F-INGEST-002, D-MAIL-003.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:346`, `apps/web/src/pages/ingestion/IngestionPage.tsx:385`, `apps/web/src/pages/ingestion/IngestionPage.tsx:418`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:26`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:39`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:55`, `packages/api/src/controllers/gmail.controller.ts:42`, `packages/api/src/ingestion/gmail/gmail.connector.ts:24`, `packages/api/src/ingestion/gmail/gmail.connector.ts:147`, `packages/api/src/ingestion/gmail/gmail.connector.ts:162`, `packages/api/src/ingestion/gmail/gmail.connector.ts:173`

### Email accounts and disconnect <!-- F-MAIL-002 -->
**What it does:** The **Email accounts** card lists each connected Gmail with "Last checked <date time>" or "Not polled yet", any last error, **Active** or **Paused**, and a disconnect button.

**Why it exists:** Inferred from behavior: shows whether the inbox is being read and lets you revoke access.

**Where to find it:** **Inbox → Connect your Gmail**, step 1 card **Email accounts** (shown once a Gmail is connected).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Not R-MANAGER.

**Steps**
1. Read the account line. **Paused** with "Gmail access lost: …" means the app lost access.
2. To disconnect, click the cross and confirm "Disconnect <email>?". The toast "Gmail disconnected" appears.
3. Click **Refresh** at the top of the page to see the account removed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Cross icon | Button | Disconnects the account after confirmation | Disabled while disconnecting |
| **Active** / **Paused** | Display | Whether the account is polled | — |

**Fields and rules:** None.

**Settings and toggles here:** None (an account cannot be paused by hand; it is paused automatically when access is lost).

**Results:** The app asks Google to revoke its grant and deletes the mailbox record. Already imported transactions, events and inbox-scan documents stay.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Gmail access lost: Access token rejected (refresh_token may be expired or revoked). Click Reconnect on the Mailboxes page." | Google rejected the stored grant; the account was paused | Click **Add another** and sign in with the same account (there is no Reconnect button or Mailboxes page) |
| Account still listed after "Gmail disconnected" | The card does not reload on its own | Click **Refresh** |
| "Failed to disconnect" / "Gmail account not found" | Server error, or already removed | Refresh the page |

**Limitations:** After disconnecting, the list is not refreshed automatically. The reauthorisation message names a page and button that no longer exist.

**How it works:** `DELETE /api/gmail/:id` checks the account is yours and a Gmail account, calls Google's token revocation (errors ignored) and deletes the `MailboxAccount` row. When any poll gets an authorisation error, the account is set inactive with the "Gmail access lost" message.

**Related features:** F-MAIL-001, F-MAIL-006.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:354`, `apps/web/src/pages/ingestion/IngestionPage.tsx:434`, `apps/web/src/pages/ingestion/IngestionPage.tsx:456`, `packages/api/src/controllers/gmail.controller.ts:88`, `packages/api/src/ingestion/gmail/gmail.connector.ts:247`, `packages/api/src/ingestion/gmail/gmail.connector.ts:544`

### Choose how far back to scan <!-- F-MAIL-003 -->
**What it does:** Starts a one-off *inbox scan* of your most recently connected active Gmail for every PDF, XLSX, XLS or CSV attachment between two dates, then sends you to **Reports → Inbox imports** to review what it finds.

**Why it exists:** The page says: "We'll look for every PDF, XLSX, XLS or CSV attachment in your Gmail between these dates." It back-fills history right after you connect.

**Where to find it:** Shown automatically after connecting Gmail (route `/gmail/scan-setup`). There is no menu entry.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with an active Gmail. Not R-MANAGER.

**Steps**
1. Adjust **Scan from** and **Scan until**, or click a preset: **Last 7 days**, **Last 30 days**, **Last 1 year**, **Last 5 years**.
2. Click **Start scan**. The toast "Scan started — review docs as they appear" appears and you go to **Reports → Inbox imports**.
3. Or click **Skip for now** to go to the dashboard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan from** | Date | First day to scan | Cannot be after **Scan until** |
| **Scan until** | Date | Last day to scan | Cannot be before **Scan from** or after today |
| **Last 7 days** / **Last 30 days** / **Last 1 year** / **Last 5 years** | Buttons | Set **Scan from** and set **Scan until** to today | — |
| **Skip for now** | Button | Goes to `/dashboard` | — |
| **Start scan** | Button | Creates the scan | Disabled while starting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Scan from | Date | Yes | YYYY-MM-DD | 5 years ago | "lookbackTo must be after lookbackFrom" (same day as **Scan until**) |
| Scan until | Date | Yes | YYYY-MM-DD, not after today | Today | As above |

**Settings and toggles here:** S-MAIL-002 **Scan from / Scan until** — the scan window; used once, not remembered.

**Results:** A scan job starts in the background. Found attachments appear one by one in **Reports → Inbox imports** for approval (F-MAIL-004).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Gmail before starting a scan" | No active Gmail | Connect Gmail |
| "lookbackTo must be after lookbackFrom" | Both dates are the same day | Pick at least two different days |
| "Too many requests for this operation. Please wait a minute." | More than 5 scans started in one minute | Wait a minute |
| "Failed to start scan" | Other error | Try again |

**Limitations:** The page text says "Both dates inclusive" and allows the same date twice, but the server refuses a one-day range. With several Gmail accounts, only the most recently connected active one is scanned. A running scan cannot be cancelled or resumed from the app.

**How it works:** `POST /api/gmail/scan-jobs` (`lookbackFrom`, `lookbackTo` as YYYY-MM-DD, parsed at 12:00 UTC) under the costly-operation rate limit (5 per minute); creates a `GmailScanJob` (kind FULL, status PENDING) and queues it on `gmail-scan`.

**Related features:** F-MAIL-001, F-MAIL-004, D-MAIL-001.

**Sources:** `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:21`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:34`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:46`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:88`, `packages/api/src/routes/gmailScan.routes.ts:28`, `packages/api/src/controllers/gmailScan.controller.ts:36`, `packages/api/src/services/gmail/gmailScanJobs.service.ts:16`

### Inbox scan processing <!-- F-MAIL-004 -->
**What it does:** Works through a scan job: lists matching emails, downloads each attachment, marks attachments already imported as duplicates, asks an AI classifier whether each one is a financial document, keeps likely ones as "pending approval", and applies your auto-approve rules. Approved documents become import jobs (F-IMPORT-008).

**Why it exists:** Inferred from behavior: lets you back-fill years of statements from your inbox without downloading them one by one, while you still choose what gets imported.

**Where to find it:** Automatic after **Start scan**. Progress shows on the dashboard scan card and the documents to approve in **Reports → Inbox imports**.

**Who can use it:** Every user who starts a scan.

**Steps:** Not applicable — automatic. Approve or reject documents in **Reports → Inbox imports** (D-MAIL-001).

**Controls:** None on B07 pages.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-MAIL-002 (the window).

**Results:** Each attachment becomes a discovered document with status DUPLICATE (same bytes already imported), NOT_FINANCIAL (classifier says not financial or confidence below 0.40) or PENDING_APPROVAL; approved ones move through IMPORTING to IMPORTED or PARSE_FAILED.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Scan stops early with the budget message stored on the job | Monthly AI budget reached | Wait for next month or ask the operator to raise the cap |
| Every document is pending with a note like "disabled: …" | AI classification unavailable; documents are kept for manual review | Review them by hand |

**Limitations:** Attachments whose file names contain unsubscribe, newsletter, promotion or deal(s) are ignored. Insurance scans (started from Insurance) are handled by the Insurance area, not imported.

**How it works:** Queue `gmail-scan`, concurrency 2, up to 3 attempts, 30-minute timeout. Query `(filename:pdf OR filename:xlsx OR filename:xls OR filename:csv) has:attachment after:<from> before:<until + 1 day>`, listed 500 ids per page. Phases: LISTING → DOWNLOADING → CLASSIFYING → COMPLETED (or FAILED/CANCELLED). Each attachment is stored encrypted with its SHA-256; classification uses the first 4 KB of extracted text, sender and subject. After classification, auto-approve rules (sender + document type) approve matching documents. Approval creates an import job with the document's content hash (so identical bytes reuse an existing job).

**Related features:** F-MAIL-003, F-IMPORT-008, F-IMPORT-009, D-MAIL-001, D-MAIL-002, D-MAIL-004.

**Sources:** `packages/api/src/jobs/gmailScanWorker.ts:35`, `packages/api/src/jobs/gmailScanWorker.ts:75`, `packages/api/src/jobs/gmailScanWorker.ts:188`, `packages/api/src/jobs/gmailScanWorker.ts:239`, `packages/api/src/jobs/gmailScanWorker.ts:268`, `packages/api/src/jobs/gmailScanWorker.ts:323`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:31`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:34`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:61`, `packages/api/src/lib/queue.ts:112`, `packages/api/src/services/gmail/gmailDocApproval.service.ts:59`, `packages/api/src/services/gmail/gmailDocApproval.service.ts:123`

### Gmail auto-connect banner <!-- F-MAIL-005 -->
**What it does:** A strip at the top of every app page: "Auto-import statements from your inbox. Connect <your email> — we'll fetch contract notes, CAS PDFs, and trade confirmations automatically. You approve each new sender once." with **Connect Gmail** and a dismiss button.

**Why it exists:** Inferred from behavior: prompts Gmail users to switch on automatic statement import.

**Where to find it:** Top of the app shell on any signed-in page.

**Who can use it:** Shown only when your sign-in email ends in @gmail.com or @googlemail.com, Gmail sign-in is configured on the server, you have no active Gmail connection, and you have not dismissed it on this browser.

**Steps**
1. Click **Connect Gmail** to start F-MAIL-001.
2. Or click the cross (tooltip "Dismiss") to hide it on this browser for good.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Disabled while starting |
| Cross (tooltip "Dismiss") | Button | Hides the banner on this browser | — |

**Fields and rules:** None.

**Settings and toggles here:** S-MAIL-001 **Dismiss** — stored on this browser only; other browsers still show the banner.

**Results:** Connect: as F-MAIL-001. Dismiss: banner hidden on this browser.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Google sign-in" | Server error | Try again |

**Limitations:** "You approve each new sender once" is not exactly what happens: attachments from any sender are imported when their file name looks like a statement (F-MAIL-006), and monitored senders start with auto-commit on. A paused (access-lost) account counts as "not connected", so the banner returns.

**How it works:** Reads `GET /api/auth/me`, `GET /api/mailboxes` and `GET /api/gmail/config` (each cached for 60 seconds); dismissal writes localStorage key `gmail-auto-connect-dismissed` = `1`.

**Related features:** F-MAIL-001, F-MAIL-006.

**Sources:** `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:11`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:45`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:51`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72`, `apps/web/src/components/layout/AppShell.tsx:97`

### Automatic Gmail attachment import <!-- F-MAIL-006 -->
**What it does:** On every mailbox poll (every 3 minutes by default), each active Gmail account is searched for emails with attachments from brokers, registrars and depositories or with statement-like subjects; matching attachments are saved and imported through the Import pipeline. You see them as new rows in **Import history**.

**Why it exists:** Code comments: CAS emails arrive 5–60 minutes after a request, and a 3-minute poll gives near-real-time auto-import.

**Where to find it:** Automatic. Results in **Tools → Import → Import history**.

**Who can use it:** Every user with an active Gmail connection.

**Steps:** Not applicable — automatic. Use **Scan inbox** (F-MAIL-007) to run it immediately.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-INGEST-001 — attachments from active monitored senders skip the file-name filter. Operator: `ENABLE_MAILBOX_POLLER`, `MAILBOX_POLL_INTERVAL_MIN`.

**Results:** New import jobs (target portfolio: default, else first). Each email message is imported at most once.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Account shows **Paused** and "Gmail access lost …" | Google rejected the grant | Reconnect with **Add another** |
| Account shows another last error | Search failed | It is retried on the next poll |
| An expected statement never arrives | File name did not match the patterns and the sender is not monitored, or it is a regulatory document | Add the sender as a monitored sender, or upload the file |

**Limitations:** Searches mail newer than 2 years, up to 500 messages per poll. Regulatory documents (retention statements, margin statements/pledges, client reporting, SEBI circulars, regulatory disclosures, annual reports, welcome kits, onboarding) are always skipped. Imports go to the default portfolio.

**How it works:** Query `has:attachment newer_than:2y (from:(cams OR camsonline OR kfintech OR karvy OR nsdl OR cdsl OR zerodha OR … OR dhan) OR subject:("contract note" OR "consolidated account" OR "CAS" OR "transaction statement" OR "trade confirmation" OR "account statement")) -in:trash`. Allowed extensions: .pdf, .csv, .tsv, .xlsx, .xls, .html, .htm. File names must match contract-note, trade-confirmation, CAS, transaction/holding-statement or spreadsheet patterns unless the sender is an active monitored sender (full address or `@domain` match here). A message already linked to an import job is skipped; identical bytes (SHA-256) are skipped. Each saved attachment becomes an import job with the inferred type and broker. A message that throws is recorded once as an unresolved failure (`gmail.attachment`) and resolved when a later poll succeeds. A per-account lock prevents the poller and a manual scan running together. The same poll first runs the monitored-sender email reader (F-INGEST-008). Accounts with provider IMAP (from the retired mailbox page) are polled for unread mail since the last poll (7 days on the first run).

**Related features:** F-MAIL-001, F-MAIL-007, F-IMPORT-008, F-IMPORT-009, F-INGEST-008.

**Sources:** `packages/api/src/ingestion/gmail/gmail.connector.ts:28`, `packages/api/src/ingestion/gmail/gmail.connector.ts:35`, `packages/api/src/ingestion/gmail/gmail.connector.ts:63`, `packages/api/src/ingestion/gmail/gmail.connector.ts:113`, `packages/api/src/ingestion/gmail/gmail.connector.ts:345`, `packages/api/src/ingestion/gmail/gmail.connector.ts:407`, `packages/api/src/ingestion/gmail/gmail.connector.ts:443`, `packages/api/src/jobs/mailboxPoller.ts:99`, `packages/api/src/jobs/mailboxPoller.ts:194`, `packages/api/src/jobs/mailboxPoller.ts:242`, `packages/api/src/config/env.ts:91`

### Scan inbox now <!-- F-MAIL-007 -->
**What it does:** Runs the Gmail attachment import (F-MAIL-006) immediately for every active Gmail account, without waiting for the next poll, and refreshes the import lists when it finishes.

**Why it exists:** Inferred from behavior: after requesting a CAS by email you can pull it in as soon as it arrives.

**Where to find it:** **Asset Classes → Mutual Funds**, button **Scan inbox** (the button belongs to the Mutual Funds page; the behaviour is shared app-wide).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with an active Gmail. R-MANAGER gets an error (account route).

**Steps**
1. Click **Scan inbox**. A toast says "Scanning Gmail — imports will appear when found".
2. When it finishes, import lists refresh; new files appear in **Import history**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan inbox** | Button | Starts the scan | Ignored while a scan is already running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** As F-MAIL-006.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No active Gmail account connected" | No Gmail, or access lost | Connect Gmail |

**Limitations:** Only attachments are imported; the email-text event reader (F-INGEST-008) is not triggered. If the poller is running for the same account at that moment, the manual run returns at once with nothing done.

**How it works:** The shell-wide scan context calls `POST /api/mailboxes/:id/poll` for each active Gmail account in parallel; for Gmail this runs `syncGmailAccount`.

**Related features:** F-MAIL-006, D-IMPORT-001.

**Sources:** `apps/web/src/context/ScanContext.tsx:22`, `apps/web/src/context/ScanContext.tsx:27`, `apps/web/src/context/ScanContext.tsx:35`, `apps/web/src/components/layout/AppShell.tsx:90`, `packages/api/src/controllers/mailboxes.controller.ts:120`, `packages/api/src/ingestion/gmail/gmail.connector.ts:348`

### What this area doesn't do
- You can't connect a non-Gmail mailbox (IMAP) from the app; existing IMAP connections still poll but cannot be managed.
- You can't pause a Gmail connection by hand; you can only disconnect it.
- You can't cancel or resume an inbox scan from the app, or view and delete auto-approve rules.
- You can't choose which Gmail account an inbox scan uses when several are connected.
