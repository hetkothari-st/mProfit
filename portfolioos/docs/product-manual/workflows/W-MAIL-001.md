[Index](../INDEX.md)

# Connect Gmail and back-fill with an inbox scan

`W-MAIL-001` · Gmail connection and inbox scans

**Goal:** Pull years of statements and contract notes from Gmail at once.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Connect Gmail ([W-INGEST-001](W-INGEST-001.md) steps 1–2) | Opens **Choose how far back to scan** |
| 2 | Pick **Scan from**/**Scan until** or a preset (default 5 years) | — |
| 3 | Click **Start scan** | "Scan started — review docs as they appear"; opens **Reports → Inbox imports** |
| 4 | Approve the documents you want in **Reports → Inbox imports** | Each approved document becomes an import job in **Tools → Import** |

**Success:** Approved documents show **Completed** in **Import history**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "lookbackTo must be after lookbackFrom" | Same day chosen twice | Pick a range of at least two days |
| "Connect Gmail before starting a scan" | No active Gmail | Connect again |
| "Too many requests for this operation. Please wait a minute." | More than 5 scans in a minute | Wait |
