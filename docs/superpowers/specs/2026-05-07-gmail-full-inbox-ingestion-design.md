# Gmail Full-Inbox Financial Document Ingestion — Design

**Status:** Draft
**Author:** Het Kothari (with Claude Opus 4.7)
**Created:** 2026-05-07
**Supersedes (in part):** the `MonitoredSender`-based discovery flow described in CLAUDE.md §6.2 and §6.6.

## Goal

When a user connects their Gmail, the system scans the entire inbox (within
a user-chosen lookback window), surfaces every financial-document attachment
in a unified approval queue, and routes approved documents through the
existing parser + projection pipeline. The user never has to add senders or
labels.

The current pipeline requires the user to configure individual
`MonitoredSender` rows; the resulting scan returns no usable output for
typical inboxes. This design replaces that flow with attachment-pivot
classification driven by Anthropic Haiku.

## Locked decisions

| # | Decision | Value |
|---|----------|-------|
| 1 | Discovery method | Attachment-only — index every email with a PDF/XLSX/XLS/CSV attachment via Gmail's `has:attachment filename:…` query. Body-only events (UPI alerts, dividend credits) are out of scope. |
| 2 | Lookback window | User-configurable on connect; default 5 years; max 10 years. |
| 3 | Document-type coverage at v1 | Existing parsers only (Zerodha contract notes, generic broker contract notes via LLM, CAMS/KFintech CAS, NSDL/CDSL CAS, generic CSV/XLSX, EPF passbook). Bank statements, credit-card statements, FD certs, insurance, salary slips are recognised + queued for approval but parsing is "no parser yet" — file is preserved + viewable, no projection. |
| 4 | Approval UX | Per-document with bulk operations (approve all from sender, reject batch) **and** a per-sender auto-approve threshold rule (first N approvals → future docs from that sender auto-approve). |
| 5 | Scan UX | Background Bull job + dashboard widget; live trickle into the approval queue while the scan continues. |
| 6 | Onboarding | Optional with persistent dashboard CTA (no signup blocker). When the user explicitly clicks **Connect Gmail**, the post-OAuth flow shows a date-range picker before launching the scan. |
| 7 | Approval-queue location | New tab inside `/reports`. Preview via existing OnlyOffice integration. |
| 8 | Parser-quality fixes | Out of scope for this spec. The companion `2026-05-06-contract-note-ingestion-pending.md` plan owns recipe synthesis. Approved docs go through whatever parser exists today. |

## High-level architecture

```
User signs in
  └─► persistent dashboard CTA: "Connect your Gmail"
       └─► OAuth callback → date-range picker (default 5y)
            └─► creates GmailScanJob (status PENDING)
                 └─► Bull worker picks it up

GmailScanJob worker (gmailScanWorker.ts)
  Phase 1 — LISTING: Gmail API users.messages.list with
    q="has:attachment after:YYYY/MM/DD before:YYYY/MM/DD
       (filename:pdf OR filename:xlsx OR filename:xls OR filename:csv)"
    Paginated, cursor persisted on every page so a Bull retry resumes
    mid-listing rather than re-paginating.
  Phase 2 — DOWNLOADING + DEDUP: per (message, attachment), download
    bytes, sha256 → contentHash. If contentHash already exists in
    ImportJob, mark GmailDiscoveredDoc as DUPLICATE. Otherwise persist
    bytes to UPLOAD_DIR/gmail-imports/${userId}/${YYYY-MM}/.
  Phase 3 — CLASSIFYING: Anthropic Haiku tool-use call per attachment
    (5 in parallel). Inputs: filename, sender, subject, first 4KB of
    extracted text (PII-redacted). Outputs: is_financial, doc_type,
    confidence, suggested_parser. Budget-cap aware.
  Phase 4 — AUTO-APPROVE SWEEP: pick up any PENDING_APPROVAL doc that
    matches a GmailAutoApproveRule and promote it to ImportJob.

Approval queue UI (/reports → "Inbox imports" tab)
  Live polled list of GmailDiscoveredDoc rows.
  Filters: status, sender, doc type.
  Bulk actions: Approve / Reject selected, "+ Auto-approve from sender".
  Per-row Preview opens OnlyOffice modal (reuses DocumentEditorModal).

On Approve
  Insert ImportJob (file path = saved storagePath, type inferred from
  filename), enqueue existing import worker.
  GmailDiscoveredDoc.status → APPROVED → IMPORTING → IMPORTED |
  PARSE_FAILED based on ImportJob outcome.

On Reject
  Status → REJECTED. Optional "+ never again from this sender" creates a
  disabled GmailAutoApproveRule (rule with enabled=false acts as a
  blocklist; future scans auto-reject).
```

