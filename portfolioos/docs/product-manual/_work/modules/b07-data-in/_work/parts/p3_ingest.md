
## Email ingestion

**Email ingestion** (sidebar **Inbox → Connect your Gmail**, route `/ingestion`) reads the *text* of emails from banks, brokers and insurers you choose ("monitored senders") and turns each transaction alert into an *event* — a buy, sell, dividend, UPI credit, card spend and so on. Events wait in **Pending review** until you approve them; approving writes a transaction or a cash-flow entry. A sender you trust can be set to *auto-commit*, so its events are written without review. The page is laid out in three numbered steps: 1 connect your email, 2 choose senders, 3 review events. Email *attachments* (statements, contract notes) are handled separately by the Gmail attachment import (F-MAIL-006) and the Import pipeline.

### Email ingestion page and status strip <!-- F-INGEST-001 -->
**What it does:** Shows the page "Email ingestion" with a status strip — **Gmail connected** / **Connect Gmail**, "<n> sender(s)" / **Add senders**, and once both exist "<n> event(s) to review" / **Inbox clear** — then the three steps: **Connect your email** (or **Email accounts**), **Senders to monitor** and **Pending review**.

**Why it exists:** The header says: "Automatically capture transactions from your bank, broker, and insurer emails. Everything is reviewable before it lands in your records." A code comment describes it as one screen that walks you through connect → pick senders → review.

**Where to find it:** **Inbox → Connect your Gmail** (route `/ingestion`). Old addresses `/mailboxes`, `/ingestion/review` and `/ingestion/discovery` redirect here.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER: the email-account parts fail with "Switch back to your own account to do this." because Gmail is an account-level connection.

**Steps**
1. Open **Inbox → Connect your Gmail**.
2. Read the status strip to see which step is next.
3. Click **Refresh** (top right) to reload accounts, senders and events.
4. Click **Sender settings** to open the full sender list (F-INGEST-006).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Reloads email accounts, senders and events | Never |
| Status chips | Display | Progress through the three steps | The review chip is hidden until Gmail and at least one sender exist |
| **Sender settings** | Link | Opens `/ingestion/senders` | Never |
| Step 2 placeholder "Senders to monitor" — "Available once Gmail is connected …" | Display | Keeps the numbering while Gmail is not connected | Hidden once a Gmail account exists |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this part of the page.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Switch back to your own account to do this." | You are managing a family member's account | Click **Back to my account** |

**Limitations:** The page header promises everything is reviewable, but senders added from this page or the senders page start with auto-commit switched on, so their confident events are written without review (see F-INGEST-006 and DOCUMENTATION_GAPS.md).

**How it works:** The page loads `GET /api/mailboxes` (only accounts with provider GMAIL_OAUTH are shown), `GET /api/monitored-senders`, and `GET /api/canonical-events?status=PARSED&limit=200` plus `?status=PENDING_REVIEW&limit=200`. The pending count is the size of those two lists combined.

