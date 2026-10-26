[Index](../INDEX.md)

# Settings — Email ingestion

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-ingest-001"></a>
### Active / Paused (Pause polling / Resume polling)
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:158`, `packages/api/src/controllers/monitoredSenders.controller.ts:22` |

<a id="s-ingest-002"></a>
### Auto-commit
| Attribute | Value |
|---|---|
| Control type | Toggle (lightning icon); also **Enable auto-commit** banner |
| Location | **Sender settings** rows; banner in **Pending review** |
| Purpose | Let a sender's events be written without manual review |
| Default | `on` for every new sender (source: `packages/api/src/services/gmail/monitoredSenders.service.ts:99`) — the UI help text implies it starts off |
| Values | `on`: new events with all figures found and confidence ≥ 0.70 are confirmed and written immediately; others wait in review · `off`: every event waits in **Pending review** |
| Depends on | Turning it on is refused while approved count < [S-INGEST-003](../settings/email-ingestion.md#s-ingest-003) ("Approve <n> more event(s) from this sender before enabling auto-commit."); creation bypasses this |
| Persists | Yes — server |
| Stored in | `MonitoredSender.autoCommitEnabled` |
| Backend effect | Event status PARSED vs PENDING_REVIEW and auto-projection (`packages/api/src/ingestion/gmail/pipeline.ts:171`, `packages/api/src/ingestion/gmail/pipeline.ts:522`) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:164`, `packages/api/src/controllers/monitoredSenders.controller.ts:54` |

<a id="s-ingest-003"></a>
### Auto-commit after N confirmed events
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (at creation only in the UI; API also accepts it on update) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:106`, `packages/api/src/controllers/monitoredSenders.controller.ts:16` |

<a id="s-ingest-004"></a>
### Display label (optional)
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (at creation only in the UI) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:96`, `packages/api/src/services/gmail/monitoredSenders.service.ts:90` |
