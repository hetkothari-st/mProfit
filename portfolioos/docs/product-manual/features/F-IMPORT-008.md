---
id: F-IMPORT-008
title: "How imported files are read (parsers)"
module: "Import"
status: Live
roles: "All importing users"
settings: [S-IMPORT-001]
related: [F-IMPORT-001, F-IMPORT-004, F-IMPORT-009, F-IMPORT-010, F-MAIL-003, F-MAIL-006]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# How imported files are read (parsers)

`F-IMPORT-008` · Live · Roles: All importing users

**What it does:** Every import job — from the Import page, the mutual fund CAS card, a Gmail attachment or an approved inbox-scan document — goes through one pipeline: unlock the file, recognise the document type, extract transactions, and add them to a portfolio.

**Why it exists:** Code comments describe the design: one adapter interface with versioned parsers so every imported row records which parser produced it, and failures are kept for review instead of crashing the import.

**Where to find it:** Automatic. Results appear in **Tools → Import → Import history** and in **Overview → Transactions**.

**Who can use it:** Runs for every user's import jobs ([R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) on behalf of the managed person).

**Steps:** Not applicable — automatic. Upload a file ([F-IMPORT-001](F-IMPORT-001.md)) and the steps below run on their own.

**Controls:** None — this is background processing.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-IMPORT-001](../settings/import.md#s-import-001) (target portfolio) decides where rows land.

**Results:** Transactions are created with the parser name and version recorded on each row; holdings for affected assets are recomputed; insurance-premium rows are linked to a matching policy when the policy number matches exactly; the job gets its final status.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Job **Failed** with warning "No parser accepted this file. …" | Content not recognised | Use a supported statement |
| Job **Failed**, general error "No portfolio selected and user has no portfolios" | You have no portfolio | Create a portfolio, then **Reprocess** |
| "File type … is not allowed for upload." / "Detected file type (…) does not match what this upload accepts." | Archive, video, image or other type | Upload a PDF, Excel or CSV |
| Some rows "Not imported — figures not found in the document: …" | AI-read figures not present in the document text | Check and enter by hand |

**Limitations:** Scanned (image-only) PDFs are not read. The AI contract-note parser and the AI CAS fallback run only when the operator has configured them (see Settings reference → Operator configuration); otherwise those documents yield no rows. Insurance premiums are auto-linked only on an exact policy-number match.

**How it works:**
1. *Unlock and sniff.* The file's magic bytes decide its real kind (PDF, XLSX, encrypted XLSX, XLS, CSV); other kinds are rejected as junk. Locked files are tried with the passwords listed in [F-IMPORT-004](F-IMPORT-004.md); still locked → status NEEDS_PASSWORD. A PDF with no text → warning "This PDF contains no extractable text …".
2. *Pick a parser,* in this fixed order, the first that accepts the content wins: Zerodha contract note (`zerodha.contract_note` v1: text has "CONTRACT NOTE"/"CONFIRMATION OF TRADE" and "ZERODHA"/"TRADING MEMBER"/"SEBI REGISTRATION"); generic broker contract note (`broker.contract_note.generic` v1, AI-read with Claude Haiku, for other brokers); NSDL/CDSL depository CAS (`cas.depository.nsdl_cdsl` v2); CAMS/KFintech mutual fund CAS (`cas.mf.cams_kfintech` v1, with an AI fallback using Gemini when the regular reader finds no trades and `GEMINI_API_KEY` is set); FD certificate (`fd.certificate.pdf`, 2+ keywords); insurance statement (`insurance.statement.pdf`, 3+ keywords, not a bank/account statement); salary slip (`salary.slip.pdf`, 3+ keywords); bank statement (`bank.statement.pdf`, 3+ keywords, not a contract note or CAS); generic Excel (`generic.excel`, any .xlsx/.xls, first sheet converted to CSV); generic CSV (`generic.csv`, any .csv/.tsv).
3. *Verify AI-read rows.* For parsers that return their source text, each row's quantity, price, ISIN and date must be found in the document; otherwise the row is held back as a failed row.
4. *Choose the portfolio:* the job's target, else your default portfolio, else your first portfolio.
5. *Write rows.* Trades are written first; depository "Opening holding from …" rows go last and add only the units your existing transactions (across all portfolios) do not already explain, to 3 decimal places. Each row is created through the normal transaction service with duplicate protection ([F-IMPORT-009](F-IMPORT-009.md)). A row that throws becomes a row error and an ingestion-failure record.
6. *Final status:* empty-CAS sentinel → COMPLETED; no rows and some warnings → FAILED; no failed rows → COMPLETED; failed rows and nothing added or skipped → FAILED; otherwise COMPLETED_WITH_ERRORS (shown **Partial**). A depository statement's closing position is saved for the nightly statement reconciliation. If the job came from an inbox-scan document, that document's status is mirrored (IMPORTED or PARSE_FAILED).

**Related features:** [F-IMPORT-004](F-IMPORT-004.md), [F-IMPORT-009](F-IMPORT-009.md), [F-IMPORT-010](F-IMPORT-010.md), [F-MAIL-003](F-MAIL-003.md), [F-MAIL-006](F-MAIL-006.md), [D-IMPORT-001](../dependencies.md#d-import-001), [D-IMPORT-005](../dependencies.md#d-import-005), [D-IMPORT-006](../dependencies.md#d-import-006).

**Sources:** `packages/api/src/ingestion/fileImport/runner.ts:21`, `packages/api/src/ingestion/fileImport/runner.ts:139`, `packages/api/src/ingestion/fileImport/adapters.ts:170`, `packages/api/src/ingestion/fileImport/adapters.ts:239`, `packages/api/src/ingestion/fileImport/parsers/zerodhaContractNote.parser.ts:85`, `packages/api/src/ingestion/fileImport/parsers/mfCas.parser.ts:116`, `packages/api/src/ingestion/fileImport/parsers/bankStatement.parser.ts:104`, `packages/api/src/lib/decryptIfNeeded.ts:213`, `packages/api/src/services/imports/import.service.ts:343`, `packages/api/src/services/imports/import.service.ts:385`, `packages/api/src/services/imports/import.service.ts:420`, `packages/api/src/services/imports/import.service.ts:470`, `packages/api/src/services/imports/import.service.ts:503`, `packages/api/src/services/imports/import.service.ts:539`
