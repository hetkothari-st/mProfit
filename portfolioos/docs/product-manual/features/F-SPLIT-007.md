---
id: F-SPLIT-007
title: "Receipt"
module: "Split Expenses"
status: Live
roles: "Group members"
settings: []
related: [F-SPLIT-006]
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Receipt

`F-SPLIT-007` · Live · Roles: Group members

**What it does:** The **Receipt** card shows the attached image or an **Open PDF** link, with **Add receipt** / **Replace** and **Remove** ("Remove this receipt?").

**Why it exists:** Inferred from behavior: keeps the bill with the expense for everyone in the group.

**Where to find it:** Expense page → **Receipt**.

**Who can use it:** Active group members; changes only while the expense is not deleted.

**Steps**
1. Click **Add receipt**, choose a JPEG, PNG, WebP or PDF under 10 MB ("Receipt saved").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add receipt** / **Replace** | Button | Uploads | Hidden on a deleted expense; disabled while uploading |
| **Remove** | Button | Asks, then removes | Hidden on a deleted expense |
| **Retry** | Button | Reloads the receipt | When it failed to load |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Receipt file | File | — | JPEG, PNG, WebP or PDF; under 10 MB; 10 uploads/minute | — | "Receipts must be under 10 MB" / "Upload a JPEG, PNG, WebP or PDF receipt" / "HEIC photos aren't supported - share the photo as JPEG" / "We couldn't read this image - try saving it as JPEG or PNG" |

**Settings and toggles here:** None.

**Results:** One receipt per expense; replacing deletes the old file. Activity records "attached a receipt" / "removed the receipt".

**Errors and troubleshooting:** "Couldn't upload the receipt", "Couldn't load the receipt", "Receipt no longer available".

**Limitations:** One receipt per expense.

**How it works:** `PUT /api/split/expenses/:id/receipt` (multipart `file`, rate-limited 10/min per user), `GET` (served inline, no caching), `DELETE`. Image metadata is stripped before storing; the file type is checked from its bytes.

**Related features:** [F-SPLIT-006](F-SPLIT-006.md).

**Sources:** `apps/web/src/pages/split/ExpenseExtras.tsx:16`, `apps/web/src/pages/split/ExpenseExtras.tsx:96`, `packages/api/src/routes/split.routes.ts:60`, `packages/api/src/routes/split.routes.ts:68`, `packages/api/src/services/split/receipts.service.ts:40`, `packages/api/src/services/split/receipts.service.ts:42`, `packages/api/src/middleware/rateLimit.ts:207`
