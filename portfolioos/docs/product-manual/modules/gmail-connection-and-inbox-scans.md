[Index](../INDEX.md)

# Gmail connection and inbox scans

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Connecting a Gmail account (Google sign-in, no password stored) powers three separate things: the email-text events of [Email ingestion](#email-ingestion); a regular *attachment import* that picks up contract notes, CAS PDFs and statements from your inbox and sends them to [Import](#import); and an on-demand *inbox scan* that looks through a date range of mail for financial attachments for you to approve. The review screen for inbox-scan documents is **Reports → Inbox imports** (documented in the Reports chapter).

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-MAIL-001](../features/F-MAIL-001.md) | Connect Gmail | Live | Sends you to Google to choose an account and grant access, then stores an encrypted access grant for that mailbox. |
| [F-MAIL-002](../features/F-MAIL-002.md) | Email accounts and disconnect | Live | The Email accounts card lists each connected Gmail with "Last checked <date time>" or "Not polled yet", any last error, Active or Paused, … |
| [F-MAIL-003](../features/F-MAIL-003.md) | Choose how far back to scan | Live | Starts a one-off *inbox scan* of your most recently connected active Gmail for every PDF, XLSX, XLS or CSV attachment between two dates, … |
| [F-MAIL-004](../features/F-MAIL-004.md) | Inbox scan processing | Live | Works through a scan job: lists matching emails, downloads each attachment, marks attachments already imported as duplicates, asks an AI … |
| [F-MAIL-005](../features/F-MAIL-005.md) | Gmail auto-connect banner | Live | A strip at the top of every app page: "Auto-import statements from your inbox. |
| [F-MAIL-006](../features/F-MAIL-006.md) | Automatic Gmail attachment import | Live | On every mailbox poll (every 3 minutes by default), each active Gmail account is searched for emails with attachments from brokers, … |
| [F-MAIL-007](../features/F-MAIL-007.md) | Scan inbox now | Live | Runs the Gmail attachment import (F-MAIL-006) immediately for every active Gmail account, without waiting for the next poll, and refreshes … |

Settings for this module: [settings/gmail-connection-and-inbox-scans.md](../settings/gmail-connection-and-inbox-scans.md)

### What this area doesn't do
- You can't connect a non-Gmail mailbox (IMAP) from the app; existing IMAP connections still poll but cannot be managed.
- You can't pause a Gmail connection by hand; you can only disconnect it.
- You can't cancel or resume an inbox scan from the app, or view and delete auto-approve rules.
- You can't choose which Gmail account an inbox scan uses when several are connected.
