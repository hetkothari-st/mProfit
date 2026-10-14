# Documents (auto-sorting vault) — design

Date: 2026-10-14 · Status: draft for review · Path: architectural

## 1. Goal

A new **Tools → Documents** page. The user drops files; the system works out
*whose* document it is and *what* it is, files it as
`Person / Document type / <Type>_<date>.<ext>`, and keeps it downloadable
forever. No clicks required after the drop.

## 2. Decisions locked in brainstorming

| # | Decision |
|---|---|
| 1 | Read documents **locally first** (pdfjs text, tesseract OCR). Rules extract doc type, person name, PAN last-4, document date. |
| 2 | LLM (Haiku) is a **fallback only** when rules are unsure. It receives a *redacted* snippet; the person's name is kept for that call only. This deliberately relaxes the "no identity to LLM" rule for this one call. Goes through existing budget gate. |
| 3 | Unknown name → **auto-create** a person folder, flagged "auto-created" with one-click merge/rename. |
| 4 | v1 file types: **text PDFs, scanned/image PDFs, JPG/PNG/HEIC** (OCR). Password-protected PDFs prompt for a password. DOCX/XLSX not read in v1 (stored, `NEEDS_REVIEW`). |
| 5 | Approach A: **extend the existing vault** (`Document`/`DocumentBlob`); folders are virtual (derived from columns), not physical. |

## 3. Pipeline

1. **Drop**: multi-file dropzone → `POST /upload`. Each file is magic-byte
   checked, content-hashed (SHA-256), sealed with the per-user key and stored
   in `DocumentBlob`; `Document.sortStatus = PROCESSING`. Same hash already
   present for the user → skip, link to the existing document (idempotent).
2. **Job** (queued, per file; job reads → computes in memory → one short
   transaction at the end; 5 min bound):
   1. Extract text: pdfjs; if no text layer or image → tesseract OCR.
   2. Rules → `{docType, personName, panLast4?, docDate}` with confidence.
   3. Low confidence → redacted snippet to Haiku via existing gate
      (`checkLlmGate`, `checkBudget`, `recordSpend`). Over budget → `NEEDS_REVIEW`.
   4. Resolve person: exact `nameKey`, then fuzzy (token-set ratio ≥ threshold,
      PAN last-4 as tiebreaker). No match → create `DocumentPerson`
      (`autoCreated = true`).
   5. Rename: `<DocType>_<YYYY-MM-DD>.<ext>`; date = document date, else upload
      date. Collision → `-2`, `-3`.
   6. `sortStatus = FILED`.
3. **Failures never drop the file.** Password PDF → `NEEDS_PASSWORD` prompt
   (reuse `PasswordPromptDialog`). Unreadable/unknown → `NEEDS_REVIEW` with
   `sortReason`. Hard errors → `FAILED` + `IngestionFailure` row (DLQ).
4. **Download**: single file, per-folder zip, all (existing endpoints +
   per-folder zip).

## 4. Data model (migration is additive/non-destructive)

- New `DocumentPerson`: `id, userId, displayName, nameKey, panLast4?,
  linkedUserId?, autoCreated, createdAt`; `@@unique([userId, nameKey])`; RLS.
- `Document` + nullable `personId, docType, docDate, contentHash, sortStatus,
  sortReason`; index `[userId, personId, docType]`; unique
  `[userId, contentHash]` where not null.
- `DocumentOwnerType` + `PERSON_DOCS`.
- `docType` enum: ITR, FORM_16, INCOME_CERTIFICATE, BANK_STATEMENT,
  SALARY_SLIP, CAS, CONTRACT_NOTE, INSURANCE, FD_CERTIFICATE, ID_PROOF, OTHER.
- `panLast4` and any extracted identifiers encrypted at rest like other PII.

## 5. API (`/api/documents-sorter`, `authenticate` + `requireFeature('DOCUMENT_SORTER')`)

- `POST /upload` (multi-file, returns ids immediately)
- `GET /tree` (people → types → files + status)
- `PATCH /:id` (reassign person/type → re-rename)
- `PATCH /people/:id`, `POST /people/merge`
- Downloads: `/documents/:id/download`, per-folder zip, bulk zip.
- Audit-log every download/export.

## 6. UI

Sidebar `Tools → Documents`. Big multi-file dropzone with per-file progress
(uploading → reading → "filed into Rahul / Bank Statement"). Person-folder
grid → type sub-folders → files (download, view, move, delete). Badges:
"auto-created · merge?", "needs review", "needs password". Mobile-responsive.

## 7. Gating & security

- New `DOCUMENT_SORTER` feature in `entitlements.ts`; default tier **PLUS**
  (OCR + LLM cost) — confirm.
- Per-user encryption, ownership checks, RLS, no raw document text in logs,
  redaction (`redactForLlm`) always applied before any LLM call.

## 8. Testing

- Golden fixtures: ≥5 anonymised samples per doc type, snapshotted output.
- Unit: fuzzy person match, filename collision, date selection.
- Invariants: same file twice → zero new rows; cross-user RLS isolation;
  failures land in DLQ, never crash the job.

## 9. Out of scope (v1)

DOCX/XLSX reading, sharing folders with family members, in-browser editing,
auto-linking docs to transactions/portfolios.

## 10. Open items for review

- Plan tier for the feature (default PLUS).
- Fuzzy-match threshold (start strict; tune on fixtures).