**Related features:** F-MAIL-001, F-MAIL-002, F-INGEST-002, F-INGEST-004, F-INGEST-006, F-INGEST-007.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:62`, `apps/web/src/pages/ingestion/IngestionPage.tsx:168`, `apps/web/src/pages/ingestion/IngestionPage.tsx:259`, `apps/web/src/pages/ingestion/IngestionPage.tsx:320`, `apps/web/src/App.tsx:268`, `apps/web/src/App.tsx:275`, `packages/api/src/services/family/managedProfile.service.ts:45`

### Discover financial senders <!-- F-INGEST-002 -->
**What it does:** Scans a connected Gmail inbox for senders that look financial, scores them, and lists the ones you do not monitor yet; you tick the ones to watch and add them in one click.

**Why it exists:** The card explains: "Only addresses on this list are fetched. Scan your inbox for financial senders, then pick the ones you want us to watch." It saves you from finding each bank's alert address yourself.

**Where to find it:** **Inbox → Connect your Gmail**, step **2 Senders to monitor**, one box per connected Gmail account.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a connected Gmail. Not available to R-MANAGER.

**Steps**
1. Click **Scan inbox** on the account's box. The button shows "Scanning…". When done, a toast says "Found <n> financial sender(s)" or "Scan complete — no financial senders found".
2. Review the table: **Sender** (name and address), **Match** (a known institution name, or "Unknown — review manually"), **Score**, **Mail** (messages seen).
3. Tick the senders to watch (click a row or its checkbox; the header checkbox selects all).
4. Click **Add <n> senders**. A toast says "Added <n> sender(s)" (and "· <m> failed" if some failed).
5. Click **Re-scan** to scan again later.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan inbox** / **Re-scan** | Button | Runs the discovery scan | Disabled while scanning |
| "· <n> new candidate(s)" | Display | Count of results not yet monitored | Shown after a scan |
| **Select all** (header checkbox) | Checkbox | Selects all candidates | Shown when there are candidates |
| Row checkbox / row click | Toggle | Selects a sender | — |
| **Add <n> senders** | Button | Adds the selected senders | Disabled when nothing is selected or while adding |

**Fields and rules:** Not applicable — selection only.

**Settings and toggles here:** Adding a sender creates it with S-INGEST-001 (Active) on, S-INGEST-002 (Auto-commit) on and S-INGEST-003 threshold 5; its display label is the matched institution's suggested label or the sender's display name.

**Results:** Each added address becomes a monitored sender. From the next poll, emails from it are read and turned into events (F-INGEST-008).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No financial senders detected in this inbox." | Nothing scored at least 3 | Add a sender manually (F-INGEST-006) |
| "Every detected sender is already on your monitor list." | All results are already monitored | Nothing to do |
| "Scan failed" / "Gmail account not found" | Gmail access lost or account removed | Reconnect Gmail (F-MAIL-001) |
| "All <n> add operations failed" / "Sender <address> is already monitored" | Sender exists already | Nothing to do |

**Limitations:** The scan looks at up to 1,000 messages from the last 730 days (2 years). Senders are added with auto-commit already on. Known-institution matching is by exact address only.

**How it works:** `GET /api/gmail/:id/discover` searches the inbox with `newer_than:730d -in:trash -in:spam` plus a financial keyword query, reads each message's sender, subject and snippet, and scores each sender: 2 × keyword score of each subject + keyword score of each snippet; senders scoring below 3 are dropped. Results are sorted by score, then by message count, and matched against built-in institution seeds. The text on the card says scoring uses subject keywords; the code also scores message snippets. Adding calls `POST /api/monitored-senders` once per selected sender.

**Related features:** F-INGEST-003, F-INGEST-006, F-INGEST-008, F-MAIL-001.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:495`, `apps/web/src/pages/ingestion/IngestionPage.tsx:556`, `apps/web/src/pages/ingestion/IngestionPage.tsx:570`, `apps/web/src/pages/ingestion/IngestionPage.tsx:652`, `apps/web/src/pages/ingestion/IngestionPage.tsx:658`, `apps/web/src/pages/ingestion/IngestionPage.tsx:781`, `packages/api/src/controllers/gmail.controller.ts:75`, `packages/api/src/ingestion/gmail/discovery.ts:239`, `packages/api/src/ingestion/gmail/discovery.ts:251`, `packages/api/src/ingestion/gmail/keywords.ts:36`, `packages/api/src/ingestion/gmail/keywords.ts:153`

### Currently monitored senders (on the ingestion page) <!-- F-INGEST-003 -->
**What it does:** Lists your monitored senders under "Currently monitored (<n>)" with their label, address, an **Auto** badge when auto-commit is on, and **Active**/**Paused**, with a remove button for each.

**Why it exists:** Inferred from behavior: lets you see and prune the allow-list without leaving the setup page.

**Where to find it:** **Inbox → Connect your Gmail**, step **2 Senders to monitor**, below the scan boxes.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with Gmail connected.

**Steps**
1. Find the sender in the list.
2. Click the bin icon (tooltip "Remove sender") and confirm "Remove <address>?". The toast "Sender removed" appears.
3. Click **Auto-commit settings** to open the full senders page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Auto-commit settings** | Link | Opens `/ingestion/senders` | Never |
| Bin icon | Button | Removes the sender after confirmation | Disabled while removing |
| **Auto** badge, **Active**/**Paused** | Display | Current settings | — |

