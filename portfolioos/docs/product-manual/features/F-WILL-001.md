---
id: F-WILL-001
title: "Will Maker overview"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: []
related: [F-WILL-002, F-WILL-003, F-WILL-004, F-WILL-012, F-WILL-013]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Will Maker overview

`F-WILL-001` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Shows your will's status (**Not created**, **Draft**, **Generated**, **Executed**), the current draft or latest generated version with its actions, an indicative estate (Assets, Liabilities, Net worth), a "Key things to prepare" list and the disclaimer.

**Why it exists:** Page description: "Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign."

**Where to find it:** **Planning → Will Maker** (route `/will`).

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Below PLUS the page shows the lock card "Will Maker is locked" plus "Your will documents" ([F-WILL-013](F-WILL-013.md)). While managing someone's account ([R-MANAGER](../roles.md#r-manager)) it shows "Will Maker works on your own account only. Switch back to your own account to make or view your will."

**Steps**
1. Open **Planning → Will Maker**.
2. With nothing yet, click **Create my will** ("About 15-20 minutes. Your progress is saved as you go."). The wizard opens at **Your details**.
3. With a draft: **Continue** or **Discard draft** (confirm "Discard this draft?" — "You can't get it back." → **Discard**; toast "Draft discarded").
4. With a generated will: **Download PDF**, **Sign and store** (or **Signed copy** once signed), **Start a new version** (not yet signed) or **My circumstances changed** (signed).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create my will** | Button | Starts a draft | Only when no draft and no generated will; disabled while starting |
| **Continue** | Button | Opens the draft at its saved step | Only with a draft |
| **Discard draft** | Button | Deletes the draft after confirmation | Only with a draft |
| **Download PDF** | Button | Downloads the latest version's PDF | Only with a generated will; disabled while any download runs |
| **Sign and store** / **Signed copy** | Link | Opens step 9 ([F-WILL-012](F-WILL-012.md)) | Only with a generated will |
| **Start a new version** | Button | New draft copied from the latest version | Only when generated, not signed, and no draft |
| **My circumstances changed** | Button | New draft copied from the signed version | Only when signed and no draft |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Drafts are created as the next version number. If a draft already exists, any create action opens it instead.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load Will Maker" | Overview request failed | Reload |
| "Couldn't start your will" / "Couldn't start a new version" | Server refused | Retry |
| "N source(s) could not be read right now." | Some asset sources failed while totalling the estate | Refresh later |

**Limitations:** The estate tiles are indicative ("From your EveryPaisa accounts today. Insurance paid to nominees (₹…) is not counted.") and are recomputed on each visit. Only one draft can exist at a time ("You already have a draft will. Continue it or discard it first.").

**How it works:** `GET /api/will` (WILL_MAKER plan, refuses managing). Collects the estate from all asset sources (bank accounts, investments, provident fund, property, rental property, vehicles, insurance, money lent, loans, credit cards; at most 400 items) and totals assets, liabilities, net and nominee-only amounts. `POST /api/will/drafts` (optionally from an earlier will) and `DELETE /api/will/drafts/:id`. Will contents are stored encrypted per user.

**Related features:** [F-WILL-002](F-WILL-002.md), [F-WILL-003](F-WILL-003.md), [F-WILL-004](F-WILL-004.md), [F-WILL-012](F-WILL-012.md), [F-WILL-013](F-WILL-013.md).

**Sources:** `apps/web/src/pages/will/WillOverviewPage.tsx:19`, `apps/web/src/pages/will/WillOverviewPage.tsx:26`, `apps/web/src/pages/will/WillOverviewPage.tsx:141`, `apps/web/src/pages/will/WillOverviewPage.tsx:163`, `apps/web/src/pages/will/WillOverviewPage.tsx:202`, `packages/api/src/routes/will.routes.ts:51`, `packages/api/src/services/will/will.service.ts:72`, `packages/api/src/services/will/will.service.ts:83`, `packages/api/src/services/will/will.service.ts:114`, `packages/api/src/services/will/estate/registry.ts:36`, `packages/shared/src/will/wire.ts:117`
