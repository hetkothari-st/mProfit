[Index](../INDEX.md)

# Email ingestion

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

**Email ingestion** (sidebar **Inbox → Connect your Gmail**, route `/ingestion`) reads the *text* of emails from banks, brokers and insurers you choose ("monitored senders") and turns each transaction alert into an *event* — a buy, sell, dividend, UPI credit, card spend and so on. Events wait in **Pending review** until you approve them; approving writes a transaction or a cash-flow entry. A sender you trust can be set to *auto-commit*, so its events are written without review. The page is laid out in three numbered steps: 1 connect your email, 2 choose senders, 3 review events. Email *attachments* (statements, contract notes) are handled separately by the Gmail attachment import ([F-MAIL-006](../features/F-MAIL-006.md)) and the Import pipeline.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INGEST-001](../features/F-INGEST-001.md) | Email ingestion page and status strip | Live | Shows the page "Email ingestion" with a status strip — Gmail connected / Connect Gmail, "<n> sender(s)" / Add senders, and once both exist … |
| [F-INGEST-002](../features/F-INGEST-002.md) | Discover financial senders | Live | Scans a connected Gmail inbox for senders that look financial, scores them, and lists the ones you do not monitor yet; you tick the ones to … |
| [F-INGEST-003](../features/F-INGEST-003.md) | Currently monitored senders (on the ingestion page) | Live | Lists your monitored senders under "Currently monitored (<n>)" with their label, address, an Auto badge when auto-commit is on, and … |
| [F-INGEST-004](../features/F-INGEST-004.md) | Pending review queue | Live | Lists events read from your monitored senders that are waiting for you, grouped by sender. |
| [F-INGEST-005](../features/F-INGEST-005.md) | Auto-commit offer | Live | When a sender without auto-commit reaches its approval threshold (default 5 approved events), a banner offers to trust it: "<sender> has … |
| [F-INGEST-006](../features/F-INGEST-006.md) | Monitored senders page | Live | The page "Monitored senders" lists every sender with its approval progress and lets you add a sender by hand, switch auto-commit, pause or … |
| [F-INGEST-007](../features/F-INGEST-007.md) | Ingestion history (Review ingestion) | Live | The page "Review ingestion" shows events in three tabs: Pending review (same actions as F-INGEST-004), Auto-committed (every event that has … |
| [F-INGEST-008](../features/F-INGEST-008.md) | How emails become events | Live | On every mailbox poll, for each connected Gmail account, the app searches for new emails from your active monitored senders, reads each … |
| [F-INGEST-009](../features/F-INGEST-009.md) | What approving an event creates | Live | Turns a confirmed event into a record in your books: buys and sells become transactions; money in and money out become cash-flow entries; … |

Settings for this module: [settings/email-ingestion.md](../settings/email-ingestion.md)

### What this area doesn't do
- You can't edit an event's amount, date or type before approving it.
- You can't connect Outlook, Yahoo or other IMAP mailboxes from the app (the old mailbox page is no longer reachable).
- You can't see the monthly AI spend (the gauge is hidden).
- You can't re-parse archived over-budget emails from the app.
- You can't choose which portfolio an email event goes into.
