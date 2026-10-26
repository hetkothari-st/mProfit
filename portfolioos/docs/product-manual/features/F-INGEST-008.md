---
id: F-INGEST-008
title: "How emails become events"
module: "Email ingestion"
status: Live
roles: "Users with Gmail + senders"
settings: [S-INGEST-001, S-INGEST-002]
related: [F-IMPORT-011, F-INGEST-004, F-INGEST-006, F-INGEST-009, F-MAIL-006]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# How emails become events

`F-INGEST-008` · Live · Roles: Users with Gmail + senders

**What it does:** On every mailbox poll, for each connected Gmail account, the app searches for new emails from your active monitored senders, reads each email's text, extracts financial events with an AI model (or a learned template), and stores them as events — waiting for review, or written straight away for auto-commit senders.

**Why it exists:** Code comments describe the design goals: never duplicate on re-polls, never send personal identifiers to the AI, stop at a monthly AI budget, and keep every failure for review.

**Where to find it:** Automatic. Results appear in **Inbox → Connect your Gmail → Pending review** and `/ingestion/history`.

**Who can use it:** Runs for every user with a connected, active Gmail account and at least one active monitored sender.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-INGEST-001](../settings/email-ingestion.md#s-ingest-001) (which senders are searched), [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002) (review or auto-commit). Operator switches `ENABLE_MAILBOX_POLLER`, `MAILBOX_POLL_INTERVAL_MIN`, `ENABLE_LLM_PARSER`, `ANTHROPIC_API_KEY`, `LLM_MODEL` and the AI budget settings decide whether and how often it runs.

**Results:** New events appear; auto-committed ones also create transactions or cash-flow entries ([F-INGEST-009](F-INGEST-009.md)).

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

**Related features:** [F-INGEST-004](F-INGEST-004.md), [F-INGEST-006](F-INGEST-006.md), [F-INGEST-009](F-INGEST-009.md), [F-MAIL-006](F-MAIL-006.md), [F-IMPORT-011](F-IMPORT-011.md).

**Sources:** `packages/api/src/jobs/mailboxPoller.ts:213`, `packages/api/src/ingestion/gmail/poller.ts:41`, `packages/api/src/ingestion/gmail/poller.ts:50`, `packages/api/src/ingestion/gmail/poller.ts:127`, `packages/api/src/ingestion/gmail/poller.ts:165`, `packages/api/src/ingestion/gmail/pipeline.ts:171`, `packages/api/src/ingestion/gmail/pipeline.ts:257`, `packages/api/src/ingestion/gmail/pipeline.ts:274`, `packages/api/src/ingestion/gmail/pipeline.ts:522`, `packages/api/src/ingestion/llm/client.ts:182`, `packages/api/src/ingestion/llm/client.ts:243`, `packages/api/src/ingestion/llm/budget.ts:21`, `packages/api/src/ingestion/llm/budget.ts:107`, `packages/api/src/ingestion/templates.ts:53`, `packages/api/src/config/env.ts:102`
