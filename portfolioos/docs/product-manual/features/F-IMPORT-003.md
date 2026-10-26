---
id: F-IMPORT-003
title: "Import issues dialog"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-IMPORT-002, F-IMPORT-008, F-IMPORT-009]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Import issues dialog

`F-IMPORT-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows why rows of an import were not added: the parser used, a general error, how many rows were skipped as duplicates, the parser's warnings, and a table of **Row errors** with **Row** number and **Reason**.

**Why it exists:** Inferred from behavior: a partial or failed import is only fixable if you can see which rows failed and why.

**Where to find it:** **Tools → Import → Import history**, button **Errors** (or **Warnings** when there are only warnings) on a row.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person's imports.

**Steps**
1. In **Import history**, click **Errors** or **Warnings** on a row. The dialog "Import issues — <file name>" opens.
2. Read the sections shown. Close the dialog with the close button or by clicking outside it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Parser: <id>" | Display | Name of the parser that read the file (for example `zerodha.contract_note`) | Hidden when not recorded |
| General error box | Display | One error for the whole job, for example "No portfolio selected and user has no portfolios" | Hidden when none |
| "<n> row(s) skipped as duplicates — they were already imported from this file." | Display | Count of rows that already existed | Hidden when 0 |
| **Parser warnings** | List | Warnings from the parser | Hidden when none |
| **Row errors (<n>)** | Table | **Row**, **Reason** per failed row | Hidden when none |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not imported — figures not found in the document: …" (row reason) | An AI-read row had a quantity, price, ISIN or date that is not present in the document text, so it was held back | Check the document and add the transaction by hand if it is real |
| "Asset class <CLASS> is outside what your professional may edit for this client." | The file was uploaded by a professional whose grant covers fewer asset classes | The account holder imports it, or widens the grant |
| "This PDF contains no extractable text — it looks like a scanned image. …" (warning) | Scanned/image PDF | Get a text-based PDF or a CSV/Excel export |
| "No parser accepted this file. Supported: CSV, Excel, Zerodha PDF, CAMS/KFintech CAS PDF, NSDL/CDSL depository CAS PDF." | No parser recognised the content | Use a supported statement |
| "CAS statement confirmed — no mutual fund transactions in the requested period. This is correct if you had no MF activity." | A valid CAS with no transactions; job marked **Completed** | Nothing to fix |

**Limitations:** Failures recorded by the background worker (timeouts, "Import was interrupted. Please upload the file again.") are stored but this dialog does not display them, and the button that opens it is not shown for such jobs.

**How it works:** The dialog reads the job's stored `errorLog` (fields `parser`, `general`, `skippedAsDuplicates`, `parserWarnings`, `rowErrors`). Row numbers are 1-based positions in the parser's output, not spreadsheet line numbers. The empty-CAS sentinel produced by the CAS parser is replaced by the friendly sentence above before saving.

**Related features:** [F-IMPORT-002](F-IMPORT-002.md), [F-IMPORT-008](F-IMPORT-008.md), [F-IMPORT-009](F-IMPORT-009.md).

**Sources:** `apps/web/src/pages/imports/ImportErrorDialog.tsx:10`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:30`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:47`, `packages/api/src/services/imports/import.service.ts:396`, `packages/api/src/services/imports/import.service.ts:415`, `packages/api/src/services/imports/import.service.ts:524`, `packages/api/src/ingestion/fileImport/runner.ts:188`, `packages/api/src/ingestion/fileImport/runner.ts:222`, `packages/api/src/jobs/importWorker.ts:60`
