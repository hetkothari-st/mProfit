---
id: F-SUCC-002
title: "When to share"
module: "Succession"
status: Live
roles: "R-PLUS+"
settings: [S-SUCC-001, S-SUCC-002, S-SUCC-003, S-SUCC-004, S-SUCC-005]
related: [F-SUCC-001, F-SUCC-003, F-SUCC-006]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# When to share

`F-SUCC-002` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Sets what starts the countdown — **If I'm inactive**, **On a date**, or **Whichever comes first** — the inactivity period, the release date and an optional personal letter for nominees.

**Why it exists:** Inferred from behavior: owners choose between an inactivity "dead man's switch" and a fixed release date.

**Where to find it:** **Planning → Succession → When to share** card.

**Who can use it:** [R-PLUS](../roles.md#r-plus) and above; editable only while the plan is Off, On or Paused.

**Steps**
1. Choose **Trigger**.
2. For inactivity, set **Inactive for (days, at least 30)**. For a date, set **Release date**.
3. Optionally write a **Personal letter (optional)** (placeholder "e.g. FD papers are in the SBI locker #42").
4. Click **Save** and confirm it's you. Toast "Saved".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Trigger** | Select | Inactivity / date / whichever first | Disabled when not editable or below PLUS |
| **Inactive for (days, at least 30)** | Number | Inactivity period | Hidden for **On a date** and in test mode |
| **Release date** | Date | Scheduled release | Hidden for **If I'm inactive** |
| **Personal letter (optional)** | Text area | Letter shown to nominees who may see it | Disabled when not editable |
| **Save** | Button | Saves settings | Disabled when not editable or invalid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Trigger | Select | Yes | INACTIVITY / SCHEDULED / BOTH | If I'm inactive | — |
| Inactive for | Integer days | Yes | 30–3,650 | 90 | "Inactivity period must be at least 30 days" |
| Release date | Date | For date triggers | YYYY-MM-DD, after today (IST) | Empty | "Pick a release date." / "The release date must be in the future." / "Use YYYY-MM-DD" |
| Personal letter | Text | No | ≤ 20,000 characters; stored encrypted | Empty | — |

**Settings and toggles here:** [S-SUCC-001](../settings/succession.md#s-succ-001) **Trigger**, [S-SUCC-002](../settings/succession.md#s-succ-002) **Inactive for**, [S-SUCC-003](../settings/succession.md#s-succ-003) **Release date**, [S-SUCC-004](../settings/succession.md#s-succ-004) **Personal letter**, [S-SUCC-005](../settings/succession.md#s-succ-005) **Test mode** (admins).

**Results:** On an armed plan, changing the inactivity days restarts the inactivity clock from now.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Settings are locked while reminders are going out or after release. Pause or revoke first." | Status is a reminder stage, Nominees notified or Shared | Pause or revoke |
| "The plan is counting down or released. Pause or revoke it first." | Same, from the server | Same |

**Limitations:** Inactivity counts IST calendar days; app activity is recorded at most once an hour.

**How it works:** `PUT /api/legacy/settings` (LEGACY_TRANSFER + step-up grant). The letter is encrypted at rest. See [F-SUCC-006](F-SUCC-006.md) for how the trigger drives the countdown.

**Related features:** [F-SUCC-001](F-SUCC-001.md), [F-SUCC-003](F-SUCC-003.md), [F-SUCC-006](F-SUCC-006.md).

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:122`, `apps/web/src/pages/legacy/LegacyPage.tsx:147`, `apps/web/src/pages/legacy/LegacyPage.tsx:167`, `packages/api/src/schemas/legacy.schemas.ts:6`, `packages/api/src/services/legacy/plan.service.ts:89`, `packages/shared/src/legacy.ts:11`
