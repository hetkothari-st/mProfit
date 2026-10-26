---
id: F-SPLIT-018
title: "Activity and weekly email digests"
module: "Split Expenses"
status: Live
roles: "Members with accounts"
settings: [S-SPLIT-010, S-SPLIT-011]
related: [F-SPLIT-017]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Activity and weekly email digests

`F-SPLIT-018` · Live · Roles: Members with accounts

**What it does:** Sends two kinds of email: an activity digest "<N> updates in your shared expenses" about changes other people made in your groups, and a Monday "Your weekly balances" summary (top 10 people, plus "In total you are owed / you owe").

**Why it exists:** Inferred from behavior: keeps members informed without opening the app.

**Where to find it:** Your email inbox; switch on/off in **Split settings → Emails**.

**Who can use it:** Members with an account ([R-FREE](../roles.md#r-free) and above).

**Steps:** Not applicable — automatic.

**Controls:** None here (see [F-SPLIT-017](F-SPLIT-017.md)).

**Fields and rules:** None.

**Settings and toggles here:** [S-SPLIT-010](../settings/split-expenses.md#s-split-010) **Email about activity** (on by default), [S-SPLIT-011](../settings/split-expenses.md#s-split-011) **Weekly balance summary** (off by default).

**Results:** Emails.

**Errors and troubleshooting:** None user-facing; failures are logged.

**Limitations:** Activity digests cover at most the last 7 days and never include your own actions. The weekly summary skips you when all balances are zero or the account is inactive/scheduled for deletion.

**How it works:** Cron in Asia/Kolkata: activity digest every hour at :05; weekly digest Mondays 09:00. Both run as system and loop per user.

**Related features:** [F-SPLIT-017](F-SPLIT-017.md).

**Sources:** `packages/api/src/jobs/splitDigestJobs.ts:33`, `packages/api/src/jobs/splitDigestJobs.ts:34`, `packages/api/src/services/split/notify.service.ts:116`, `packages/api/src/services/split/notify.service.ts:168`
