[Index](../INDEX.md)

# Set up email ingestion

`W-INGEST-001` · Email ingestion

**Goal:** Have transaction alerts from your bank, broker or insurer emails read automatically.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (not while managing another account).
**Before you start:** A Gmail account that receives the alerts. The server must have the AI parser switched on (operator).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Inbox → Connect your Gmail** and click **Connect Gmail** | Sends you to Google |
| 2 | Choose the account and allow access | Returns to the app: "Connected <email>", then **Choose how far back to scan** |
| 3 | Click **Skip for now** (or start an inbox scan, [W-MAIL-001](W-MAIL-001.md)), then go back to **Inbox → Connect your Gmail** | Step 2 **Senders to monitor** is now open |
| 4 | Click **Scan inbox** | Lists likely financial senders with scores |
| 5 | Tick the senders (use full addresses, not `@domain`) and click **Add <n> senders** | "Added <n> sender(s)"; senders start **Active** with auto-commit on |
| 6 | Optional: open **Sender settings** and switch auto-commit off for senders you want to review | Their events will wait in **Pending review** |
| 7 | Wait for the next poll (default every 3 minutes) | New events appear in **Pending review** or are written directly |

**Success:** Events from your senders appear under step 3 or in **See committed / rejected → Auto-committed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| No events ever appear | AI parser disabled on the server, or `@domain` senders | Ask the operator; add full addresses |
| "Switch back to your own account to do this." | Managing another account | **Back to my account** |
| Account shows **Paused**, "Gmail access lost …" | Google rejected the grant | **Add another** with the same account |