**Fields and rules:** None.

**Settings and toggles here:** Shows S-INGEST-001 and S-INGEST-002; change them on the senders page.

**Results:** Removing stops future fetching from that address. Past events stay.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No senders yet. Scan above, or add manually from the settings page." | Empty list | Scan or add a sender |
| "Could not remove sender" | Server error | Try again |

**Limitations:** The whole step is hidden until a Gmail account is connected.

**How it works:** `DELETE /api/monitored-senders/:id` deletes the row after checking ownership; events from that sender are not deleted.

**Related features:** F-INGEST-002, F-INGEST-006.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:514`, `apps/web/src/pages/ingestion/IngestionPage.tsx:798`, `apps/web/src/pages/ingestion/IngestionPage.tsx:840`, `packages/api/src/services/gmail/monitoredSenders.service.ts:137`

### Pending review queue <!-- F-INGEST-004 -->
**What it does:** Lists events read from your monitored senders that are waiting for you, grouped by sender. You approve (write it to your records) or reject each one, approve all events of a sender at once, or open an event to see every extracted detail.

**Why it exists:** The card says: "Events parsed from your monitored senders, waiting for your approval before they land as transactions."

**Where to find it:** **Inbox → Connect your Gmail**, step **3 Pending review**. The same queue is the **Pending review** tab of **See committed / rejected** (F-INGEST-007).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER can act on the managed person's events but that person has no Gmail connection, so the list is normally empty.

**Steps**
1. Read each row: date, event type (for example **UPI_CREDIT**), counterparty or instrument, the parser's note, and amount in ₹.
2. Click the tick to approve. The toast says "Event approved and committed", or "Approval rolled back — projection failed: <reason>" if the event could not be written.
3. Click the cross to reject. The toast says "Event rejected".
4. To approve every event of a sender with more than one waiting, click **Approve all** in its group header. The toast says "Bulk approved: <a> succeeded, <f> failed of <n>".
5. Click a row to open "Event details". There you can type an optional **Rejection reason** and click **Reject**, or click **Approve & commit**. Gmail events have a **View original in Gmail** link.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tick icon | Button | Approve and commit the event | Disabled while that event is being approved |
| Cross icon | Button | Reject the event | Disabled while that event is being rejected |
| **Approve all** | Button | Approve all waiting events of that sender | Shown only for a known sender with 2+ events; disabled during a bulk approve |
| Row | Click | Opens "Event details" | — |
| **Rejection reason (optional)** | Text | Reason stored with the rejection | Shown only for events still waiting |
| **Reject** / **Approve & commit** | Buttons | As above | Disabled while an action runs; shown only for waiting events |
| **View original in Gmail** | Link | Opens the email in Gmail (account /u/0) in a new tab | Shown only for Gmail events |
| **See committed / rejected** | Link | Opens `/ingestion/history` | Never |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Rejection reason | Text | No | Up to 500 characters (server) | Empty | "Validation failed" when longer |

**Settings and toggles here:** S-INGEST-002 decides which events skip this queue.

**Results:** Approve: the event becomes CONFIRMED, the sender's approved count goes up by one, and the event is written (F-INGEST-009); on success it becomes PROJECTED and leaves the queue. Reject: the event becomes REJECTED with your reason and moves to the history's **Rejected / failed** tab.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Inbox is clear" — "Nothing waiting for review. New emails from your monitored senders will show up here (poller runs every 10 minutes)." | Nothing waiting | None (the default poll interval is actually 3 minutes) |
| "Connect Gmail to start receiving events" / "Add at least one sender to start receiving events" | Setup incomplete | Complete steps 1 and 2 |
| "Approval rolled back — projection failed: BUY requires amount and quantity to project" (or SELL) | The trade has no amount or quantity | Reject it and add the trade by hand |
| "Approval rolled back — projection failed: User has no portfolio to project this event into" | No portfolio | Create a portfolio, then approve again |
| "Canonical event in status <STATUS> cannot be approved" | Already handled (for example in another tab) | Click **Refresh** |

**Limitations:** Events cannot be edited before approval in the app (the edit API exists but has no screen). "View original in Gmail" opens the first Gmail account signed in on your browser (`/u/0`), which may not be the connected one. Each status list loads at most 200 events. The rejection reason box keeps its text when you open another event.

**How it works:** Approve calls `POST /api/canonical-events/:id/approve`: only PARSED or PENDING_REVIEW events are accepted; in one database transaction the event becomes CONFIRMED and the matching sender's `confirmedEventCount` is incremented; projection then runs outside the transaction; if projection fails the event goes back to its previous status (the sender count stays incremented). Reject calls `POST /api/canonical-events/:id/reject` with an optional reason (max 500). **Approve all** calls `POST /api/canonical-events/bulk-approve` with the sender address (must be a valid email) and approves every PARSED/PENDING_REVIEW event of that sender one by one. The list sorts by event date, then creation time, newest first.

**Related features:** F-INGEST-005, F-INGEST-007, F-INGEST-008, F-INGEST-009.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:110`, `apps/web/src/pages/ingestion/IngestionPage.tsx:137`, `apps/web/src/pages/ingestion/IngestionPage.tsx:902`, `apps/web/src/pages/ingestion/IngestionPage.tsx:967`, `apps/web/src/pages/ingestion/IngestionPage.tsx:988`, `apps/web/src/pages/ingestion/IngestionPage.tsx:1128`, `apps/web/src/pages/ingestion/IngestionPage.tsx:1163`, `packages/api/src/controllers/canonicalEvents.controller.ts:48`, `packages/api/src/controllers/canonicalEvents.controller.ts:52`, `packages/api/src/services/imports/canonicalEvents.service.ts:50`, `packages/api/src/services/imports/canonicalEvents.service.ts:178`, `packages/api/src/services/imports/canonicalEvents.service.ts:239`, `packages/api/src/services/imports/canonicalEvents.service.ts:275`, `packages/api/src/config/env.ts:91`