## Data model

### New tables

```prisma
model GmailScanJob {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  mailboxId       String
  mailbox         MailboxAccount @relation(fields: [mailboxId], references: [id])

  lookbackFrom    DateTime @db.Date
  lookbackTo      DateTime @db.Date

  status          GmailScanStatus  @default(PENDING)

  totalMessages         Int?
  processedMessages     Int @default(0)
  attachmentsFound      Int @default(0)
  attachmentsClassified Int @default(0)
  attachmentsKept       Int @default(0)

  nextPageToken   String?

  errorMessage    String?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime @default(now())

  documents       GmailDiscoveredDoc[]

  @@index([userId, status])
  @@index([mailboxId, status])
}

enum GmailScanStatus {
  PENDING
  LISTING
  DOWNLOADING
  CLASSIFYING
  COMPLETED
  FAILED
  CANCELLED
}

model GmailDiscoveredDoc {
  id                   String   @id @default(cuid())
  userId               String
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scanJobId            String
  scanJob              GmailScanJob @relation(fields: [scanJobId], references: [id], onDelete: Cascade)

  gmailMessageId       String
  gmailAttachmentId    String
  fromAddress          String
  subject              String
  receivedAt           DateTime
  fileName             String
  fileSize             Int
  mimeType             String
  contentHash          String

  isFinancial          Boolean?
  classifiedDocType    String?
  classifierConfidence Decimal? @db.Decimal(3,2)
  suggestedParser      String?
  classifierNotes      String?
  classifierTokensIn   Int?
  classifierTokensOut  Int?

  storagePath          String

  status               GmailDocStatus @default(CLASSIFYING)

  importJobId          String?
  importJob            ImportJob? @relation(fields: [importJobId], references: [id], onDelete: SetNull)
  rejectedReason       String?

  approvedAt           DateTime?
  rejectedAt           DateTime?
  importedAt           DateTime?

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  @@unique([userId, gmailMessageId, gmailAttachmentId])
  @@unique([userId, contentHash])
  @@index([userId, status, receivedAt])
  @@index([scanJobId, status])
  @@index([userId, fromAddress, isFinancial])
}

enum GmailDocStatus {
  CLASSIFYING
  PENDING_APPROVAL
  NOT_FINANCIAL
  DUPLICATE
  APPROVED
  IMPORTING
  IMPORTED
  PARSE_FAILED
  REJECTED
}

model GmailAutoApproveRule {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fromAddress     String
  docType         String?
  enabled         Boolean  @default(true)
  approvedCount   Int      @default(0)
  lastUsedAt      DateTime?
  createdAt       DateTime @default(now())

  @@unique([userId, fromAddress, docType])
  @@index([userId, enabled])
}
```

### Existing tables touched

- `ImportJob` — add `gmailDocId String?` (nullable FK to `GmailDiscoveredDoc`).
- `MailboxAccount` — no change.
- `MonitoredSender` — kept for backward compatibility but unused by the new
  pipeline. Can be removed in a follow-up cleanup once the old discovery
  flow is fully retired.

## Worker logic

File: `packages/api/src/jobs/gmailScanWorker.ts`. Bull queue named
`gmail-scan`, concurrency 2 per worker, timeout 30 min, retries 3 with
exponential backoff. Each phase guards on the row's current `status` and
is idempotent so a Bull retry from any phase boundary picks up where the
previous attempt left off.

**Phase 1 — LISTING.** Calls `users.messages.list` with the attachment
query. Persists `nextPageToken` after each page. Filters out messages
whose attachment filenames match `/(unsubscribe|newsletter|promotion)/i`
to avoid burning download bandwidth on marketing.

