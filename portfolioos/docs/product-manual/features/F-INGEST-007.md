---
id: F-INGEST-007
title: "Ingestion history (Review ingestion)"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INGEST-002]
related: [F-INGEST-004, F-INGEST-005, F-INGEST-008]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Ingestion history (Review ingestion)

`F-INGEST-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The page "Review ingestion" shows events in three tabs: **Pending review** (same actions as [F-INGEST-004](F-INGEST-004.md)), **Auto-committed** (every event that has been written, with a status badge) and **Rejected / failed** (rejected, failed and over-budget archived events).

**Why it exists:** The header says: "Canonical events extracted from your email. Approve to commit them to transactions; reject to drop them."

**Where to find it:** **Inbox → Connect your Gmail → See committed / rejected** (route `/ingestion/history`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click a tab: **Pending review**, **Auto-committed** or **Rejected / failed**.
2. Click a row to open "Canonical event" with all details, parser notes and any rejection reason.
3. On **Pending review**, approve, reject or **Approve all** as in [F-INGEST-004](F-INGEST-004.md).
4. Click **Refresh** to reload.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Pending review** / **Auto-committed** / **Rejected / failed** | Tabs | Switch the list | — |
| **Refresh** | Button | Reloads events | Never |
| Tick / cross / **Approve all** / **Approve & commit** / **Reject** | Buttons | As in [F-INGEST-004](F-INGEST-004.md) | Only on **Pending review** |
| Status badge | Display | Event status on the other tabs | — |
| **Enable auto-commit** banner | Button | As in [F-INGEST-005](F-INGEST-005.md) | Only on **Pending review** |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Rejection reason | Text | No | Up to 500 characters | Empty | "Validation failed" |

**Settings and toggles here:** [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002) (via the banner).

**Results:** Same as [F-INGEST-004](F-INGEST-004.md) for actions; otherwise read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing auto-committed yet" | No written events | — |
| "No rejected or failed events" — "Nothing to see — clean history." | None | — |

**Limitations:** **Auto-committed** lists every written event, including ones you approved by hand. Each status shows at most 200 events. CONFIRMED events (approved but not yet written) are not shown on any tab. There is no search, filter or date range.

**How it works:** One `GET /api/canonical-events?status=…&limit=200` request per status in the tab (PARSED + PENDING_REVIEW; PROJECTED; REJECTED + FAILED + ARCHIVED), merged and sorted by event date then creation time, newest first. Requests run only for the open tab.

**Related features:** [F-INGEST-004](F-INGEST-004.md), [F-INGEST-005](F-INGEST-005.md), [F-INGEST-008](F-INGEST-008.md).

**Sources:** `apps/web/src/pages/ingestion/ReviewPage.tsx:35`, `apps/web/src/pages/ingestion/ReviewPage.tsx:41`, `apps/web/src/pages/ingestion/ReviewPage.tsx:227`, `apps/web/src/pages/ingestion/ReviewPage.tsx:273`, `apps/web/src/pages/ingestion/ReviewPage.tsx:298`, `packages/api/src/services/imports/canonicalEvents.service.ts:61`