### Auto-commit offer <!-- F-INGEST-005 -->
**What it does:** When a sender without auto-commit reaches its approval threshold (default 5 approved events), a banner offers to trust it: "<sender> has <n> confirmed events. Trust it and skip review next time?" with **Enable auto-commit**. On the history page, the approval that crosses the threshold also shows a toast "<address> is reliable. Enable auto-commit on the Senders page." with **Go**.

**Why it exists:** Inferred from behavior and code comments: let a sender earn trust through manual approvals before its events skip review.

**Where to find it:** **Inbox → Connect your Gmail**, top of step **3 Pending review**; and the **Pending review** tab of `/ingestion/history`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. When the banner appears, click **Enable auto-commit**. The toast "Auto-commit enabled" appears and the banner disappears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enable auto-commit** | Button | Turns on auto-commit for that sender | Disabled while saving; banner shown only for active senders with auto-commit off and approved count ≥ threshold |
| **Go** (toast) | Button | Opens the senders page | Toast lasts 10 seconds |

**Fields and rules:** None.

**Settings and toggles here:** S-INGEST-002 **Auto-commit** (turned on here) and S-INGEST-003 (the threshold).

**Results:** Future confident events from that sender are written without review.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve <n> more event(s) from this sender before enabling auto-commit." | Threshold not reached | Approve more events first |
| "Could not enable auto-commit" | Other error | Try again |

**Limitations:** Because new senders start with auto-commit on, the banner appears only for senders whose auto-commit you turned off.

**How it works:** `PATCH /api/monitored-senders/:id` with `{ autoCommitEnabled: true }`; the server refuses when `confirmedEventCount < autoCommitAfter`.