**Phase 2 — DOWNLOADING + DEDUP.** For each (message, attachment):

1. `users.messages.attachments.get` → base64 → bytes.
2. `contentHash = sha256(bytes)`.
3. If `ImportJob.contentHash` matches an existing row, write a
   `GmailDiscoveredDoc` with status `DUPLICATE` (no further work).
4. Otherwise save bytes to disk and create the `GmailDiscoveredDoc` with
   status `CLASSIFYING`.
5. Apply matching `GmailAutoApproveRule` rows immediately:
   - `enabled=true` rule → fast-path through PHASE 4 once classification
     succeeds.
   - `enabled=false` rule (blocklist) → status `REJECTED`.

**Phase 3 — CLASSIFYING.** Batches of 5 parallel Haiku calls. Per-call:

1. Run bytes through `decryptIfNeeded` (handles password-protected PDFs
   automatically using the user's saved passwords; if locked the doc is
   surfaced with `classifiedDocType=null` + `classifierNotes='locked'` so
   the user can supply a password from the UI).
2. Build prompt input: `{filename, sender, subject, redactedFirst4KB}`.
3. Tool-use call (schema below).
4. On budget cap: stop the phase, set scan status `COMPLETED` with
   `errorMessage` describing the cap; remaining `CLASSIFYING` rows can be
   resumed via `POST /api/gmail/scan-jobs/:id/resume` after cap reset.
5. Persist classifier output. `is_financial=false` → status
   `NOT_FINANCIAL`. Otherwise → `PENDING_APPROVAL`.

**Phase 4 — AUTO-APPROVE SWEEP.** For each `PENDING_APPROVAL` doc, find a
matching enabled `GmailAutoApproveRule` (by `(fromAddress, docType)` then
fall back to `(fromAddress, NULL)`). If found, mark `APPROVED` and queue
the import projection (see "Approval → projection" below). Bump
`approvedCount` and `lastUsedAt` on the rule.

### LLM classifier prompt

System prompt:

```
You are a financial document classifier. Decide if the supplied file is
a financial transaction document — contract notes, CAS statements, bank
statements, credit-card statements, FD certificates, insurance premium
receipts, mutual fund AMC statements, or salary slips with structured
pay data — and NOT a marketing email, OTP confirmation, generic invoice,
or newsletter.
```

Tool input schema (`tools[0].input_schema`):

```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "required": ["is_financial", "doc_type", "confidence", "reason"],
  "properties": {
    "is_financial": { "type": "boolean" },
    "doc_type": {
      "type": "string",
      "enum": [
        "CONTRACT_NOTE", "CAS", "BANK_STATEMENT", "CC_STATEMENT",
        "FD_CERTIFICATE", "INSURANCE", "MF_STATEMENT", "SALARY_SLIP",
        "TAX_DOCUMENT", "OTHER", "NOT_FINANCIAL"
      ]
    },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "suggested_parser": { "type": ["string", "null"] },
    "reason": { "type": "string" }
  }
}
```

User payload concatenates `filename`, `sender`, `subject`, and the first
4KB of extracted text after `redactForLlm` (existing PII redaction —
PAN/Aadhaar/account numbers masked).

Threshold: `is_financial=true && confidence >= 0.4` → keep. Otherwise →
`NOT_FINANCIAL`.

### Approval → projection

`packages/api/src/services/gmailDocApproval.service.ts`:

1. Look up `GmailDiscoveredDoc` by id.
2. Insert `ImportJob` row with `filePath = storagePath`,
   `type = inferTypeFromFileName(fileName)`,
   `gmailDocId = doc.id`, `gmailMessageId = doc.gmailMessageId`,
   `contentHash = doc.contentHash`.
3. Enqueue the existing `import` Bull job — runs the same parser +
   projection pipeline as a manual `/import` upload.
4. Worker completion hook (added to `import.service.ts::processImportJob`)
   mirrors outcome back to the doc:
   - `ImportJob.status = COMPLETED | COMPLETED_WITH_ERRORS` →
     `doc.status = IMPORTED`.
   - `ImportJob.status = FAILED | NEEDS_PASSWORD` →
     `doc.status = PARSE_FAILED` with link to the failing
     `IngestionFailure` record.

