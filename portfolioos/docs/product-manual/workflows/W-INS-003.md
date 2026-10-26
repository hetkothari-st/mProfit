[Index](../INDEX.md)

# Bring in policies from Gmail

`W-INS-003` · Insurance

**Goal:** Let EveryPaisa find policy documents and premium receipts.
**Who:** [R-FREE](../roles.md#r-free) and up with Gmail connected.
**Before you start:** Connect Gmail (`/ingestion`).

| # | You do | The app does |
|---|---|---|
| 1 | On **Insurance**, click **Turn on** for your Gmail account | Toast "Searching your Gmail for insurance documents"; searches 3 years back |
| 2 | Wait; the line shows "Searching… N document(s) found so far" | Reads found PDFs and matches them |
| 3 | Under **Password protected**, enter the PDF password, click **Open** | Toast "Opened N PDFs" |
| 4 | Under **Policies found**, click **Review and add**, check figures, **Add policy** | Policy created with the document's number |
| 5 | Under **Renewals to confirm**, click **Update the policy** or **Ignore** | Policy updated or notice ignored |

**Success:** Receipts appear as payments on the matching policies; documents are filed in Documents.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Not read yet." for a long time | Reading budget reached or model unavailable | Wait for the nightly retry |
| **Needs your check** | Reading didn't match the PDF | **Add the policy myself** or **Dismiss** |
