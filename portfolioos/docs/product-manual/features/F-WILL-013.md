---
id: F-WILL-013
title: "Will documents after a plan lapse"
module: "Will Maker"
status: Live
roles: "R-FREE with a will"
settings: []
related: [F-WILL-001, F-WILL-012]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Will documents after a plan lapse

`F-WILL-013` · Live · Roles: [R-FREE](../roles.md#r-free) with a will

**What it does:** Below PLUS, Will Maker is locked but the card "Your will documents" still offers **Download PDF** and **Download signed copy** for your current version: "Version N stays yours to download on any plan."

**Why it exists:** Code comment: "A user always keeps their own will, whatever their plan".

**Where to find it:** **Planning → Will Maker** when your plan is below PLUS.

**Who can use it:** [R-FREE](../roles.md#r-free) (and any plan) with a generated will.

**Steps**
1. Open **Planning → Will Maker**. Under the lock card, click **Download PDF** or **Download signed copy**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | Downloads the current version | Card hidden with no generated will |
| **Download signed copy** | Button | Downloads the signed copy | Only when stored |

**Fields and rules:** Not applicable — downloads only.

**Settings and toggles here:** None.

**Results:** Files download; nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't download the file" | Download failed | Retry |

**Limitations:** Editing, new versions and storing a signed copy need PLUS.

**How it works:** `GET /api/will/documents`, `/versions/:vid/pdf`, `/wills/:id/signed-copy` are mounted before the WILL_MAKER gate (still refused while managing).

**Related features:** [F-WILL-001](F-WILL-001.md), [F-WILL-012](F-WILL-012.md).

**Sources:** `apps/web/src/pages/will/WillGuards.tsx:25`, `apps/web/src/pages/will/WillGuards.tsx:61`, `packages/api/src/routes/will.routes.ts:47`