## API endpoints

All authenticated, all behind RLS via `prisma.$extends` middleware:

```
POST   /api/gmail/scan-jobs                  body: { lookbackFrom, lookbackTo }
GET    /api/gmail/scan-jobs                  list user scan jobs
GET    /api/gmail/scan-jobs/:id              one job (polled for progress)
POST   /api/gmail/scan-jobs/:id/cancel       cancel running scan
POST   /api/gmail/scan-jobs/:id/resume       resume CLASSIFYING after budget reset

GET    /api/gmail/discovered-docs            ?status&fromAddress&docType&scanJobId&cursor
GET    /api/gmail/discovered-docs/:id        single doc
GET    /api/gmail/discovered-docs/:id/preview-url   signed OnlyOffice preview URL
POST   /api/gmail/discovered-docs/:id/approve       optional { createAutoApproveRule: boolean }
POST   /api/gmail/discovered-docs/:id/reject        optional { reason, blocklist: boolean }
POST   /api/gmail/discovered-docs/bulk-approve      { ids: string[], createAutoApproveRule? }
POST   /api/gmail/discovered-docs/bulk-reject       { ids: string[], reason?, blocklist? }

GET    /api/gmail/auto-approve-rules
POST   /api/gmail/auto-approve-rules                { fromAddress, docType?, enabled }
DELETE /api/gmail/auto-approve-rules/:id
```

`preview-url` returns a JWT-signed OnlyOffice URL identical in structure
to `/api/documents/:id/oo-download` — reuses `signedDownloadToken`.

## Frontend

### Onboarding

`apps/web/src/pages/dashboard/DashboardPage.tsx`:

- If no active `MailboxAccount` with `provider='GMAIL_OAUTH'`: render a
  persistent `<ConnectGmailCard />` with benefit copy + "Connect Gmail"
  CTA.
- If a scan is running: render `<GmailScanProgressCard />` with progress
  bar based on `processedMessages / totalMessages`, "X financial docs
  found", and a "Review docs" link to `/reports?tab=inbox-imports`.

`apps/web/src/pages/mailboxes/GmailCallbackPage.tsx` — extend so a
successful callback navigates to a new
`apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx`. The setup page:

1. Shows a date-range picker (default `today - 5y → today`, max 10y).
2. Shows estimated email count via a quick `users.messages.list` HEAD
   call with `pageToken=null`.
3. "Start Scan" button → `POST /api/gmail/scan-jobs` →
   `navigate('/reports?tab=inbox-imports')`.

### Reports tab — `Inbox imports`

`apps/web/src/pages/reports/ReportsPage.tsx` — add tab between the
existing Reports list and `RecentEmailImports`.

Layout:

```
[ Filters bar ]                                 [ Bulk approve ] [ Bulk reject ]
  status:  All | Pending | Approved | Rejected | Not financial | Duplicate
  sender:  autocomplete from distinct fromAddress
  type:    All | CONTRACT_NOTE | CAS | BANK_STATEMENT | …

[ Live progress strip if scan in non-terminal status ]
  "Scanning your inbox — 1,247 / 8,500 emails • 47 financial docs found"

[ Table ]
  ☐ [icon] fileName            sender              date      conf%   [status]   [Preview] [Approve] [Reject] [✓ Auto-approve from sender]
  ☐ ...
```

Click on `fileName` opens `<InboxImportPreviewSheet>` — wraps the existing
`DocumentEditorModal` in view-only mode. Approve / Reject buttons inside
the sheet mirror the row buttons.

Polling: TanStack Query with `refetchInterval: 3000` while any visible
row has `status in (CLASSIFYING)` or any `GmailScanJob` is in a
non-terminal state.

New components:

```
apps/web/src/components/upload/InboxImportRow.tsx
apps/web/src/components/upload/InboxImportPreviewSheet.tsx
apps/web/src/components/dashboard/ConnectGmailCard.tsx
apps/web/src/components/dashboard/GmailScanProgressCard.tsx
apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx
```