**Related features:** F-INGEST-004, F-INGEST-006, F-INGEST-007.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:98`, `apps/web/src/pages/ingestion/IngestionPage.tsx:930`, `apps/web/src/pages/ingestion/ReviewPage.tsx:149`, `apps/web/src/pages/ingestion/ReviewPage.tsx:216`, `packages/api/src/controllers/monitoredSenders.controller.ts:54`

### Monitored senders page <!-- F-INGEST-006 -->
**What it does:** The page "Monitored senders" lists every sender with its approval progress and lets you add a sender by hand, switch auto-commit, pause or resume polling, and delete it.

**Why it exists:** The header says: "The email addresses we scan for financial events. Only senders listed here are polled — everything else is ignored."

**Where to find it:** **Inbox → Connect your Gmail → Sender settings** (or **Auto-commit settings**), route `/ingestion/senders`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. To add a sender, fill **Email address** (a full address or `@domain.com`), optionally **Display label (optional)** and **Auto-commit after N confirmed events**, then click **Add sender**. The toast "Sender added" appears.
2. In **Configured senders**, each row shows label, **Active**/**Paused**, an **Auto-commit** badge when on, the address, "<approved> / <threshold> approved", and "last fetched <date time>" or "never fetched", with a progress bar.
3. Click the lightning icon to switch auto-commit on or off.
4. Click the power icon to pause or resume polling.
5. Click the bin icon and confirm "Remove <address>? This won't delete past events." to delete.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Email address** | Text | Sender to add; placeholder "alerts@hdfcbank.net or @hdfcbank.net" | — |
| **Display label (optional)** | Text | Friendly name; placeholder "HDFC Bank alerts" | — |
| **Auto-commit after N confirmed events** | Number | Threshold for the auto-commit offer | — |
| **Add sender** | Button | Creates the sender | Disabled when the address is empty or while saving |
| Lightning icon (tooltip "Disable auto-commit", "Enable auto-commit" or "Approve <n> more to enable") | Button | Toggles auto-commit | Disabled while saving |
| Power icon (tooltip "Pause polling" / "Resume polling") | Button | Toggles active | Disabled while saving |
| Bin icon | Button | Deletes the sender after confirmation | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email address | Text | Yes | A full email address or the `@domain` form, stored in lower case | Empty | "Invalid sender address \"<value>\". Expected \"user@host\" or \"@host\"."; "Sender <address> is already monitored" |
| Display label | Text | No | Up to 120 characters | Empty | "Validation failed" |
| Auto-commit after N confirmed events | Number | No | Whole number 1–100 | 5 | "Validation failed" |

**Settings and toggles here:** S-INGEST-001 **Active** (power icon) — on: the sender's emails are fetched each poll; off ("Paused"): ignored. S-INGEST-002 **Auto-commit** (lightning) — on: confident events (confidence 0.70 or more, all figures found in the email) are written without review; off: every event waits in **Pending review**; it starts **on** for every new sender. S-INGEST-003 **Auto-commit after N confirmed events** — how many approvals are needed before auto-commit can be switched back on. S-INGEST-004 **Display label** — name shown instead of the address.

**Results:** Changes apply from the next poll. Deleting stops fetching and keeps past events.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve <n> more event(s) from this sender before enabling auto-commit." | Turning auto-commit back on before the threshold | Approve more events |
| "Could not add sender" / "Update failed" / "Could not remove sender" | Server error | Try again |
| A sender shows an empty name | Added with the label box left as an empty string | Delete and re-add, or type a label |
| `@domain` sender never produces events | Domain-form senders are fetched but never matched to emails (confirmed defect) | Add the full alert address instead |

**Limitations:** A sender's address cannot be edited (delete and re-add). The page has no way to edit the display label or threshold after creation. A sender added in `@domain.com` form is included in the Gmail search but its emails are never matched back to it, so they are never parsed (logged in DOCUMENTATION_GAPS.md). Pausing a sender also stops its emails being used to relax the attachment-name filter (F-MAIL-006).

**How it works:** `POST /api/monitored-senders` (address, displayLabel, autoCommitAfter 1–100) normalises the address, refuses duplicates per user, fills a missing label from the institution seed, and creates the sender with `autoCommitEnabled = true` unless the caller says otherwise (this page never says otherwise). `PATCH /api/monitored-senders/:id` updates `isActive`, `autoCommitEnabled`, `displayLabel` or `autoCommitAfter`; turning auto-commit on is refused below the threshold. The list is ordered active first, then by address.

**Related features:** F-INGEST-002, F-INGEST-003, F-INGEST-005, F-INGEST-008, F-MAIL-006.

**Sources:** `apps/web/src/pages/ingestion/SendersPage.tsx:20`, `apps/web/src/pages/ingestion/SendersPage.tsx:70`, `apps/web/src/pages/ingestion/SendersPage.tsx:88`, `apps/web/src/pages/ingestion/SendersPage.tsx:131`, `apps/web/src/pages/ingestion/SendersPage.tsx:171`, `apps/web/src/pages/ingestion/SendersPage.tsx:253`, `apps/web/src/pages/ingestion/SendersPage.tsx:274`, `packages/api/src/controllers/monitoredSenders.controller.ts:13`, `packages/api/src/services/gmail/monitoredSenders.service.ts:39`, `packages/api/src/services/gmail/monitoredSenders.service.ts:99`, `packages/api/src/ingestion/gmail/poller.ts:165`

### Ingestion history (Review ingestion) <!-- F-INGEST-007 -->
**What it does:** The page "Review ingestion" shows events in three tabs: **Pending review** (same actions as F-INGEST-004), **Auto-committed** (every event that has been written, with a status badge) and **Rejected / failed** (rejected, failed and over-budget archived events).

**Why it exists:** The header says: "Canonical events extracted from your email. Approve to commit them to transactions; reject to drop them."

**Where to find it:** **Inbox → Connect your Gmail → See committed / rejected** (route `/ingestion/history`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a tab: **Pending review**, **Auto-committed** or **Rejected / failed**.
2. Click a row to open "Canonical event" with all details, parser notes and any rejection reason.
3. On **Pending review**, approve, reject or **Approve all** as in F-INGEST-004.
4. Click **Refresh** to reload.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Pending review** / **Auto-committed** / **Rejected / failed** | Tabs | Switch the list | — |
| **Refresh** | Button | Reloads events | Never |
| Tick / cross / **Approve all** / **Approve & commit** / **Reject** | Buttons | As in F-INGEST-004 | Only on **Pending review** |
| Status badge | Display | Event status on the other tabs | — |
| **Enable auto-commit** banner | Button | As in F-INGEST-005 | Only on **Pending review** |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Rejection reason | Text | No | Up to 500 characters | Empty | "Validation failed" |

**Settings and toggles here:** S-INGEST-002 (via the banner).

**Results:** Same as F-INGEST-004 for actions; otherwise read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing auto-committed yet" | No written events | — |
| "No rejected or failed events" — "Nothing to see — clean history." | None | — |

**Limitations:** **Auto-committed** lists every written event, including ones you approved by hand. Each status shows at most 200 events. CONFIRMED events (approved but not yet written) are not shown on any tab. There is no search, filter or date range.

**How it works:** One `GET /api/canonical-events?status=…&limit=200` request per status in the tab (PARSED + PENDING_REVIEW; PROJECTED; REJECTED + FAILED + ARCHIVED), merged and sorted by event date then creation time, newest first. Requests run only for the open tab.

**Related features:** F-INGEST-004, F-INGEST-005, F-INGEST-008.

**Sources:** `apps/web/src/pages/ingestion/ReviewPage.tsx:35`, `apps/web/src/pages/ingestion/ReviewPage.tsx:41`, `apps/web/src/pages/ingestion/ReviewPage.tsx:227`, `apps/web/src/pages/ingestion/ReviewPage.tsx:273`, `apps/web/src/pages/ingestion/ReviewPage.tsx:298`, `packages/api/src/services/imports/canonicalEvents.service.ts:61`

### How emails become events <!-- F-INGEST-008 -->
**What it does:** On every mailbox poll, for each connected Gmail account, the app searches for new emails from your active monitored senders, reads each email's text, extracts financial events with an AI model (or a learned template), and stores them as events — waiting for review, or written straight away for auto-commit senders.

**Why it exists:** Code comments describe the design goals: never duplicate on re-polls, never send personal identifiers to the AI, stop at a monthly AI budget, and keep every failure for review.

**Where to find it:** Automatic. Results appear in **Inbox → Connect your Gmail → Pending review** and `/ingestion/history`.

**Who can use it:** Runs for every user with a connected, active Gmail account and at least one active monitored sender.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-INGEST-001 (which senders are searched), S-INGEST-002 (review or auto-commit). Operator switches `ENABLE_MAILBOX_POLLER`, `MAILBOX_POLL_INTERVAL_MIN`, `ENABLE_LLM_PARSER`, `ANTHROPIC_API_KEY`, `LLM_MODEL` and the AI budget settings decide whether and how often it runs.

**Results:** New events appear; auto-committed ones also create transactions or cash-flow entries (F-INGEST-009).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No events ever appear although senders are set | The AI parser is switched off on the server (default in production), or the sender is in `@domain` form | Ask the operator; add full addresses |
| Events land in **Rejected / failed** as archived | Monthly AI budget reached | They wait; new budget next month |
| Event note ends "Held for review — …" | A figure the AI read is not in the email | Check before approving |

**Limitations:** Each poll looks at up to 500 matching emails per account. A sender never fetched before is searched back 730 days. Archived over-budget events are not re-parsed automatically. When the AI parser is off, every email becomes a hidden failure record and nothing reaches the review queue.

**How it works:**
1. *Search.* Query `(from:<a> OR from:<b> …) after:<YYYY/MM/DD> -in:trash -in:spam` over active senders, from the oldest sender's last fetch (or 730 days back); paged 100 at a time, capped at 500 message ids. Each message's From address must equal a monitored address exactly (lower case); others are counted as unmatched and skipped. After the tick every active sender's `lastFetchedAt` is set to the tick's start time.
2. *Idempotency.* A message whose fingerprint (`gmail:<messageId>` hashed) already produced events is skipped.
3. *AI gate.* In production both `ENABLE_LLM_PARSER=true` and `ANTHROPIC_API_KEY` are required (outside production only the key). Gate closed → one ingestion-failure record "llm_gate_closed: …" and stop.
4. *Template.* If a learned extraction recipe exists for this sender and email layout (promoted after 10 agreeing AI samples), it is applied without calling the AI; two consecutive misses deactivate it.
5. *AI call.* The email text is redacted (PAN, Aadhaar, account numbers, phone, OTP/CVV) and sent to Claude (default model `claude-haiku-4-5-20251001`). Budget: default warning ₹500 and cap ₹1,000 per user per calendar month (AppSetting `llm.monthly_warn_inr`, `llm.monthly_cap_inr`, per-user overrides); cost estimated at USD 1/5 per million input/output tokens and ₹90/USD unless overridden. At the cap the email is stored as an ARCHIVED event with the redacted body.
6. *Persist.* One event per extracted item; status PARSED for auto-commit senders when every figure (amount, quantity, price, ISIN, date) is found in the email, otherwise PENDING_REVIEW with the note "Held for review — …".
7. *Auto-commit.* For auto-commit senders each PARSED event with confidence ≥ 0.70 is confirmed and written immediately; lower confidence or a failed write moves it to PENDING_REVIEW.

**Related features:** F-INGEST-004, F-INGEST-006, F-INGEST-009, F-MAIL-006, F-IMPORT-011.

**Sources:** `packages/api/src/jobs/mailboxPoller.ts:213`, `packages/api/src/ingestion/gmail/poller.ts:41`, `packages/api/src/ingestion/gmail/poller.ts:50`, `packages/api/src/ingestion/gmail/poller.ts:127`, `packages/api/src/ingestion/gmail/poller.ts:165`, `packages/api/src/ingestion/gmail/pipeline.ts:171`, `packages/api/src/ingestion/gmail/pipeline.ts:257`, `packages/api/src/ingestion/gmail/pipeline.ts:274`, `packages/api/src/ingestion/gmail/pipeline.ts:522`, `packages/api/src/ingestion/llm/client.ts:182`, `packages/api/src/ingestion/llm/client.ts:243`, `packages/api/src/ingestion/llm/budget.ts:21`, `packages/api/src/ingestion/llm/budget.ts:107`, `packages/api/src/ingestion/templates.ts:53`, `packages/api/src/config/env.ts:102`

### What approving an event creates <!-- F-INGEST-009 -->
**What it does:** Turns a confirmed event into a record in your books: buys and sells become transactions; money in and money out become cash-flow entries; some types are only marked as handled.

**Why it exists:** Code comments: approved events must update holdings and dashboards through the normal derived records, with the event kept as the audit trail.

**Where to find it:** Automatic on approval or auto-commit. Results appear in **Overview → Transactions** and **Overview → Cash Activity**.

**Who can use it:** Every user approving events.

**Steps:** Not applicable — runs when you approve (F-INGEST-004) or on auto-commit.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results by event type:**
- **BUY**, **SELL** → a transaction (asset class Mutual Fund when the ISIN starts with "INF", otherwise Equity); if the same trade already exists from a contract note or CAS, the event is linked to it and nothing new is written. **FNO_TRADE** → an F&O transaction.
- **DIVIDEND**, **INTEREST_CREDIT**, **MATURITY_CREDIT**, **UPI_CREDIT**, **NEFT_CREDIT** → cash-flow inflow.
- **INTEREST_DEBIT**, **EMI_DEBIT**, **CARD_PURCHASE**, **CARD_PAYMENT**, **UPI_DEBIT**, **NEFT_DEBIT** → cash-flow outflow.
- **PREMIUM_PAID** → cash-flow outflow, then an attempt to link it to a matching insurance policy.
- **RENT_RECEIVED**, **RENT_PAID**, **VEHICLE_CHALLAN**, **FD_CREATION**, **FD_MATURITY**, **SIP_INSTALLMENT**, **VALUATION_SNAPSHOT**, provident-fund types, F&O lifecycle types and **OTHER** → marked handled with no record written.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "… requires amount and quantity to project" / "… requires amount to project" | Missing figures | Reject and enter by hand |
| "User has no portfolio to project this event into" | No portfolio | Create one |
| "FNO_TRADE requires underlying, instrument_type, expiry_date, side" | Incomplete F&O event | Enter the trade by hand |

**Limitations:** An approved SIP instalment, FD, rent or challan email creates no transaction or cash-flow entry. Bonds, FDs and other classes are never created from emails. Rows go to the event's portfolio, else your default, else your first portfolio.

**How it works:** Projection accepts only CONFIRMED events (already PROJECTED → no-op). The domain row, the status flip to PROJECTED and the back-reference are written in one database transaction; holdings for the asset are recomputed afterwards.

**Related features:** F-INGEST-004, F-INGEST-008, D-INGEST-001, D-INGEST-002, D-IMPORT-006.

**Sources:** `packages/api/src/ingestion/projection.ts:100`, `packages/api/src/ingestion/projection.ts:145`, `packages/api/src/ingestion/projection.ts:154`, `packages/api/src/ingestion/projection.ts:463`, `packages/api/src/ingestion/projection.ts:485`, `packages/api/src/ingestion/projection.ts:503`, `packages/api/src/ingestion/projection.ts:510`, `packages/api/src/ingestion/projection.ts:537`

### What this area doesn't do
- You can't edit an event's amount, date or type before approving it.
- You can't connect Outlook, Yahoo or other IMAP mailboxes from the app (the old mailbox page is no longer reachable).
- You can't see the monthly AI spend (the gauge is hidden).
- You can't re-parse archived over-budget emails from the app.
- You can't choose which portfolio an email event goes into.
