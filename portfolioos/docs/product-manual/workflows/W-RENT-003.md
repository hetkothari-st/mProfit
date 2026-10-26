[Index](../INDEX.md)

# Send rent reminders

`W-RENT-003` · Rental

**Goal:** Remind tenants before or after the due date.
**Who:** Any signed-in user. Email needs a connected Gmail with send permission; SMS needs the operator's provider.
**Before you start:** Tenant email and/or phone.

| # | You do | The app does |
|---|---|---|
| 1 | **Rental → Properties** → Pending tenant reminders → **Run scan** (or wait for 09:00 IST) | Queues reminders for months due in 5/3/1/0 days and overdue months |
| 2 | Fix missing contacts with **Edit contact** → **Save contact** | "Tenant contact saved — channels enabled" |
| 3 | Optional **Preview** → edit text → **Save changes** | "Reminder updated" |
| 4 | Pick **Email**/**SMS**, tick reminders, **Approve & send** | "N reminders sent" or per-reason failures |
| Alt | For WhatsApp: **Collections** → **Remind** | Opens WhatsApp with the message |

**Success:** Reminders leave the panel; tenants receive messages.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Connect Gmail in Settings → Email notifications first" | No Gmail | Connect Gmail |
| "Reconnect Gmail in Settings (existing connection is missing the send permission)" | Old Gmail grant | **Reconnect Gmail** in the dialog |
| "SMS provider disabled (DLT-registered SMS provider not yet wired)" | SMS not configured | Use email or WhatsApp |
| A rejected overdue reminder is back the next day | Scan revives rejected reminders | Reject again or settle/skip the month (DOCUMENTATION_GAPS [F-RENT-016](../features/F-RENT-016.md)) |
