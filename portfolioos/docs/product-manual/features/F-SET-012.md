---
id: F-SET-012
title: "Activity feed of professionals' actions"
module: "Account Access"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-SET-008, F-SET-010, F-SET-011]
---

[← Account Access](../modules/account-access.md) · [Index](../INDEX.md)

# Activity feed of professionals' actions

`F-SET-012` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows the most recent things done to your books by professionals and by you in this relationship (invited, accepted, scope changes, withdrawals, and the professional's edits).

**Why it exists:** The page header: "…what each of them can reach, and everything they have done."

**Where to find it:** **Account Access**, the **Activity** list near the bottom.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — view only. With nothing yet: "Nothing has happened yet. Everything a professional does to your books will appear here."

**Controls:** None.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** Up to 100 entries, newest first.

**How it works:** GET `/api/me/professional-access/activity` reads the professional audit log where you are the actor or the subject (database row-level security restricts it to your side).

**Related features:** [F-SET-008](F-SET-008.md), [F-SET-010](F-SET-010.md), [F-SET-011](F-SET-011.md).

**Sources:** `apps/web/src/components/ca/CaActivityFeed.tsx:19`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:223`, `packages/api/src/controllers/ca.controller.ts:106`, `packages/api/src/services/ca/caAccess.service.ts:579`