## Security

- Gmail tokens already encrypted at rest via `encryptSecret` (`lib/secrets.ts`).
- Attachment bytes saved to `UPLOAD_DIR/gmail-imports/${userId}/...`. The
  per-user directory + RLS-checked download endpoint keeps cross-user
  access blocked even if a path is leaked.
- Every Haiku call goes through `redactForLlm` (existing). PAN, Aadhaar,
  account numbers masked before crossing the API boundary.
- Audit log entries (existing `AuditLog` table) for every Approve /
  Reject action.

## Failure modes

| Mode | Behaviour |
|------|-----------|
| Gmail API 429 | Exponential backoff per `Retry-After`. Bull retries up to 3 times. |
| Gmail token revoked mid-scan | Scan FAILS with `errorMessage='reconnect Gmail'`. Dashboard CTA resurfaces. |
| Attachment download error (size cap, 5xx) | Doc skipped, `IngestionFailure` row written, scan continues. |
| LLM `api_error` after 2 retries | Doc stays in `CLASSIFYING`; user can manually classify from the row's overflow menu. |
| LLM budget capped | Scan completes with the docs already classified; remainder waits for `POST /scan-jobs/:id/resume`. |
| Password-protected attachment | `decryptIfNeeded` tries saved passwords; if all fail, doc moves to `PENDING_APPROVAL` with `classifierNotes='locked'`. The Approve action is replaced by a "Provide password" inline action that re-runs classification + parsing. |
| Scan job stuck in `CLASSIFYING` for >2h | Cron `gmailScanWatchdog` moves job to FAILED with hint to resume. |

## Testing

- **Unit**: classifier prompt → tool-use response is a valid `ParsedClassification`. Snapshot the system prompt + a mocked Haiku response.
- **Integration**: end-to-end test using `nock` to mock Gmail API responses and the Anthropic SDK (mocked via the existing test patterns in `packages/api/test/ingestion/`). Asserts: a CAS attachment with a known content-hash dedups against an existing `ImportJob`; a contract note attachment is classified `CONTRACT_NOTE` and projects on approve; an approved doc with a broken parser lands in `PARSE_FAILED` with a DLQ link.
- **Manual QA checklist** in `test/manual-qa-gmail-ingestion.md`:
  - Connect Gmail with a 5y inbox, watch progress bar.
  - Approve a contract note → confirms appearance in `/import` history with `gmailDocId` set.
  - Reject with "blocklist this sender" → re-run scan, confirm sender's docs auto-rejected.
  - Auto-approve threshold: approve 5 from same sender → next scan shows them auto-approved.
  - Cancel a running scan mid-flight → status `CANCELLED`, no orphaned files.
  - Disconnect Gmail with a running scan → status `FAILED`.

## Migration

`packages/api/prisma/migrations/20260507120000_gmail_full_inbox_pipeline/migration.sql`:

1. `CREATE TYPE "GmailScanStatus" AS ENUM (…)`.
2. `CREATE TYPE "GmailDocStatus" AS ENUM (…)`.
3. `CREATE TABLE "GmailScanJob"`, `"GmailDiscoveredDoc"`, `"GmailAutoApproveRule"`.
4. `ALTER TABLE "ImportJob" ADD COLUMN "gmailDocId" TEXT`.
5. RLS policies on all three new tables, mirroring the pattern in CLAUDE.md §3.6.

No data backfill required. Existing `MonitoredSender` rows are left
untouched.

## Out of scope

- Body-only event extraction (UPI/dividend credits).
- Bank statement, credit card, FD certificate, insurance, salary slip
  parsers — these documents will be discovered + queued + previewable
  but parsing is "no parser yet" until each parser ships separately.
- Per-broker recipe synthesis — owned by the
  `2026-05-06-contract-note-ingestion-pending.md` plan.
- Gmail label management — not used by this pipeline.
- IMAP fallback — Gmail OAuth only.
- Multi-Gmail-account support — one connected Gmail per user (existing
  `MailboxAccount` schema supports many; spec scope assumes one for the
  primary scan flow).
