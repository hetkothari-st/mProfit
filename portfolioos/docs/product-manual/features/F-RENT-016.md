---
id: F-RENT-016
title: "Pending tenant reminders (email and SMS)"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: [S-RENT-003]
related: [F-RENT-015, F-RENT-017, F-RENT-019, F-RENT-021]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Pending tenant reminders (email and SMS)

`F-RENT-016` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** A collapsible panel "Pending tenant reminders" (with "N awaiting approval") that queues reminder messages for upcoming and overdue rent and lets you choose channels, approve and send, or reject. Nothing is sent without your approval.

**Why it exists:** Code comment: "No auto-send: every outbound message is a deliberate human action so the system can't spam tenants".

**Where to find it:** **Asset Classes → Rental → Properties** tab, above the cards (shown once you have at least one property).

**Who can use it:** All plans. Email sending needs a connected Gmail with send permission ([D-RENT-005](../dependencies.md#d-rent-005)); SMS needs the operator's SMS provider.

**Steps**
1. Reminders are queued daily at 09:00 IST, or click **Run scan** ("Queued N reminders" or "No new reminders to queue — …").
2. Reminders are grouped per tenant. If the tenant has no email or phone, the contact editor opens: fill **Tenant email**/**Tenant phone** and click **Save contact** ("Tenant contact saved — channels enabled"); otherwise **Edit contact** opens it.
3. Under **Send via**, toggle **Email** and **SMS** (a channel without a recipient is disabled: "Add a tenant email above" / "Add a tenant phone above").
4. Tick reminders (or **Select all**). Click **Approve & send** — result "N reminders sent", "N failed — <reasons>" or "N sent · M failed (…)" — or **Reject** ("Reminders rejected").
5. If Gmail lacks send permission, a "Reconnect Gmail" dialog offers **Reconnect Gmail** ("Gmail reconnected — try Approve & send again").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Panel header | Toggle | Expand/collapse | — |
| **Run scan** | Button | Queue reminders now | While running |
| **Edit contact** / **Save contact** / **Cancel** | Buttons | Edit tenant email/phone | Save disabled when unchanged or saving |
| **Email** / **SMS** | Channel chips | Channels for this send only | Disabled without a recipient |
| **Select all** / **Clear selection** | Link button | Select reminders | Shown with 2+ reminders |
| Row checkbox | Checkbox | Select | — |
| **Preview** | Button | [F-RENT-017](F-RENT-017.md) | — |
| **Reject** | Button | Reject selected | Shown when ≥1 selected |
| **Approve & send** | Button | Send selected | No contact, or no channel ("Pick at least one channel"); while sending |

**Fields and rules:** Tenant email ≤200 characters, tenant phone ≤50 characters (server).

**Settings and toggles here:** [S-RENT-003](../settings/rental.md#s-rent-003) **Email** / **SMS** channel chips — default both on where a recipient exists; one-shot for this send, not saved.

**Results:** Each approved reminder becomes Sent (if any channel succeeded) or Failed and leaves the panel; per-channel errors are recorded. Rejected reminders leave the panel.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Gmail in Settings → Email notifications first" | Gmail not connected | Connect Gmail ([D-RENT-005](../dependencies.md#d-rent-005)) |
| "Reconnect Gmail in Settings (existing connection is missing the send permission)" | Missing send scope | **Reconnect Gmail** |
| "SMS provider disabled (DLT-registered SMS provider not yet wired)" | Operator SMS provider is "none" | Use email or WhatsApp |
| "Twilio credentials missing in env" | Operator config | Contact support |
| "Tenant email not set" / "Tenant phone not set" / "Tenant phone is not a valid number" | Contact missing/invalid | Fix the contact |
| "No channels enabled — toggle email or SMS first" | No channel | Turn one on |

**Limitations:** Sent and failed reminders are not listed anywhere in the app. A rejected, failed or superseded reminder is put back in the queue whenever a later scan selects the same month and lead day again; for overdue months that is every daily scan, so rejecting an overdue reminder does not stop it — see DOCUMENTATION_GAPS [F-RENT-016](F-RENT-016.md). Partly paid months get no reminder. Upcoming reminders are queued only when the scan runs exactly 5, 3, 1 or 0 days before the due date; overdue months get one reminder each. The panel refreshes every 60 seconds.

**How it works:** The scan first copies a legacy "contact" value into email or phone when it clearly is one, flips past-due months to Overdue, then: (1) for each lead day 5/3/1/0, every Expected month of an active tenancy due exactly that many days from today gets a reminder; (2) every Overdue month gets one reminder (lead −1, "overdue by N days"). Text comes from a template (subject "Rent reminder — <property> (<date>)" or "Overdue rent — …"; SMS "Hi <tenant>, your rent of ₹… for <property> is due …"). Landlord name: property's landlord name → your account name → operator default "Your landlord"; payment instructions: property → your account setting → operator default. Email goes through your Gmail; SMS through Twilio when the operator enabled it. Endpoints: `GET /api/rental/reminders?status=PENDING_APPROVAL`, `POST /api/rental/reminders/scan`, `POST /api/rental/reminders/:id/approve` (with one-shot channels), `POST /api/rental/reminders/:id/reject`.

**Related features:** [F-RENT-017](F-RENT-017.md), [F-RENT-019](F-RENT-019.md), [F-RENT-015](F-RENT-015.md), [F-RENT-021](F-RENT-021.md), [D-RENT-005](../dependencies.md#d-rent-005).

**Sources:** `apps/web/src/pages/rental/RentalRemindersPanel.tsx:24`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:487`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:703`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:770`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:856`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:927`, `packages/api/src/services/rental/rental.reminders.service.ts:37`, `packages/api/src/services/rental/rental.reminders.service.ts:79`, `packages/api/src/services/rental/rental.reminders.service.ts:324`, `packages/api/src/services/rental/rental.reminders.service.ts:541`, `packages/api/src/services/notifications/sms.service.ts:74`
