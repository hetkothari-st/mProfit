---
id: F-RENT-017
title: "Reminder preview and edit"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-016]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Reminder preview and edit

`F-RENT-017` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Shows a queued reminder ("Preview reminder — <Month Year>") and lets you edit the email subject, greeting, opening line, payment instructions, closing line, signature and SMS text, with a live email preview.

**Why it exists:** Code comment: the landlord edits plain text; the HTML layout is kept intact.

**Where to find it:** Pending reminders panel → **Preview** on a reminder.

**Who can use it:** All plans.

**Steps**
1. Click **Preview**. Edit fields; the preview updates as you type.
2. Click **Save changes** ("Reminder updated"), then **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Save changes** | Button | Saves the edits | While saving |
| **Close** | Button | Close | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email subject | Text | — | — | Template | "Update failed" |
| Greeting, Opening line, Payment instructions, Closing line, Signature | Text | — | Plain text (HTML characters are escaped) | Template | — |
| SMS body | Text | — | Up to 300 characters (counter shows "/160") | Template | — |

**Settings and toggles here:** None.

**Results:** The edited message is stored on that reminder only. Notes show "(email channel disabled — tenant email missing)" or "(SMS channel disabled — tenant phone missing)" when relevant.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Only PENDING_APPROVAL reminders can be edited" (raw request error) | Reminder already sent/rejected | Run a new scan |

**Limitations:** Edits apply to one reminder; a revived reminder (after rejection or failure) gets fresh template text, losing earlier edits.

**How it works:** `PATCH /api/rental/reminders/:id` with subject, HTML body (edited regions spliced between markers) and SMS body.

**Related features:** [F-RENT-016](F-RENT-016.md).

**Sources:** `apps/web/src/pages/rental/RentalRemindersPanel.tsx:116`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:171`, `packages/api/src/services/rental/rental.reminders.service.ts:492`
