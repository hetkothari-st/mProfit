---
id: F-FNO-005
title: "Expiry-day close approvals"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-FNO-001, S-FNO-002]
related: [F-FNO-001]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Expiry-day close approvals

`F-FNO-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** On expiry day a server job turns each open contract expiring that day into an "Expiry close" request (status shown as "EXPIRY ?") and raises an alert "<underlying> <type> expires today". The **Expiry** tab lists pending requests ("Expiry close <date>", "<n> contracts · settlement <price | pending>") with **Reject** and **Approve**. Approving books a closing trade at the settlement price; an option settling at 0 is marked EXPIRED_WORTHLESS.

**Why it exists:** Positions held to expiry never get a closing trade from the broker; this books one so P&L is complete. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** → **Expiry** (route `/fo`); alert in the bell ([D-ASSET-006](../dependencies.md#d-asset-006)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), for their own portfolios.

**Steps**
1. On expiry day after 17:30 IST, open **F & O → Expiry**.
2. Check the settlement price, then click **Approve** ("Approved") or **Reject** ("Rejected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Expiry** | Tab | Lists pending requests | — |
| **Approve** | Button | Books the closing trade at settlement | — |
| **Reject** | Button | Marks the request rejected | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-FNO-001](../settings/futures-options.md#s-fno-001) **Auto-approve expiry close** — on: the job approves automatically when a settlement price exists; off (default): requests wait for you. It has no control in the app. [S-FNO-002](../settings/futures-options.md#s-fno-002) **Default equity tax treatment** is stored by the same endpoint but not read anywhere.

**Results:** Approve: a SELL (long) or BUY (short) transaction at settlement, the position rebuilt and closed. Reject: request marked REJECTED; the position keeps status "EXPIRY ?".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No settlement price for this contract yet — add it before closing the position at expiry." | Bhavcopy price for the contract not stored | Wait for the 16:45 bhavcopy; there is no field to type it |
| "No pending expiry approvals" / "Expiry close requests appear here on expiry day after settlement is published." | Nothing pending | — |
| "Approve failed" / "Reject failed" | Server error or not your portfolio | Reload |

**Limitations:** A rejected request leaves the position as "EXPIRY ?" under **Open** indefinitely; the job only scans OPEN positions expiring that day, so it is never re-offered (DOCUMENTATION_GAPS.md). The list shows up to 100 requests across all your portfolios.

**How it works:** `jobs/foExpiryClose.job.ts` runs Mon–Fri 17:30 IST as a system task (unless `ENABLE_FO_EXPIRY_CRON=false`), finds OPEN positions with expiry today, reads the stored contract settlement price, creates an ExpiryCloseJob (PENDING_REVIEW), sets the position to PENDING_EXPIRY_APPROVAL, creates an `FO_EXPIRY_TODAY` alert, and auto-approves only when the portfolio setting is on and a price exists. `POST /api/fo/expiry-jobs/:id/approve|reject` check the portfolio is yours.

**Related features:** [F-FNO-001](F-FNO-001.md), [D-ASSET-006](../dependencies.md#d-asset-006), [D-ASSET-007](../dependencies.md#d-asset-007).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:494`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:521`, `packages/api/src/jobs/foExpiryClose.job.ts:30`, `packages/api/src/services/fo/foExpiry.service.ts:25`, `packages/api/src/services/fo/foExpiry.service.ts:65`, `packages/api/src/services/fo/foExpiry.service.ts:101`, `packages/api/src/controllers/fo.controller.ts:241`, `packages/api/src/controllers/fo.controller.ts:268`, `packages/api/prisma/schema.prisma:2863`
