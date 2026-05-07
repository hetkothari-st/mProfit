# Gmail Full-Inbox Financial Document Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `MonitoredSender`-based discovery flow with an attachment-pivot full-inbox classifier that surfaces every financial document into a single approval queue under `/reports`, then routes approvals through the existing parser pipeline.

**Architecture:** A Bull worker (`gmailScanWorker`) pages through Gmail with `has:attachment filename:pdf|xlsx|xls|csv`, downloads each attachment, dedups against `ImportJob.contentHash`, calls Anthropic Haiku tool-use to classify each one, and writes `GmailDiscoveredDoc` rows. Frontend polls a new `/api/gmail/discovered-docs` endpoint, shows them in a new `Inbox imports` tab on `/reports` with bulk approve/reject + per-sender auto-approve rules. On approve, an `ImportJob` is created using the saved attachment bytes and the existing `processImportJob` runs untouched.

**Tech Stack:** Node 20 + Express + Prisma + Bull (`packages/api`), React 18 + Vite + shadcn/ui + TanStack Query (`apps/web`), Postgres 15, Anthropic Haiku via existing `parseEmailWithLlm` pattern (we add a parallel `classifyAttachmentWithLlm`), googleapis SDK (already a dep).

**Spec:** [`portfolioos/docs/superpowers/specs/2026-05-07-gmail-full-inbox-ingestion-design.md`](../specs/2026-05-07-gmail-full-inbox-ingestion-design.md).

---

## File Structure

### New files (backend)

| Path | Responsibility |
|------|----------------|
| `packages/api/prisma/migrations/20260507120000_gmail_full_inbox_pipeline/migration.sql` | Schema migration for the three new tables + ImportJob FK. |
| `packages/api/src/lib/gmailClassifier.ts` | Anthropic Haiku tool-use call that classifies one attachment. Mirrors `parseEmailWithLlm` shape but returns `ClassificationResult`. |
| `packages/api/src/lib/gmailMessageLister.ts` | Thin wrapper around `gmail.users.messages.list/get/attachments.get` with cursor support + filename keyword filter. |
| `packages/api/src/services/gmailScanJobs.service.ts` | CRUD on `GmailScanJob`. |
| `packages/api/src/services/gmailDiscoveredDocs.service.ts` | CRUD + filtering on `GmailDiscoveredDoc`. |
| `packages/api/src/services/gmailAutoApproveRules.service.ts` | CRUD on `GmailAutoApproveRule`. |
| `packages/api/src/services/gmailDocApproval.service.ts` | Promote a discovered doc to an `ImportJob` and queue the existing import worker. |
| `packages/api/src/jobs/gmailScanWorker.ts` | Bull worker — runs Phase 1–4 of the scan pipeline. Idempotent per phase. |
| `packages/api/src/controllers/gmailScan.controller.ts` | All `/api/gmail/scan-jobs`, `/api/gmail/discovered-docs`, `/api/gmail/auto-approve-rules` handlers. |
| `packages/api/src/routes/gmailScan.routes.ts` | Express router for the above. |
| `packages/api/test/jobs/gmailScanWorker.test.ts` | Vitest for worker phases (Gmail API + Anthropic mocked). |
| `packages/api/test/lib/gmailClassifier.test.ts` | Vitest for classifier prompt + response parse. |

### New files (shared types)

| Path | Responsibility |
|------|----------------|
| `packages/shared/src/types/gmailIngestion.ts` | DTOs for scan jobs, discovered docs, auto-approve rules + status enums + `INBOX_DOC_TYPES` const. |

### New files (frontend)

| Path | Responsibility |
|------|----------------|
| `apps/web/src/api/gmailScan.api.ts` | TanStack-friendly client wrapping all new endpoints. |
| `apps/web/src/components/dashboard/ConnectGmailCard.tsx` | Persistent CTA on dashboard when no Gmail connected. |
| `apps/web/src/components/dashboard/GmailScanProgressCard.tsx` | Live progress for a non-terminal scan. |
| `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx` | Date-range picker shown after OAuth callback. |
| `apps/web/src/components/upload/InboxImportRow.tsx` | One-row component for the queue. |
| `apps/web/src/components/upload/InboxImportPreviewSheet.tsx` | Side-panel preview wrapping OnlyOffice. |
| `apps/web/src/pages/reports/InboxImportsTab.tsx` | The full tab body (filter bar + table + bulk actions). |

### Modified files

| Path | Change |
|------|--------|
| `packages/api/prisma/schema.prisma` | Add three models, two enums, FK on `ImportJob`. |
| `packages/api/src/index.ts` | Mount `gmailScanRouter`, register `gmailScanQueue`. |
| `packages/api/src/lib/queue.ts` | Add `getGmailScanQueue()` factory. |
| `packages/api/src/services/imports/import.service.ts` | After job completes, mirror outcome into `GmailDiscoveredDoc` if `gmailDocId` present. |
| `apps/web/src/pages/reports/ReportsPage.tsx` | Add `Inbox imports` tab. |
| `apps/web/src/pages/dashboard/DashboardPage.tsx` | Mount `ConnectGmailCard` / `GmailScanProgressCard`. |
| `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx` | After successful callback, navigate to `GmailScanSetupPage` instead of `/ingestion?auto-discover=1`. |
| `apps/web/src/App.tsx` | Add `/gmail/scan-setup` route. |

---

## Task 1: Prisma schema additions

**Files:**
- Modify: `packages/api/prisma/schema.prisma`

- [ ] **Step 1: Add the new models + enums to the schema**

Add at the END of `schema.prisma` (after the existing `ImportStatus` enum block):

```prisma
// ─── GMAIL FULL-INBOX INGESTION ──────────────────────────────────

model GmailScanJob {
  id              String          @id @default(cuid())
  userId          String
  user            User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  mailboxId       String
  mailbox         MailboxAccount  @relation(fields: [mailboxId], references: [id])

  lookbackFrom    DateTime        @db.Date
  lookbackTo      DateTime        @db.Date

  status          GmailScanStatus @default(PENDING)

  totalMessages         Int?
  processedMessages     Int       @default(0)
  attachmentsFound      Int       @default(0)
  attachmentsClassified Int       @default(0)
  attachmentsKept       Int       @default(0)

  nextPageToken   String?

  errorMessage    String?
  startedAt       DateTime?
  completedAt     DateTime?
  createdAt       DateTime        @default(now())

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
  id                   String         @id @default(cuid())
  userId               String
  user                 User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  scanJobId            String
  scanJob              GmailScanJob   @relation(fields: [scanJobId], references: [id], onDelete: Cascade)

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
  classifierConfidence Decimal?       @db.Decimal(3, 2)
  suggestedParser      String?
  classifierNotes      String?
  classifierTokensIn   Int?
  classifierTokensOut  Int?

  storagePath          String

  status               GmailDocStatus @default(CLASSIFYING)

  importJobId          String?
  importJob            ImportJob?     @relation(fields: [importJobId], references: [id], onDelete: SetNull)
  rejectedReason       String?

  approvedAt           DateTime?
  rejectedAt           DateTime?
  importedAt           DateTime?

  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

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

- [ ] **Step 2: Add relations to existing models**

In the `User` model relations block (find the existing section around line ~50–95), add:

```prisma
  gmailScanJobs        GmailScanJob[]
  gmailDiscoveredDocs  GmailDiscoveredDoc[]
  gmailAutoApproveRules GmailAutoApproveRule[]
```

In the `MailboxAccount` model, add the back-reference:

```prisma
  gmailScanJobs GmailScanJob[]
```

In the `ImportJob` model, add:

```prisma
  gmailDocId          String?
  gmailDiscoveredDocs GmailDiscoveredDoc[]
```

- [ ] **Step 3: Generate the Prisma client**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Commit**

```bash
git add portfolioos/packages/api/prisma/schema.prisma
git commit -m "feat(schema): GmailScanJob + GmailDiscoveredDoc + GmailAutoApproveRule models"
```

---

## Task 2: Migration SQL

**Files:**
- Create: `packages/api/prisma/migrations/20260507120000_gmail_full_inbox_pipeline/migration.sql`

- [ ] **Step 1: Write the migration**

Create the file with:

```sql
-- Gmail full-inbox ingestion pipeline.
-- Replaces the MonitoredSender-based discovery flow with an
-- attachment-pivot classifier-driven approval queue.

CREATE TYPE "GmailScanStatus" AS ENUM (
  'PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING',
  'COMPLETED', 'FAILED', 'CANCELLED'
);

CREATE TYPE "GmailDocStatus" AS ENUM (
  'CLASSIFYING', 'PENDING_APPROVAL', 'NOT_FINANCIAL', 'DUPLICATE',
  'APPROVED', 'IMPORTING', 'IMPORTED', 'PARSE_FAILED', 'REJECTED'
);

CREATE TABLE "GmailScanJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "lookbackFrom" DATE NOT NULL,
  "lookbackTo" DATE NOT NULL,
  "status" "GmailScanStatus" NOT NULL DEFAULT 'PENDING',
  "totalMessages" INTEGER,
  "processedMessages" INTEGER NOT NULL DEFAULT 0,
  "attachmentsFound" INTEGER NOT NULL DEFAULT 0,
  "attachmentsClassified" INTEGER NOT NULL DEFAULT 0,
  "attachmentsKept" INTEGER NOT NULL DEFAULT 0,
  "nextPageToken" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "GmailScanJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailScanJob_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "GmailScanJob_mailboxId_fkey" FOREIGN KEY ("mailboxId")
    REFERENCES "MailboxAccount"("id") ON DELETE CASCADE
);
CREATE INDEX "GmailScanJob_userId_status_idx" ON "GmailScanJob"("userId", "status");
CREATE INDEX "GmailScanJob_mailboxId_status_idx" ON "GmailScanJob"("mailboxId", "status");

CREATE TABLE "GmailDiscoveredDoc" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scanJobId" TEXT NOT NULL,
  "gmailMessageId" TEXT NOT NULL,
  "gmailAttachmentId" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "mimeType" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "isFinancial" BOOLEAN,
  "classifiedDocType" TEXT,
  "classifierConfidence" DECIMAL(3,2),
  "suggestedParser" TEXT,
  "classifierNotes" TEXT,
  "classifierTokensIn" INTEGER,
  "classifierTokensOut" INTEGER,
  "storagePath" TEXT NOT NULL,
  "status" "GmailDocStatus" NOT NULL DEFAULT 'CLASSIFYING',
  "importJobId" TEXT,
  "rejectedReason" TEXT,
  "approvedAt" TIMESTAMPTZ,
  "rejectedAt" TIMESTAMPTZ,
  "importedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "GmailDiscoveredDoc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailDiscoveredDoc_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "GmailDiscoveredDoc_scanJobId_fkey" FOREIGN KEY ("scanJobId")
    REFERENCES "GmailScanJob"("id") ON DELETE CASCADE,
  CONSTRAINT "GmailDiscoveredDoc_importJobId_fkey" FOREIGN KEY ("importJobId")
    REFERENCES "ImportJob"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "GmailDiscoveredDoc_userId_message_attachment_idx"
  ON "GmailDiscoveredDoc"("userId", "gmailMessageId", "gmailAttachmentId");
CREATE UNIQUE INDEX "GmailDiscoveredDoc_userId_contentHash_idx"
  ON "GmailDiscoveredDoc"("userId", "contentHash");
CREATE INDEX "GmailDiscoveredDoc_userId_status_receivedAt_idx"
  ON "GmailDiscoveredDoc"("userId", "status", "receivedAt");
CREATE INDEX "GmailDiscoveredDoc_scanJobId_status_idx"
  ON "GmailDiscoveredDoc"("scanJobId", "status");
CREATE INDEX "GmailDiscoveredDoc_userId_fromAddress_isFinancial_idx"
  ON "GmailDiscoveredDoc"("userId", "fromAddress", "isFinancial");

CREATE TABLE "GmailAutoApproveRule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromAddress" TEXT NOT NULL,
  "docType" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "approvedCount" INTEGER NOT NULL DEFAULT 0,
  "lastUsedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "GmailAutoApproveRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailAutoApproveRule_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "GmailAutoApproveRule_userId_from_docType_idx"
  ON "GmailAutoApproveRule"("userId", "fromAddress", "docType");
CREATE INDEX "GmailAutoApproveRule_userId_enabled_idx"
  ON "GmailAutoApproveRule"("userId", "enabled");

ALTER TABLE "ImportJob"
  ADD COLUMN "gmailDocId" TEXT;
```

- [ ] **Step 2: Apply the migration**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec prisma migrate deploy`
Expected: "Applying migration `20260507120000_gmail_full_inbox_pipeline`" then "All migrations have been successfully applied."

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/prisma/migrations/20260507120000_gmail_full_inbox_pipeline
git commit -m "feat(db): migrate gmail full-inbox pipeline tables"
```

---

## Task 3: Shared types

**Files:**
- Create: `packages/shared/src/types/gmailIngestion.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Create the shared types file**

Create `packages/shared/src/types/gmailIngestion.ts`:

```ts
export const GmailScanStatus = {
  PENDING: 'PENDING',
  LISTING: 'LISTING',
  DOWNLOADING: 'DOWNLOADING',
  CLASSIFYING: 'CLASSIFYING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type GmailScanStatus = (typeof GmailScanStatus)[keyof typeof GmailScanStatus];

export const GmailDocStatus = {
  CLASSIFYING: 'CLASSIFYING',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  NOT_FINANCIAL: 'NOT_FINANCIAL',
  DUPLICATE: 'DUPLICATE',
  APPROVED: 'APPROVED',
  IMPORTING: 'IMPORTING',
  IMPORTED: 'IMPORTED',
  PARSE_FAILED: 'PARSE_FAILED',
  REJECTED: 'REJECTED',
} as const;
export type GmailDocStatus = (typeof GmailDocStatus)[keyof typeof GmailDocStatus];

export const GMAIL_DOC_STATUS_LABELS: Record<GmailDocStatus, string> = {
  CLASSIFYING: 'Classifying',
  PENDING_APPROVAL: 'Pending review',
  NOT_FINANCIAL: 'Not financial',
  DUPLICATE: 'Already imported',
  APPROVED: 'Approved',
  IMPORTING: 'Importing',
  IMPORTED: 'Imported',
  PARSE_FAILED: 'Parse failed',
  REJECTED: 'Rejected',
};

export const INBOX_DOC_TYPES = [
  'CONTRACT_NOTE',
  'CAS',
  'BANK_STATEMENT',
  'CC_STATEMENT',
  'FD_CERTIFICATE',
  'INSURANCE',
  'MF_STATEMENT',
  'SALARY_SLIP',
  'TAX_DOCUMENT',
  'OTHER',
  'NOT_FINANCIAL',
] as const;
export type InboxDocType = (typeof INBOX_DOC_TYPES)[number];

export interface GmailScanJobDTO {
  id: string;
  userId: string;
  mailboxId: string;
  lookbackFrom: string;
  lookbackTo: string;
  status: GmailScanStatus;
  totalMessages: number | null;
  processedMessages: number;
  attachmentsFound: number;
  attachmentsClassified: number;
  attachmentsKept: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface GmailDiscoveredDocDTO {
  id: string;
  scanJobId: string;
  gmailMessageId: string;
  gmailAttachmentId: string;
  fromAddress: string;
  subject: string;
  receivedAt: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isFinancial: boolean | null;
  classifiedDocType: InboxDocType | null;
  classifierConfidence: string | null;
  classifierNotes: string | null;
  status: GmailDocStatus;
  importJobId: string | null;
  rejectedReason: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  importedAt: string | null;
  createdAt: string;
}

export interface GmailAutoApproveRuleDTO {
  id: string;
  fromAddress: string;
  docType: string | null;
  enabled: boolean;
  approvedCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateScanJobInput {
  lookbackFrom: string;
  lookbackTo: string;
}

export interface BulkApproveInput {
  ids: string[];
  createAutoApproveRule?: boolean;
}

export interface BulkRejectInput {
  ids: string[];
  reason?: string;
  blocklist?: boolean;
}
```

- [ ] **Step 2: Re-export from the package barrel**

In `packages/shared/src/index.ts`, append:

```ts
export * from './types/gmailIngestion.js';
```

- [ ] **Step 3: Build the shared package**

Run: `cd portfolioos && pnpm --filter @portfolioos/shared run build`
Expected: clean exit.

- [ ] **Step 4: Commit**

```bash
git add portfolioos/packages/shared/src/types/gmailIngestion.ts portfolioos/packages/shared/src/index.ts
git commit -m "feat(shared): gmail ingestion DTOs + status enums"
```

---

## Task 4: Bull queue factory for the scan worker

**Files:**
- Modify: `packages/api/src/lib/queue.ts`

- [ ] **Step 1: Read the current queue file**

Open `packages/api/src/lib/queue.ts` to see the existing pattern (e.g. `getImportQueue()`).

- [ ] **Step 2: Append the new factory**

Add at the end of the file:

```ts
import type { Queue } from 'bull';

let gmailScanQueue: Queue | null = null;

export function getGmailScanQueue(): Queue {
  if (gmailScanQueue) return gmailScanQueue;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Bull = require('bull') as typeof import('bull');
  gmailScanQueue = new Bull.default('gmail-scan', env.REDIS_URL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      timeout: 30 * 60 * 1000, // 30 min — large inboxes
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
    settings: {
      lockDuration: 5 * 60 * 1000, // 5 min — phases checkpoint frequently
    },
  });
  return gmailScanQueue;
}
```

(If the file already imports `Bull` and `env` at the top, deduplicate — drop the inline `require` and reuse the existing imports. Match the pattern used by `getImportQueue` exactly so the eslint preamble + types match.)

- [ ] **Step 3: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add portfolioos/packages/api/src/lib/queue.ts
git commit -m "feat(jobs): bull queue factory for gmail-scan"
```

---

## Task 5: Gmail message lister helper

**Files:**
- Create: `packages/api/src/lib/gmailMessageLister.ts`

- [ ] **Step 1: Write the helper**

Create the file:

```ts
import { google, type gmail_v1 } from 'googleapis';
import { getOAuthClientForMailbox } from '../connectors/gmail.connector.js';
import { logger } from './logger.js';

/**
 * Wraps the parts of the Gmail REST API the scan worker needs.
 * Centralised so quota / retry / typed-response handling lives in one place.
 */

export interface GmailMessageHeader {
  messageId: string;
  threadId: string;
  fromAddress: string;
  subject: string;
  receivedAt: Date;
}

export interface GmailAttachmentMeta {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface GmailMessageWithAttachments {
  header: GmailMessageHeader;
  attachments: GmailAttachmentMeta[];
}

const ATTACHMENT_QUERY =
  '(filename:pdf OR filename:xlsx OR filename:xls OR filename:csv) has:attachment';

const PROMO_FILENAME_RE = /(unsubscribe|newsletter|promotion|deals?)/i;

function formatDate(d: Date): string {
  // Gmail expects YYYY/MM/DD in `after:` and `before:` filters.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

export function buildScanQuery(lookbackFrom: Date, lookbackTo: Date): string {
  return `${ATTACHMENT_QUERY} after:${formatDate(lookbackFrom)} before:${formatDate(lookbackTo)}`;
}

export async function listMessageIdsPage(
  mailboxId: string,
  query: string,
  pageToken: string | null,
): Promise<{ ids: string[]; nextPageToken: string | null }> {
  const auth = await getOAuthClientForMailbox(mailboxId);
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 500,
    pageToken: pageToken ?? undefined,
  });
  const ids = (res.data.messages ?? []).map((m) => m.id!).filter(Boolean);
  return { ids, nextPageToken: res.data.nextPageToken ?? null };
}

function header(parts: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return (parts ?? []).find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  out: GmailAttachmentMeta[],
): void {
  if (!part) return;
  if (part.body?.attachmentId && part.filename && !PROMO_FILENAME_RE.test(part.filename)) {
    out.push({
      attachmentId: part.body.attachmentId,
      fileName: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      size: part.body.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) walkParts(child, out);
}

export async function fetchMessageWithAttachments(
  mailboxId: string,
  messageId: string,
): Promise<GmailMessageWithAttachments | null> {
  const auth = await getOAuthClientForMailbox(mailboxId);
  const gmail = google.gmail({ version: 'v1', auth });
  let msg;
  try {
    msg = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });
  } catch (err) {
    logger.warn({ err, messageId }, '[gmailLister] message.get failed');
    return null;
  }
  const headers = msg.data.payload?.headers ?? undefined;
  const attachments: GmailAttachmentMeta[] = [];
  walkParts(msg.data.payload, attachments);
  if (attachments.length === 0) return null;
  const dateRaw = header(headers, 'Date');
  return {
    header: {
      messageId,
      threadId: msg.data.threadId ?? '',
      fromAddress: header(headers, 'From'),
      subject: header(headers, 'Subject'),
      receivedAt: dateRaw ? new Date(dateRaw) : new Date(),
    },
    attachments,
  };
}

export async function downloadAttachmentBytes(
  mailboxId: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const auth = await getOAuthClientForMailbox(mailboxId);
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = res.data.data ?? '';
  // Gmail returns base64url — convert to Buffer.
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
```

- [ ] **Step 2: Confirm `getOAuthClientForMailbox` exists in the connector**

Run: `cd portfolioos && grep -n "getOAuthClientForMailbox" packages/api/src/connectors/gmail.connector.ts`
Expected: at least one match. If absent, add a thin export wrapping the existing internal client builder — the gmail connector already builds a `google.auth.OAuth2` client per user; expose it under that name.

- [ ] **Step 3: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add portfolioos/packages/api/src/lib/gmailMessageLister.ts
git commit -m "feat(gmail): message lister helper with attachment walk"
```

---

## Task 6: Anthropic classifier helper — failing test

**Files:**
- Create: `packages/api/test/lib/gmailClassifier.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/api/test/lib/gmailClassifier.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: 'tool_use',
              name: 'classify_attachment',
              input: {
                is_financial: true,
                doc_type: 'CONTRACT_NOTE',
                confidence: 0.92,
                suggested_parser: 'broker.contract_note.generic',
                reason: 'Looks like a Zerodha-style contract note PDF.',
              },
            },
          ],
          usage: { input_tokens: 420, output_tokens: 55 },
        }),
      },
    })),
  };
});

import { classifyAttachmentWithLlm } from '../../src/lib/gmailClassifier.js';

describe('classifyAttachmentWithLlm', () => {
  beforeEach(() => {
    process.env.ENABLE_LLM_PARSER = 'true';
    process.env.ANTHROPIC_API_KEY = 'sk-test';
  });

  it('returns parsed classification on a successful tool_use response', async () => {
    const r = await classifyAttachmentWithLlm({
      userId: 'u1',
      fileName: 'CN_2026.pdf',
      sender: 'noreply@zerodha.com',
      subject: 'Contract note for 7-Apr-2026',
      first4kbText: 'Trade summary symbol: NIFTY ...',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.classification.is_financial).toBe(true);
    expect(r.classification.doc_type).toBe('CONTRACT_NOTE');
    expect(r.classification.confidence).toBeGreaterThan(0.8);
    expect(r.usage.inputTokens).toBe(420);
  });
});
```

- [ ] **Step 2: Run the test, verify failure**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec vitest run test/lib/gmailClassifier.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/gmailClassifier.js'".

- [ ] **Step 3: Commit the failing test**

```bash
git add portfolioos/packages/api/test/lib/gmailClassifier.test.ts
git commit -m "test(gmail): failing test for classifier helper"
```

---

## Task 7: Implement the classifier helper

**Files:**
- Create: `packages/api/src/lib/gmailClassifier.ts`

- [ ] **Step 1: Write the implementation**

Create `packages/api/src/lib/gmailClassifier.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { redactForLlm } from '../ingestion/llm/redact.js';
import { checkBudget, recordSpend } from '../ingestion/llm/budget.js';
import { checkLlmGate } from '../ingestion/llm/client.js';

const ClassificationSchema = z.object({
  is_financial: z.boolean(),
  doc_type: z.enum([
    'CONTRACT_NOTE',
    'CAS',
    'BANK_STATEMENT',
    'CC_STATEMENT',
    'FD_CERTIFICATE',
    'INSURANCE',
    'MF_STATEMENT',
    'SALARY_SLIP',
    'TAX_DOCUMENT',
    'OTHER',
    'NOT_FINANCIAL',
  ]),
  confidence: z.number().min(0).max(1),
  suggested_parser: z.string().nullable().optional(),
  reason: z.string(),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export interface ClassifyInput {
  userId: string;
  fileName: string;
  sender: string;
  subject: string;
  first4kbText: string;
}

export interface ClassifyUsage {
  inputTokens: number;
  outputTokens: number;
  costInr: string;
}

export type ClassifyResult =
  | { ok: true; classification: Classification; usage: ClassifyUsage }
  | { ok: false; reason: 'disabled' | 'missing_api_key' | 'budget_capped' | 'api_error' | 'no_tool_use' | 'validation_error'; message: string };

const SYSTEM_PROMPT = `You are a financial document classifier. Decide if the supplied file is a financial transaction document — contract notes, CAS statements, bank statements, credit-card statements, FD certificates, insurance premium receipts, mutual fund AMC statements, or salary slips with structured pay data — and NOT a marketing email, OTP confirmation, generic invoice, or newsletter.

Return your decision via the classify_attachment tool. confidence below 0.4 means "not sure" — set is_financial=false in that case.`;

const TOOL = {
  name: 'classify_attachment',
  description: 'Emit the classification verdict for a single email attachment.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_financial', 'doc_type', 'confidence', 'reason'],
    properties: {
      is_financial: { type: 'boolean' },
      doc_type: {
        type: 'string',
        enum: [
          'CONTRACT_NOTE',
          'CAS',
          'BANK_STATEMENT',
          'CC_STATEMENT',
          'FD_CERTIFICATE',
          'INSURANCE',
          'MF_STATEMENT',
          'SALARY_SLIP',
          'TAX_DOCUMENT',
          'OTHER',
          'NOT_FINANCIAL',
        ],
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      suggested_parser: { type: ['string', 'null'] },
      reason: { type: 'string' },
    },
  },
} as const;

// Anthropic Haiku 4.5 published pricing (Apr 2026): $0.80/MTok input,
// $4/MTok output. ₹/$ ≈ 83. Convert to INR per token.
const INR_PER_INPUT_TOKEN = new Decimal('0.80').dividedBy(1_000_000).times(83);
const INR_PER_OUTPUT_TOKEN = new Decimal('4').dividedBy(1_000_000).times(83);

export async function classifyAttachmentWithLlm(
  input: ClassifyInput,
): Promise<ClassifyResult> {
  const gate = checkLlmGate();
  if (!gate.ok) {
    return { ok: false, reason: gate.reason, message: gate.message };
  }
  const budget = await checkBudget(input.userId);
  if (budget.status === 'capped') {
    return {
      ok: false,
      reason: 'budget_capped',
      message: `Monthly LLM cap reached (₹${budget.spent.toFixed(2)} / ₹${budget.cap.toFixed(2)})`,
    };
  }

  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });

  const userPayload = `Filename: ${input.fileName}
From: ${input.sender}
Subject: ${input.subject}

--- First 4KB of extracted text (PII-redacted) ---
${redactForLlm(input.first4kbText)}`;

  let resp;
  try {
    resp = await anthropic.messages.create({
      model: env.LLM_MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: userPayload }],
    });
  } catch (err) {
    logger.warn({ err, fileName: input.fileName }, '[gmailClassifier] anthropic api error');
    return { ok: false, reason: 'api_error', message: (err as Error).message };
  }

  const block = resp.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    return { ok: false, reason: 'no_tool_use', message: 'Model did not call the classify tool' };
  }
  const parsed = ClassificationSchema.safeParse(block.input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'validation_error',
      message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }

  const usageRaw = (resp as { usage?: { input_tokens?: number; output_tokens?: number } }).usage ?? {};
  const inputTokens = usageRaw.input_tokens ?? 0;
  const outputTokens = usageRaw.output_tokens ?? 0;
  const costInr = INR_PER_INPUT_TOKEN.times(inputTokens)
    .plus(INR_PER_OUTPUT_TOKEN.times(outputTokens))
    .toFixed(4);

  await recordSpend({
    userId: input.userId,
    sourceRef: `gmail-classifier:${input.fileName}`,
    inputTokens,
    outputTokens,
    costInr: new Decimal(costInr),
  });

  return {
    ok: true,
    classification: parsed.data,
    usage: { inputTokens, outputTokens, costInr },
  };
}
```

- [ ] **Step 2: Run the test, verify pass**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec vitest run test/lib/gmailClassifier.test.ts`
Expected: PASS.

- [ ] **Step 3: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean. (If `recordSpend` / `checkBudget` exports differ, follow the existing `parseEmailWithLlm` import paths in `packages/api/src/ingestion/llm/client.ts` and copy the same imports.)

- [ ] **Step 4: Commit**

```bash
git add portfolioos/packages/api/src/lib/gmailClassifier.ts
git commit -m "feat(gmail): Haiku-based attachment classifier"
```

---

## Task 8: Service — GmailScanJob CRUD

**Files:**
- Create: `packages/api/src/services/gmailScanJobs.service.ts`

- [ ] **Step 1: Write the service**

Create the file:

```ts
import { prisma } from '../lib/prisma.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import { getGmailScanQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';

export interface CreateScanJobInput {
  userId: string;
  mailboxId: string;
  lookbackFrom: Date;
  lookbackTo: Date;
}

export async function createScanJob(input: CreateScanJobInput) {
  if (input.lookbackTo <= input.lookbackFrom) {
    throw new BadRequestError('lookbackTo must be after lookbackFrom');
  }
  const mb = await prisma.mailboxAccount.findFirst({
    where: { id: input.mailboxId, userId: input.userId, provider: 'GMAIL_OAUTH' },
  });
  if (!mb) throw new NotFoundError('Gmail mailbox not found');

  const job = await prisma.gmailScanJob.create({
    data: {
      userId: input.userId,
      mailboxId: input.mailboxId,
      lookbackFrom: input.lookbackFrom,
      lookbackTo: input.lookbackTo,
      status: 'PENDING',
    },
  });
  try {
    const q = getGmailScanQueue();
    await q.add({ scanJobId: job.id });
    logger.info({ jobId: job.id }, '[gmailScan] enqueued');
  } catch (err) {
    logger.warn({ err, jobId: job.id }, '[gmailScan] enqueue failed — manual retry needed');
  }
  return job;
}

export async function listScanJobs(userId: string) {
  return prisma.gmailScanJob.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function getScanJob(userId: string, id: string) {
  const job = await prisma.gmailScanJob.findUnique({ where: { id } });
  if (!job || job.userId !== userId) throw new NotFoundError('Scan job not found');
  return job;
}

export async function cancelScanJob(userId: string, id: string) {
  const job = await getScanJob(userId, id);
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
  return prisma.gmailScanJob.update({
    where: { id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  });
}

export async function resumeScanJob(userId: string, id: string) {
  const job = await getScanJob(userId, id);
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') {
    throw new BadRequestError(`Cannot resume a job in status ${job.status}`);
  }
  // Resume only re-runs the CLASSIFYING phase. The worker handles
  // re-entry by checking row statuses.
  await prisma.gmailScanJob.update({
    where: { id },
    data: { status: 'CLASSIFYING', errorMessage: null, completedAt: null },
  });
  const q = getGmailScanQueue();
  await q.add({ scanJobId: id });
  return getScanJob(userId, id);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/services/gmailScanJobs.service.ts
git commit -m "feat(gmail): GmailScanJob CRUD service"
```

---

## Task 9: Service — GmailDiscoveredDoc CRUD

**Files:**
- Create: `packages/api/src/services/gmailDiscoveredDocs.service.ts`

- [ ] **Step 1: Write the service**

Create:

```ts
import type { GmailDocStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export interface ListDiscoveredDocsParams {
  userId: string;
  status?: GmailDocStatus;
  fromAddress?: string;
  docType?: string;
  scanJobId?: string;
  cursor?: string;
  limit?: number;
}

export async function listDiscoveredDocs(p: ListDiscoveredDocsParams) {
  const limit = Math.min(Math.max(p.limit ?? 50, 1), 200);
  return prisma.gmailDiscoveredDoc.findMany({
    where: {
      userId: p.userId,
      status: p.status,
      fromAddress: p.fromAddress,
      classifiedDocType: p.docType,
      scanJobId: p.scanJobId,
    },
    orderBy: [{ status: 'asc' }, { receivedAt: 'desc' }],
    take: limit,
    skip: p.cursor ? 1 : 0,
    cursor: p.cursor ? { id: p.cursor } : undefined,
  });
}

export async function getDiscoveredDoc(userId: string, id: string) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({ where: { id } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  return doc;
}

export async function listDistinctSenders(userId: string): Promise<string[]> {
  const rows = await prisma.gmailDiscoveredDoc.findMany({
    where: { userId, isFinancial: true },
    distinct: ['fromAddress'],
    select: { fromAddress: true },
    orderBy: { fromAddress: 'asc' },
  });
  return rows.map((r) => r.fromAddress);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/services/gmailDiscoveredDocs.service.ts
git commit -m "feat(gmail): discovered-docs query service"
```

---

## Task 10: Service — auto-approve rules

**Files:**
- Create: `packages/api/src/services/gmailAutoApproveRules.service.ts`

- [ ] **Step 1: Write the service**

Create:

```ts
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

export async function listRules(userId: string) {
  return prisma.gmailAutoApproveRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function upsertRule(input: {
  userId: string;
  fromAddress: string;
  docType?: string | null;
  enabled: boolean;
}) {
  return prisma.gmailAutoApproveRule.upsert({
    where: {
      userId_fromAddress_docType: {
        userId: input.userId,
        fromAddress: input.fromAddress,
        docType: input.docType ?? null,
      },
    },
    create: {
      userId: input.userId,
      fromAddress: input.fromAddress,
      docType: input.docType ?? null,
      enabled: input.enabled,
    },
    update: {
      enabled: input.enabled,
    },
  });
}

export async function deleteRule(userId: string, id: string) {
  const r = await prisma.gmailAutoApproveRule.findUnique({ where: { id } });
  if (!r || r.userId !== userId) throw new NotFoundError('Rule not found');
  await prisma.gmailAutoApproveRule.delete({ where: { id } });
}

/**
 * Returns the matching rule for (sender, docType). Falls back to
 * (sender, null) which means "all docs from this sender".
 */
export async function findMatchingRule(userId: string, fromAddress: string, docType: string | null) {
  if (docType) {
    const exact = await prisma.gmailAutoApproveRule.findUnique({
      where: { userId_fromAddress_docType: { userId, fromAddress, docType } },
    });
    if (exact) return exact;
  }
  return prisma.gmailAutoApproveRule.findUnique({
    where: { userId_fromAddress_docType: { userId, fromAddress, docType: null } },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add portfolioos/packages/api/src/services/gmailAutoApproveRules.service.ts
git commit -m "feat(gmail): auto-approve rule service"
```

---

## Task 11: Service — approval projection

**Files:**
- Create: `packages/api/src/services/gmailDocApproval.service.ts`

- [ ] **Step 1: Write the service**

Create:

```ts
import type { ImportType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { createImportJob } from './imports/import.service.js';
import { findMatchingRule, upsertRule } from './gmailAutoApproveRules.service.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';

function inferImportType(fileName: string, classifiedDocType: string | null): ImportType {
  const lower = fileName.toLowerCase();
  if (classifiedDocType === 'CAS') return lower.endsWith('.pdf') ? 'MF_CAS_PDF' : 'MF_CAS_EXCEL';
  if (classifiedDocType === 'CONTRACT_NOTE') {
    if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'CONTRACT_NOTE_HTML';
    return 'CONTRACT_NOTE_EXCEL';
  }
  if (classifiedDocType === 'BANK_STATEMENT') {
    return lower.endsWith('.pdf') ? 'BANK_STATEMENT_PDF' : 'BANK_STATEMENT_CSV';
  }
  if (lower.endsWith('.pdf')) return 'CONTRACT_NOTE_PDF';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'GENERIC_EXCEL';
  return 'GENERIC_CSV';
}

export async function approveDoc(
  userId: string,
  docId: string,
  options: { createAutoApproveRule?: boolean } = {},
) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({ where: { id: docId } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  if (doc.status === 'APPROVED' || doc.status === 'IMPORTING' || doc.status === 'IMPORTED') {
    return doc; // idempotent
  }
  if (doc.status !== 'PENDING_APPROVAL') {
    throw new BadRequestError(`Cannot approve a doc in status ${doc.status}`);
  }

  const importJob = await createImportJob({
    userId,
    portfolioId: null,
    type: inferImportType(doc.fileName, doc.classifiedDocType),
    fileName: doc.fileName,
    filePath: doc.storagePath,
    contentHash: doc.contentHash,
  });

  const updated = await prisma.gmailDiscoveredDoc.update({
    where: { id: docId },
    data: {
      status: 'IMPORTING',
      importJobId: importJob.id,
      approvedAt: new Date(),
    },
  });

  if (options.createAutoApproveRule) {
    await upsertRule({
      userId,
      fromAddress: doc.fromAddress,
      docType: doc.classifiedDocType ?? null,
      enabled: true,
    });
  }

  logger.info({ docId, importJobId: importJob.id }, '[gmailApproval] approved + import queued');
  return updated;
}

export async function rejectDoc(
  userId: string,
  docId: string,
  options: { reason?: string; blocklist?: boolean } = {},
) {
  const doc = await prisma.gmailDiscoveredDoc.findUnique({ where: { id: docId } });
  if (!doc || doc.userId !== userId) throw new NotFoundError('Document not found');
  if (doc.status === 'REJECTED') return doc;

  const updated = await prisma.gmailDiscoveredDoc.update({
    where: { id: docId },
    data: {
      status: 'REJECTED',
      rejectedAt: new Date(),
      rejectedReason: options.reason ?? null,
    },
  });
  if (options.blocklist) {
    await upsertRule({
      userId,
      fromAddress: doc.fromAddress,
      docType: doc.classifiedDocType ?? null,
      enabled: false,
    });
  }
  return updated;
}

/**
 * Used by the worker's PHASE-4 sweep. Walks PENDING_APPROVAL docs for
 * the scan and auto-approves any that match an enabled rule.
 */
export async function sweepAutoApprovals(userId: string, scanJobId: string) {
  const candidates = await prisma.gmailDiscoveredDoc.findMany({
    where: { userId, scanJobId, status: 'PENDING_APPROVAL' },
  });
  let approved = 0;
  for (const doc of candidates) {
    const rule = await findMatchingRule(userId, doc.fromAddress, doc.classifiedDocType);
    if (!rule || !rule.enabled) continue;
    await approveDoc(userId, doc.id, { createAutoApproveRule: false });
    await prisma.gmailAutoApproveRule.update({
      where: { id: rule.id },
      data: { approvedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    approved++;
  }
  return approved;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean. If `createImportJob` doesn't accept `contentHash` / `gmailMessageId` parameters yet, see Task 12 — the existing signature already accepts `contentHash` per `import.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/services/gmailDocApproval.service.ts
git commit -m "feat(gmail): doc approval + projection service"
```

---

## Task 12: Mirror import outcome back to discovered doc

**Files:**
- Modify: `packages/api/src/services/imports/import.service.ts`

- [ ] **Step 1: Add a back-pointer parameter to `createImportJob`**

Find `interface CreateImportJobInput` in `import.service.ts` and add:

```ts
  /** When this import was promoted from a Gmail discovered doc, the
   *  doc's id so the worker can mirror the final status back. */
  gmailDocId?: string | null;
```

In `prisma.importJob.create({ data: { ... } })` inside `createImportJob`, add the column:

```ts
        gmailDocId: input.gmailDocId ?? null,
```

- [ ] **Step 2: Update the approval service to forward the back-pointer**

In `services/gmailDocApproval.service.ts::approveDoc`, change the `createImportJob` call to pass `gmailDocId: doc.id`:

```ts
  const importJob = await createImportJob({
    userId,
    portfolioId: null,
    type: inferImportType(doc.fileName, doc.classifiedDocType),
    fileName: doc.fileName,
    filePath: doc.storagePath,
    contentHash: doc.contentHash,
    gmailDocId: doc.id,
  });
```

- [ ] **Step 3: Mirror status at the end of `processImportJob`**

In `import.service.ts::processImportJob`, find every `prisma.importJob.update(...)` call that sets `status: 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'NEEDS_PASSWORD'` (the final status set just before returning). After each, add a mirror block. The simplest unified place is at the bottom of the function, after the final `prisma.importJob.update`:

```ts
  // Mirror outcome back to the originating GmailDiscoveredDoc (if any).
  // This keeps the inbox approval queue's status in sync with the
  // import pipeline without requiring callers to poll two endpoints.
  if (job.gmailDocId) {
    const finalJob = await prisma.importJob.findUnique({
      where: { id: importJobId },
      select: { status: true },
    });
    if (finalJob) {
      const docStatus =
        finalJob.status === 'FAILED' || finalJob.status === 'NEEDS_PASSWORD'
          ? 'PARSE_FAILED'
          : 'IMPORTED';
      await prisma.gmailDiscoveredDoc.update({
        where: { id: job.gmailDocId },
        data: {
          status: docStatus,
          importedAt: docStatus === 'IMPORTED' ? new Date() : null,
        },
      });
    }
  }
```

(Place the block after the existing final-status updates, before `return ...`. Re-fetch the job's `gmailDocId` if not in scope; the `job` variable is the row loaded at the top of the function.)

- [ ] **Step 4: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/packages/api/src/services/imports/import.service.ts
git commit -m "feat(import): mirror final status back to GmailDiscoveredDoc"
```

---

## Task 13: Scan worker — failing test for happy path

**Files:**
- Create: `packages/api/test/jobs/gmailScanWorker.test.ts`

- [ ] **Step 1: Write the failing test**

Create:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/gmailMessageLister.js', () => ({
  buildScanQuery: () => 'mock query',
  listMessageIdsPage: vi
    .fn()
    .mockResolvedValueOnce({ ids: ['msg1'], nextPageToken: null }),
  fetchMessageWithAttachments: vi.fn().mockResolvedValue({
    header: {
      messageId: 'msg1',
      threadId: 't1',
      fromAddress: 'noreply@zerodha.com',
      subject: 'Contract note',
      receivedAt: new Date('2026-04-15'),
    },
    attachments: [
      { attachmentId: 'a1', fileName: 'CN.pdf', mimeType: 'application/pdf', size: 1234 },
    ],
  }),
  downloadAttachmentBytes: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 ...')),
}));

vi.mock('../../src/lib/gmailClassifier.js', () => ({
  classifyAttachmentWithLlm: vi.fn().mockResolvedValue({
    ok: true,
    classification: {
      is_financial: true,
      doc_type: 'CONTRACT_NOTE',
      confidence: 0.9,
      suggested_parser: 'broker.contract_note.generic',
      reason: 'looks like a contract note',
    },
    usage: { inputTokens: 400, outputTokens: 50, costInr: '0.05' },
  }),
}));

vi.mock('../../src/lib/decryptIfNeeded.js', () => ({
  decryptIfNeeded: vi.fn().mockResolvedValue({
    ok: true,
    kind: 'pdf',
    text: 'Trade summary symbol: NIFTY ...'.repeat(200),
    buffer: Buffer.from('%PDF-1.4 ...'),
    usedPassword: null,
  }),
}));

import { runScanJob } from '../../src/jobs/gmailScanWorker.js';
import { prisma } from '../../src/lib/prisma.js';

describe('runScanJob', () => {
  beforeEach(async () => {
    // Truncate per-test in CI; here assume an empty test schema.
    await prisma.gmailDiscoveredDoc.deleteMany();
    await prisma.gmailScanJob.deleteMany();
  });

  it('classifies one attachment and lands it in PENDING_APPROVAL', async () => {
    // Seed: User + MailboxAccount + GmailScanJob.
    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'x',
        name: 'Test',
        role: 'INVESTOR',
        plan: 'PLUS',
      },
    });
    const mb = await prisma.mailboxAccount.create({
      data: {
        userId: user.id,
        provider: 'GMAIL_OAUTH',
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        username: 'test@example.com',
        passwordEnc: 'enc',
        folder: 'INBOX',
        isActive: true,
        googleEmail: 'test@example.com',
        accessTokenEnc: 'a',
        refreshTokenEnc: 'r',
      },
    });
    const job = await prisma.gmailScanJob.create({
      data: {
        userId: user.id,
        mailboxId: mb.id,
        lookbackFrom: new Date('2021-01-01'),
        lookbackTo: new Date('2026-05-01'),
        status: 'PENDING',
      },
    });

    await runScanJob(job.id);

    const docs = await prisma.gmailDiscoveredDoc.findMany({ where: { scanJobId: job.id } });
    expect(docs).toHaveLength(1);
    expect(docs[0].status).toBe('PENDING_APPROVAL');
    expect(docs[0].classifiedDocType).toBe('CONTRACT_NOTE');

    const finalJob = await prisma.gmailScanJob.findUnique({ where: { id: job.id } });
    expect(finalJob?.status).toBe('COMPLETED');
    expect(finalJob?.attachmentsKept).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec vitest run test/jobs/gmailScanWorker.test.ts`
Expected: FAIL with "Cannot find module '.../gmailScanWorker.js'".

- [ ] **Step 3: Commit failing test**

```bash
git add portfolioos/packages/api/test/jobs/gmailScanWorker.test.ts
git commit -m "test(gmail): failing test for scan worker happy path"
```

---

## Task 14: Implement the scan worker

**Files:**
- Create: `packages/api/src/jobs/gmailScanWorker.ts`

- [ ] **Step 1: Write the worker**

Create:

```ts
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extname } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import {
  buildScanQuery,
  listMessageIdsPage,
  fetchMessageWithAttachments,
  downloadAttachmentBytes,
} from '../lib/gmailMessageLister.js';
import { classifyAttachmentWithLlm } from '../lib/gmailClassifier.js';
import { decryptIfNeeded } from '../lib/decryptIfNeeded.js';
import { getGmailScanQueue } from '../lib/queue.js';
import { sweepAutoApprovals } from '../services/gmailDocApproval.service.js';

const STORAGE_ROOT = env.UPLOAD_DIR;
const CONCURRENCY = 5;

/**
 * Bull job entry point. Idempotent across phases — every step guards on
 * the row's current status and writes status transitions atomically so
 * a worker crash mid-flight resumes from the same place on retry.
 */
export async function runScanJob(scanJobId: string): Promise<void> {
  const job = await prisma.gmailScanJob.findUnique({ where: { id: scanJobId } });
  if (!job) {
    logger.warn({ scanJobId }, '[gmailScan] missing job — dropping');
    return;
  }
  if (job.status === 'CANCELLED' || job.status === 'COMPLETED') return;

  await prisma.gmailScanJob.update({
    where: { id: scanJobId },
    data: { status: 'LISTING', startedAt: job.startedAt ?? new Date() },
  });

  try {
    const messageIds = await collectMessageIds(scanJobId);
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { status: 'DOWNLOADING', totalMessages: messageIds.length },
    });

    await processMessages(scanJobId, messageIds);
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { status: 'CLASSIFYING' },
    });

    await classifyPending(scanJobId);
    await sweepAutoApprovals(job.userId, scanJobId);

    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  } catch (err) {
    logger.error({ err, scanJobId }, '[gmailScan] job failed');
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
        completedAt: new Date(),
      },
    });
    throw err;
  }
}

async function collectMessageIds(scanJobId: string): Promise<string[]> {
  const job = await prisma.gmailScanJob.findUniqueOrThrow({ where: { id: scanJobId } });
  const ids: string[] = [];
  let cursor = job.nextPageToken ?? null;
  const query = buildScanQuery(job.lookbackFrom, job.lookbackTo);

  while (true) {
    if (await isCancelled(scanJobId)) return ids;
    const page = await listMessageIdsPage(job.mailboxId, query, cursor);
    ids.push(...page.ids);
    cursor = page.nextPageToken;
    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: { nextPageToken: cursor },
    });
    if (!cursor) break;
  }
  return ids;
}

async function processMessages(scanJobId: string, messageIds: string[]): Promise<void> {
  const job = await prisma.gmailScanJob.findUniqueOrThrow({ where: { id: scanJobId } });

  for (const messageId of messageIds) {
    if (await isCancelled(scanJobId)) return;
    const msg = await fetchMessageWithAttachments(job.mailboxId, messageId);
    if (!msg) continue;

    for (const att of msg.attachments) {
      const existing = await prisma.gmailDiscoveredDoc.findUnique({
        where: {
          userId_gmailMessageId_gmailAttachmentId: {
            userId: job.userId,
            gmailMessageId: msg.header.messageId,
            gmailAttachmentId: att.attachmentId,
          },
        },
      });
      if (existing) continue;

      const bytes = await downloadAttachmentBytes(job.mailboxId, msg.header.messageId, att.attachmentId);
      const contentHash = sha256(bytes);

      const dupeImport = await prisma.importJob.findFirst({
        where: { userId: job.userId, contentHash },
        select: { id: true },
      });

      const storagePath = await writeBytes(job.userId, msg.header.messageId, att, bytes);

      const dupeDoc = await prisma.gmailDiscoveredDoc.findUnique({
        where: { userId_contentHash: { userId: job.userId, contentHash } },
      });
      if (dupeDoc) continue;

      await prisma.gmailDiscoveredDoc.create({
        data: {
          userId: job.userId,
          scanJobId,
          gmailMessageId: msg.header.messageId,
          gmailAttachmentId: att.attachmentId,
          fromAddress: msg.header.fromAddress,
          subject: msg.header.subject,
          receivedAt: msg.header.receivedAt,
          fileName: att.fileName,
          fileSize: att.size,
          mimeType: att.mimeType,
          contentHash,
          storagePath,
          status: dupeImport ? 'DUPLICATE' : 'CLASSIFYING',
        },
      });
    }

    await prisma.gmailScanJob.update({
      where: { id: scanJobId },
      data: {
        processedMessages: { increment: 1 },
        attachmentsFound: { increment: msg.attachments.length },
      },
    });
  }
}

async function classifyPending(scanJobId: string): Promise<void> {
  const docs = await prisma.gmailDiscoveredDoc.findMany({
    where: { scanJobId, status: 'CLASSIFYING' },
  });
  if (docs.length === 0) return;

  const queue = [...docs];
  const inFlight: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) inFlight.push(worker());
  await Promise.all(inFlight);

  async function worker() {
    while (queue.length > 0) {
      if (await isCancelled(scanJobId)) return;
      const doc = queue.shift();
      if (!doc) return;

      const decrypted = await decryptIfNeeded(doc.storagePath, {
        fileName: doc.fileName,
        userId: doc.userId,
        allowedKinds: ['pdf', 'xlsx_ooxml', 'xlsx_encrypted', 'xls', 'csv'],
      });

      const first4kb = decrypted.ok && decrypted.text ? decrypted.text.slice(0, 4096) : '';

      const cls = await classifyAttachmentWithLlm({
        userId: doc.userId,
        fileName: doc.fileName,
        sender: doc.fromAddress,
        subject: doc.subject,
        first4kbText: first4kb,
      });

      if (!cls.ok) {
        if (cls.reason === 'budget_capped') {
          // Stop early — leave remaining docs in CLASSIFYING for resume.
          await prisma.gmailScanJob.update({
            where: { id: scanJobId },
            data: { errorMessage: cls.message },
          });
          queue.length = 0;
          return;
        }
        await prisma.gmailDiscoveredDoc.update({
          where: { id: doc.id },
          data: {
            classifierNotes: `${cls.reason}: ${cls.message}`,
            status: 'PENDING_APPROVAL',
            isFinancial: null,
          },
        });
        continue;
      }

      const c = cls.classification;
      const keep = c.is_financial && c.confidence >= 0.4;

      await prisma.gmailDiscoveredDoc.update({
        where: { id: doc.id },
        data: {
          isFinancial: c.is_financial,
          classifiedDocType: c.doc_type,
          classifierConfidence: c.confidence.toFixed(2),
          suggestedParser: c.suggested_parser ?? null,
          classifierNotes: c.reason,
          classifierTokensIn: cls.usage.inputTokens,
          classifierTokensOut: cls.usage.outputTokens,
          status: keep ? 'PENDING_APPROVAL' : 'NOT_FINANCIAL',
        },
      });
      await prisma.gmailScanJob.update({
        where: { id: scanJobId },
        data: {
          attachmentsClassified: { increment: 1 },
          attachmentsKept: keep ? { increment: 1 } : undefined,
        },
      });
    }
  }
}

async function isCancelled(scanJobId: string): Promise<boolean> {
  const j = await prisma.gmailScanJob.findUnique({
    where: { id: scanJobId },
    select: { status: true },
  });
  return j?.status === 'CANCELLED';
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function writeBytes(
  userId: string,
  messageId: string,
  att: { attachmentId: string; fileName: string },
  bytes: Buffer,
): Promise<string> {
  const ym = new Date().toISOString().slice(0, 7);
  const dir = join(STORAGE_ROOT, 'gmail-imports', userId, ym);
  await mkdir(dir, { recursive: true });
  const ext = extname(att.fileName) || '.bin';
  const safeMsg = messageId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const path = join(dir, `${safeMsg}-${att.attachmentId.slice(0, 12)}${ext}`);
  await writeFile(path, bytes);
  return path;
}

/**
 * Wire the worker to the Bull queue. Called once at API boot.
 */
export function registerGmailScanWorker(): void {
  const q = getGmailScanQueue();
  q.process(2, async (job) => {
    const { scanJobId } = job.data as { scanJobId: string };
    await runScanJob(scanJobId);
  });
  logger.info('[gmailScan] worker registered');
}
```

- [ ] **Step 2: Run the test, verify pass**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec vitest run test/jobs/gmailScanWorker.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/jobs/gmailScanWorker.ts
git commit -m "feat(jobs): gmail scan worker with idempotent phases"
```

---

## Task 15: Wire worker into API boot

**Files:**
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Register the worker**

Find where existing workers are registered (search for `registerImportWorker` or `getImportQueue`). Add an import + registration call alongside:

```ts
import { registerGmailScanWorker } from './jobs/gmailScanWorker.js';
// ... after the existing worker registrations
registerGmailScanWorker();
```

- [ ] **Step 2: Typecheck + lint**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/index.ts
git commit -m "chore(boot): register gmail scan worker"
```

---

## Task 16: Controllers — scan jobs

**Files:**
- Create: `packages/api/src/controllers/gmailScan.controller.ts`

- [ ] **Step 1: Write the controller**

Create:

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, created } from '../lib/response.js';
import { UnauthorizedError, BadRequestError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  createScanJob,
  listScanJobs,
  getScanJob,
  cancelScanJob,
  resumeScanJob,
} from '../services/gmailScanJobs.service.js';
import {
  listDiscoveredDocs,
  getDiscoveredDoc,
  listDistinctSenders,
} from '../services/gmailDiscoveredDocs.service.js';
import {
  approveDoc,
  rejectDoc,
} from '../services/gmailDocApproval.service.js';
import {
  listRules,
  upsertRule,
  deleteRule,
} from '../services/gmailAutoApproveRules.service.js';

const CreateScanSchema = z.object({
  lookbackFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lookbackTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function postScanJob(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = CreateScanSchema.parse(req.body);
  const mb = await prisma.mailboxAccount.findFirst({
    where: { userId: req.user.id, provider: 'GMAIL_OAUTH', isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!mb) throw new BadRequestError('Connect Gmail before starting a scan');
  const job = await createScanJob({
    userId: req.user.id,
    mailboxId: mb.id,
    lookbackFrom: new Date(body.lookbackFrom),
    lookbackTo: new Date(body.lookbackTo),
  });
  created(res, job);
}

export async function listScans(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listScanJobs(req.user.id));
}

export async function getScan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getScanJob(req.user.id, req.params.id!));
}

export async function postCancelScan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await cancelScanJob(req.user.id, req.params.id!));
}

export async function postResumeScan(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await resumeScanJob(req.user.id, req.params.id!));
}

const ListDocsQuery = z.object({
  status: z.string().optional(),
  fromAddress: z.string().optional(),
  docType: z.string().optional(),
  scanJobId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function listDocs(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const q = ListDocsQuery.parse(req.query);
  ok(res, await listDiscoveredDocs({ userId: req.user.id, ...q } as Parameters<typeof listDiscoveredDocs>[0]));
}

export async function getDoc(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await getDiscoveredDoc(req.user.id, req.params.id!));
}

export async function getDocPreviewUrl(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const doc = await getDiscoveredDoc(req.user.id, req.params.id!);
  // The OnlyOffice document.controller exposes signedDownloadToken for
  // Document model rows. We re-use the same JWT pattern but issue it for
  // a synthetic Document-like wrapper. Simplest correct approach: stream
  // the bytes directly to the client through an authenticated endpoint
  // and let DocumentEditorModal use that URL. The SDK requires the URL
  // be reachable by OnlyOffice; for first-cut we point at our own
  // /api/gmail/discovered-docs/:id/raw which the DocServer pulls.
  const previewUrl = `${process.env.API_PUBLIC_URL_FOR_ONLYOFFICE ?? ''}/api/gmail/discovered-docs/${doc.id}/raw`;
  ok(res, { url: previewUrl, fileName: doc.fileName, mimeType: doc.mimeType });
}

export async function getDocRaw(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const doc = await getDiscoveredDoc(req.user.id, req.params.id!);
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = await import('node:fs');
  fs.createReadStream(doc.storagePath).pipe(res);
}

export async function listSenders(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listDistinctSenders(req.user.id));
}

const ApproveBody = z.object({ createAutoApproveRule: z.boolean().optional() }).default({});
export async function postApproveDoc(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = ApproveBody.parse(req.body ?? {});
  ok(res, await approveDoc(req.user.id, req.params.id!, body));
}

const RejectBody = z.object({ reason: z.string().max(200).optional(), blocklist: z.boolean().optional() }).default({});
export async function postRejectDoc(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = RejectBody.parse(req.body ?? {});
  ok(res, await rejectDoc(req.user.id, req.params.id!, body));
}

const BulkApproveSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  createAutoApproveRule: z.boolean().optional(),
});
export async function postBulkApprove(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = BulkApproveSchema.parse(req.body);
  const results = [];
  for (const id of body.ids) {
    try {
      results.push({ id, ok: true, doc: await approveDoc(req.user.id, id, body) });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  ok(res, results);
}

const BulkRejectSchema = z.object({
  ids: z.array(z.string()).min(1).max(200),
  reason: z.string().max(200).optional(),
  blocklist: z.boolean().optional(),
});
export async function postBulkReject(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = BulkRejectSchema.parse(req.body);
  const results = [];
  for (const id of body.ids) {
    try {
      results.push({ id, ok: true, doc: await rejectDoc(req.user.id, id, body) });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  ok(res, results);
}

export async function listAutoApproveRules(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  ok(res, await listRules(req.user.id));
}

const RuleSchema = z.object({
  fromAddress: z.string().min(3),
  docType: z.string().nullable().optional(),
  enabled: z.boolean(),
});
export async function postAutoApproveRule(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = RuleSchema.parse(req.body);
  ok(res, await upsertRule({ userId: req.user.id, ...body }));
}

export async function deleteAutoApproveRule(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteRule(req.user.id, req.params.id!);
  ok(res, { deleted: true });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/packages/api/src/controllers/gmailScan.controller.ts
git commit -m "feat(gmail): scan + discovered-docs + rules controllers"
```

---

## Task 17: Routes + mount

**Files:**
- Create: `packages/api/src/routes/gmailScan.routes.ts`
- Modify: `packages/api/src/routes/index.ts` (or wherever `registerRoutes` is implemented)

- [ ] **Step 1: Write the router**

Create:

```ts
import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import {
  postScanJob,
  listScans,
  getScan,
  postCancelScan,
  postResumeScan,
  listDocs,
  getDoc,
  getDocPreviewUrl,
  getDocRaw,
  listSenders,
  postApproveDoc,
  postRejectDoc,
  postBulkApprove,
  postBulkReject,
  listAutoApproveRules,
  postAutoApproveRule,
  deleteAutoApproveRule,
} from '../controllers/gmailScan.controller.js';

export const gmailScanRouter = Router();
gmailScanRouter.use(authenticate);

gmailScanRouter.post('/scan-jobs', asyncHandler(postScanJob));
gmailScanRouter.get('/scan-jobs', asyncHandler(listScans));
gmailScanRouter.get('/scan-jobs/:id', asyncHandler(getScan));
gmailScanRouter.post('/scan-jobs/:id/cancel', asyncHandler(postCancelScan));
gmailScanRouter.post('/scan-jobs/:id/resume', asyncHandler(postResumeScan));

gmailScanRouter.get('/discovered-docs', asyncHandler(listDocs));
gmailScanRouter.get('/discovered-docs/senders', asyncHandler(listSenders));
gmailScanRouter.get('/discovered-docs/:id', asyncHandler(getDoc));
gmailScanRouter.get('/discovered-docs/:id/preview-url', asyncHandler(getDocPreviewUrl));
gmailScanRouter.get('/discovered-docs/:id/raw', asyncHandler(getDocRaw));
gmailScanRouter.post('/discovered-docs/:id/approve', asyncHandler(postApproveDoc));
gmailScanRouter.post('/discovered-docs/:id/reject', asyncHandler(postRejectDoc));
gmailScanRouter.post('/discovered-docs/bulk-approve', asyncHandler(postBulkApprove));
gmailScanRouter.post('/discovered-docs/bulk-reject', asyncHandler(postBulkReject));

gmailScanRouter.get('/auto-approve-rules', asyncHandler(listAutoApproveRules));
gmailScanRouter.post('/auto-approve-rules', asyncHandler(postAutoApproveRule));
gmailScanRouter.delete('/auto-approve-rules/:id', asyncHandler(deleteAutoApproveRule));
```

- [ ] **Step 2: Mount under `/api/gmail`**

Find the existing `gmailRouter` mount in `routes/index.ts` (or wherever routes are registered). Add:

```ts
import { gmailScanRouter } from './gmailScan.routes.js';
// ...
app.use('/api/gmail', gmailScanRouter);
```

(If that path is already taken by `gmailRouter` — which it is — combine: mount `gmailScanRouter` second, since Express routes are tried in registration order. The new endpoints are all distinct paths, so no collision.)

- [ ] **Step 3: Smoke test**

Run: `cd portfolioos && pnpm --filter @portfolioos/api run dev` and in another terminal:
```bash
curl -sS -X GET http://localhost:3001/api/gmail/scan-jobs -H "Authorization: Bearer <token>"
```
Expected: `{ "success": true, "data": [] }` for a user with no scans.

- [ ] **Step 4: Commit**

```bash
git add portfolioos/packages/api/src/routes/gmailScan.routes.ts portfolioos/packages/api/src/routes/index.ts
git commit -m "feat(gmail): mount scan router under /api/gmail"
```

---

## Task 18: Frontend API client

**Files:**
- Create: `apps/web/src/api/gmailScan.api.ts`

- [ ] **Step 1: Write the API client**

Create:

```ts
import { api } from './client';
import type {
  ApiResponse,
  GmailScanJobDTO,
  GmailDiscoveredDocDTO,
  GmailAutoApproveRuleDTO,
  CreateScanJobInput,
  BulkApproveInput,
  BulkRejectInput,
  GmailDocStatus,
} from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export const gmailScanApi = {
  createScan: async (input: CreateScanJobInput): Promise<GmailScanJobDTO> => {
    const { data } = await api.post<ApiResponse<GmailScanJobDTO>>('/api/gmail/scan-jobs', input);
    return unwrap(data);
  },
  listScans: async (): Promise<GmailScanJobDTO[]> => {
    const { data } = await api.get<ApiResponse<GmailScanJobDTO[]>>('/api/gmail/scan-jobs');
    return unwrap(data);
  },
  getScan: async (id: string): Promise<GmailScanJobDTO> => {
    const { data } = await api.get<ApiResponse<GmailScanJobDTO>>(`/api/gmail/scan-jobs/${id}`);
    return unwrap(data);
  },
  cancelScan: async (id: string): Promise<GmailScanJobDTO> => {
    const { data } = await api.post<ApiResponse<GmailScanJobDTO>>(`/api/gmail/scan-jobs/${id}/cancel`);
    return unwrap(data);
  },
  resumeScan: async (id: string): Promise<GmailScanJobDTO> => {
    const { data } = await api.post<ApiResponse<GmailScanJobDTO>>(`/api/gmail/scan-jobs/${id}/resume`);
    return unwrap(data);
  },

  listDocs: async (params: {
    status?: GmailDocStatus;
    fromAddress?: string;
    docType?: string;
    scanJobId?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<GmailDiscoveredDocDTO[]> => {
    const { data } = await api.get<ApiResponse<GmailDiscoveredDocDTO[]>>('/api/gmail/discovered-docs', { params });
    return unwrap(data);
  },
  listSenders: async (): Promise<string[]> => {
    const { data } = await api.get<ApiResponse<string[]>>('/api/gmail/discovered-docs/senders');
    return unwrap(data);
  },
  getDoc: async (id: string): Promise<GmailDiscoveredDocDTO> => {
    const { data } = await api.get<ApiResponse<GmailDiscoveredDocDTO>>(`/api/gmail/discovered-docs/${id}`);
    return unwrap(data);
  },
  getDocPreviewUrl: async (id: string): Promise<{ url: string; fileName: string; mimeType: string }> => {
    const { data } = await api.get<ApiResponse<{ url: string; fileName: string; mimeType: string }>>(
      `/api/gmail/discovered-docs/${id}/preview-url`,
    );
    return unwrap(data);
  },
  approveDoc: async (id: string, createAutoApproveRule = false): Promise<GmailDiscoveredDocDTO> => {
    const { data } = await api.post<ApiResponse<GmailDiscoveredDocDTO>>(
      `/api/gmail/discovered-docs/${id}/approve`,
      { createAutoApproveRule },
    );
    return unwrap(data);
  },
  rejectDoc: async (id: string, opts: { reason?: string; blocklist?: boolean } = {}): Promise<GmailDiscoveredDocDTO> => {
    const { data } = await api.post<ApiResponse<GmailDiscoveredDocDTO>>(
      `/api/gmail/discovered-docs/${id}/reject`,
      opts,
    );
    return unwrap(data);
  },
  bulkApprove: async (input: BulkApproveInput) => {
    const { data } = await api.post<ApiResponse<unknown>>('/api/gmail/discovered-docs/bulk-approve', input);
    return unwrap(data);
  },
  bulkReject: async (input: BulkRejectInput) => {
    const { data } = await api.post<ApiResponse<unknown>>('/api/gmail/discovered-docs/bulk-reject', input);
    return unwrap(data);
  },

  listRules: async (): Promise<GmailAutoApproveRuleDTO[]> => {
    const { data } = await api.get<ApiResponse<GmailAutoApproveRuleDTO[]>>('/api/gmail/auto-approve-rules');
    return unwrap(data);
  },
  upsertRule: async (input: { fromAddress: string; docType?: string | null; enabled: boolean }): Promise<GmailAutoApproveRuleDTO> => {
    const { data } = await api.post<ApiResponse<GmailAutoApproveRuleDTO>>('/api/gmail/auto-approve-rules', input);
    return unwrap(data);
  },
  deleteRule: async (id: string): Promise<void> => {
    await api.delete(`/api/gmail/auto-approve-rules/${id}`);
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/web run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/apps/web/src/api/gmailScan.api.ts
git commit -m "feat(web): gmail scan + approval API client"
```

---

## Task 19: Frontend — ConnectGmailCard

**Files:**
- Create: `apps/web/src/components/dashboard/ConnectGmailCard.tsx`

- [ ] **Step 1: Write the component**

Create:

```tsx
import { Mail, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { gmailApi } from '@/api/gmail.api';
import toast from 'react-hot-toast';
import { apiErrorMessage } from '@/api/client';

export function ConnectGmailCard() {
  async function startConnect() {
    try {
      const r = await gmailApi.authUrl();
      window.location.href = r.url;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to start Gmail connect'));
    }
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardContent className="p-5 flex items-start gap-4">
        <div className="rounded-full bg-primary/10 p-3 shrink-0">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Auto-import financial documents from Gmail
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            We&apos;ll scan your inbox for contract notes, statements and other
            financial PDFs — no sender lists to configure. You approve each
            document before it&apos;s imported.
          </p>
          <Button className="mt-3" onClick={startConnect}>
            Connect Gmail
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add portfolioos/apps/web/src/components/dashboard/ConnectGmailCard.tsx
git commit -m "feat(web): ConnectGmailCard dashboard CTA"
```

---

## Task 20: Frontend — GmailScanProgressCard

**Files:**
- Create: `apps/web/src/components/dashboard/GmailScanProgressCard.tsx`

- [ ] **Step 1: Write the component**

Create:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { gmailScanApi } from '@/api/gmailScan.api';
import type { GmailScanJobDTO } from '@portfolioos/shared';

const NON_TERMINAL = ['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING'] as const;

function isRunning(s: GmailScanJobDTO): boolean {
  return (NON_TERMINAL as readonly string[]).includes(s.status);
}

export function GmailScanProgressCard() {
  const q = useQuery({
    queryKey: ['gmail-scan-jobs'],
    queryFn: () => gmailScanApi.listScans(),
    refetchInterval: (query) =>
      query.state.data?.some(isRunning) ? 3000 : false,
  });
  const running = (q.data ?? []).find(isRunning);
  if (!running) return null;
  const total = running.totalMessages ?? null;
  const pct = total ? Math.min(100, Math.round((running.processedMessages / total) * 100)) : null;

  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium">Scanning your Gmail inbox…</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {total
              ? `${running.processedMessages.toLocaleString()} / ${total.toLocaleString()} messages`
              : `${running.processedMessages.toLocaleString()} messages so far`}
            {' • '}
            {running.attachmentsKept} financial document
            {running.attachmentsKept === 1 ? '' : 's'} found
          </div>
          {pct !== null && (
            <div className="h-1.5 bg-muted rounded mt-2 overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <Link to="/reports?tab=inbox-imports">
          <Button variant="outline" size="sm">
            <Inbox className="h-3.5 w-3.5" /> Review docs
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add portfolioos/apps/web/src/components/dashboard/GmailScanProgressCard.tsx
git commit -m "feat(web): GmailScanProgressCard live progress widget"
```

---

## Task 21: Mount cards on Dashboard

**Files:**
- Modify: `apps/web/src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Add the imports**

At the top of `DashboardPage.tsx`, add:

```tsx
import { useQuery } from '@tanstack/react-query';
import { ConnectGmailCard } from '@/components/dashboard/ConnectGmailCard';
import { GmailScanProgressCard } from '@/components/dashboard/GmailScanProgressCard';
import { mailboxesApi } from '@/api/mailboxes.api';
```

(If `useQuery` already imported, drop the duplicate. If `mailboxesApi` doesn't exist yet, replace the call below with `api.get('/api/mailboxes')` directly — match the existing pattern in `MailboxesPage.tsx`.)

- [ ] **Step 2: Add the gating + render**

Inside the page component, before the existing dashboard content, add:

```tsx
  const mailboxesQ = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
  });
  const hasGmail = (mailboxesQ.data ?? []).some(
    (m) => m.provider === 'GMAIL_OAUTH' && m.isActive,
  );
```

In the JSX `return`, place at the top of the dashboard grid:

```tsx
      <div className="space-y-3 mb-6">
        {!hasGmail && <ConnectGmailCard />}
        {hasGmail && <GmailScanProgressCard />}
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/web run typecheck`
Expected: clean. (If `mailboxesApi` doesn't exist, see step 1's fallback.)

- [ ] **Step 4: Commit**

```bash
git add portfolioos/apps/web/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(web): mount Gmail CTA + scan progress on dashboard"
```

---

## Task 22: Frontend — GmailScanSetupPage

**Files:**
- Create: `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write the page**

Create:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { gmailScanApi } from '@/api/gmailScan.api';
import { apiErrorMessage } from '@/api/client';

function dateMinusYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function GmailScanSetupPage() {
  const nav = useNavigate();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(dateMinusYears(5));
  const [to, setTo] = useState(today);

  const start = useMutation({
    mutationFn: () => gmailScanApi.createScan({ lookbackFrom: from, lookbackTo: to }),
    onSuccess: () => {
      toast.success('Scan started — review docs as they appear');
      nav('/reports?tab=inbox-imports', { replace: true });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start scan')),
  });

  return (
    <div>
      <PageHeader
        title="Choose how far back to scan"
        description="We'll look for every PDF, XLSX, XLS or CSV attachment in your Gmail between these dates."
      />
      <Card className="max-w-xl">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="from" className="text-xs">Scan from</Label>
              <Input
                id="from"
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to" className="text-xs">Scan until</Label>
              <Input
                id="to"
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            Default range: last 5 years.
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => nav('/dashboard')}>Skip for now</Button>
            <Button onClick={() => start.mutate()} disabled={start.isPending}>
              {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start scan'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire the route in App.tsx**

In `apps/web/src/App.tsx`, add the import + route. Find the `<Route path="/gmail/callback" ...>` line and add immediately after:

```tsx
import { GmailScanSetupPage } from './pages/mailboxes/GmailScanSetupPage';
// ...
        <Route path="/gmail/scan-setup" element={<GmailScanSetupPage />} />
```

- [ ] **Step 3: Update GmailCallbackPage to redirect to setup**

In `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx`, replace the success redirect:

Old:
```tsx
        setTimeout(
          () => nav(success ? '/ingestion?auto-discover=1' : '/mailboxes', { replace: true }),
          500,
        );
```
New:
```tsx
        setTimeout(
          () => nav(success ? '/gmail/scan-setup' : '/mailboxes', { replace: true }),
          500,
        );
```

- [ ] **Step 4: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/web run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add portfolioos/apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx \
        portfolioos/apps/web/src/App.tsx \
        portfolioos/apps/web/src/pages/mailboxes/GmailCallbackPage.tsx
git commit -m "feat(web): post-OAuth scan setup page with date range"
```

---

## Task 23: Inbox imports tab — preview sheet

**Files:**
- Create: `apps/web/src/components/upload/InboxImportPreviewSheet.tsx`

- [ ] **Step 1: Write the preview sheet**

Create:

```tsx
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { gmailScanApi } from '@/api/gmailScan.api';

interface Props {
  docId: string | null;
  onClose: () => void;
}

export function InboxImportPreviewSheet({ docId, onClose }: Props) {
  const q = useQuery({
    queryKey: ['gmail-doc-preview', docId],
    queryFn: () => (docId ? gmailScanApi.getDocPreviewUrl(docId) : Promise.resolve(null)),
    enabled: !!docId,
  });
  return (
    <Sheet open={!!docId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[min(640px,90vw)] sm:max-w-none p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>{q.data?.fileName ?? 'Document preview'}</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100vh-64px)] flex items-center justify-center">
          {q.isLoading || !q.data ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <iframe
              key={q.data.url}
              src={q.data.url}
              title={q.data.fileName}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add portfolioos/apps/web/src/components/upload/InboxImportPreviewSheet.tsx
git commit -m "feat(web): InboxImportPreviewSheet"
```

---

## Task 24: Inbox imports tab — row component

**Files:**
- Create: `apps/web/src/components/upload/InboxImportRow.tsx`

- [ ] **Step 1: Write the row**

Create:

```tsx
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Eye, FileText, FileSpreadsheet, FileImage } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { GmailDiscoveredDocDTO } from '@portfolioos/shared';
import { GMAIL_DOC_STATUS_LABELS } from '@portfolioos/shared';

const STATUS_CLASSES: Record<string, string> = {
  CLASSIFYING: 'bg-blue-500/10 text-blue-600',
  PENDING_APPROVAL: 'bg-amber-500/10 text-amber-700',
  APPROVED: 'bg-emerald-500/10 text-emerald-700',
  IMPORTING: 'bg-blue-500/10 text-blue-600',
  IMPORTED: 'bg-positive/10 text-positive',
  PARSE_FAILED: 'bg-negative/10 text-negative',
  REJECTED: 'bg-zinc-200 text-zinc-700',
  NOT_FINANCIAL: 'bg-zinc-200 text-zinc-700',
  DUPLICATE: 'bg-zinc-200 text-zinc-700',
};

function iconFor(name: string) {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['png', 'jpg', 'jpeg'].includes(ext)) return FileImage;
  return FileText;
}

interface Props {
  doc: GmailDiscoveredDocDTO;
  selected: boolean;
  onToggleSelect: () => void;
  onPreview: () => void;
  onApprove: (createRule: boolean) => void;
  onReject: () => void;
  isPending: boolean;
}

export function InboxImportRow({
  doc, selected, onToggleSelect, onPreview, onApprove, onReject, isPending,
}: Props) {
  const Icon = iconFor(doc.fileName);
  const isPendingApproval = doc.status === 'PENDING_APPROVAL';
  return (
    <tr className={`border-t ${selected ? 'bg-accent/20' : 'hover:bg-muted/30'}`}>
      <td className="px-2 py-2 w-8">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          disabled={!isPendingApproval}
        />
      </td>
      <td className="px-2 py-2">
        <button onClick={onPreview} className="flex items-center gap-2 hover:underline text-left">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate max-w-[280px]">{doc.fileName}</span>
        </button>
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{doc.fromAddress}</td>
      <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {new Date(doc.receivedAt).toLocaleDateString()}
      </td>
      <td className="px-2 py-2 text-xs text-muted-foreground">{doc.classifiedDocType ?? '—'}</td>
      <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">
        {doc.classifierConfidence ? `${Math.round(parseFloat(doc.classifierConfidence) * 100)}%` : '—'}
      </td>
      <td className="px-2 py-2">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[doc.status] ?? ''}`}>
          {doc.status === 'CLASSIFYING' || doc.status === 'IMPORTING' ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : doc.status === 'IMPORTED' ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : doc.status === 'PARSE_FAILED' ? (
            <AlertTriangle className="h-3 w-3" />
          ) : doc.status === 'REJECTED' ? (
            <XCircle className="h-3 w-3" />
          ) : null}
          {GMAIL_DOC_STATUS_LABELS[doc.status]}
        </span>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onPreview}>
            <Eye className="h-3 w-3" /> Preview
          </Button>
          {isPendingApproval && (
            <>
              <Button
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onApprove(false)}
                disabled={isPending}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onApprove(true)}
                disabled={isPending}
                title="Approve + auto-approve future docs from this sender"
              >
                ✓ Always
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive"
                onClick={onReject}
                disabled={isPending}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add portfolioos/apps/web/src/components/upload/InboxImportRow.tsx
git commit -m "feat(web): InboxImportRow"
```

---

## Task 25: Inbox imports tab body

**Files:**
- Create: `apps/web/src/pages/reports/InboxImportsTab.tsx`

- [ ] **Step 1: Write the tab**

Create:

```tsx
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { gmailScanApi } from '@/api/gmailScan.api';
import { apiErrorMessage } from '@/api/client';
import { InboxImportRow } from '@/components/upload/InboxImportRow';
import { InboxImportPreviewSheet } from '@/components/upload/InboxImportPreviewSheet';
import type { GmailDocStatus } from '@portfolioos/shared';
import { GmailDocStatus as STATUS, INBOX_DOC_TYPES } from '@portfolioos/shared';

const STATUS_OPTIONS: Array<{ value: GmailDocStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: STATUS.PENDING_APPROVAL, label: 'Pending review' },
  { value: STATUS.APPROVED, label: 'Approved' },
  { value: STATUS.IMPORTED, label: 'Imported' },
  { value: STATUS.PARSE_FAILED, label: 'Parse failed' },
  { value: STATUS.REJECTED, label: 'Rejected' },
  { value: STATUS.NOT_FINANCIAL, label: 'Not financial' },
  { value: STATUS.DUPLICATE, label: 'Already imported' },
];

export function InboxImportsTab() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'ALL' | GmailDocStatus>(STATUS.PENDING_APPROVAL);
  const [senderFilter, setSenderFilter] = useState<string>('');
  const [docTypeFilter, setDocTypeFilter] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const docsQ = useQuery({
    queryKey: ['gmail-discovered-docs', statusFilter, senderFilter, docTypeFilter],
    queryFn: () =>
      gmailScanApi.listDocs({
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        fromAddress: senderFilter || undefined,
        docType: docTypeFilter || undefined,
        limit: 200,
      }),
    refetchInterval: (query) =>
      query.state.data?.some((d) => d.status === 'CLASSIFYING' || d.status === 'IMPORTING') ? 3000 : false,
  });

  const sendersQ = useQuery({
    queryKey: ['gmail-discovered-senders'],
    queryFn: () => gmailScanApi.listSenders(),
  });

  const scansQ = useQuery({
    queryKey: ['gmail-scan-jobs'],
    queryFn: () => gmailScanApi.listScans(),
    refetchInterval: 5000,
  });
  const runningScan = (scansQ.data ?? []).find((s) =>
    ['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING'].includes(s.status),
  );

  const approve = useMutation({
    mutationFn: (input: { id: string; createRule: boolean }) =>
      gmailScanApi.approveDoc(input.id, input.createRule),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Approve failed')),
  });
  const reject = useMutation({
    mutationFn: (input: { id: string; blocklist: boolean }) =>
      gmailScanApi.rejectDoc(input.id, { blocklist: input.blocklist }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Reject failed')),
  });
  const bulkApprove = useMutation({
    mutationFn: () =>
      gmailScanApi.bulkApprove({ ids: [...selected], createAutoApproveRule: false }),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] });
      toast.success('Approved selected');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk approve failed')),
  });
  const bulkReject = useMutation({
    mutationFn: () =>
      gmailScanApi.bulkReject({ ids: [...selected] }),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['gmail-discovered-docs'] });
      toast.success('Rejected selected');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Bulk reject failed')),
  });

  const docs = docsQ.data ?? [];
  const someSelected = selected.size > 0;

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const progressLine = useMemo(() => {
    if (!runningScan) return null;
    const total = runningScan.totalMessages ?? 0;
    return total
      ? `Scanning your inbox — ${runningScan.processedMessages.toLocaleString()} / ${total.toLocaleString()} • ${runningScan.attachmentsKept} financial documents found`
      : `Scanning your inbox — ${runningScan.processedMessages.toLocaleString()} messages so far`;
  }, [runningScan]);

  return (
    <div className="space-y-3">
      {progressLine && (
        <div className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-700 flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progressLine}
        </div>
      )}

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | GmailDocStatus)}
            className="h-8 text-xs w-44"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={senderFilter}
            onChange={(e) => setSenderFilter(e.target.value)}
            className="h-8 text-xs w-56"
          >
            <option value="">All senders</option>
            {(sendersQ.data ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select
            value={docTypeFilter}
            onChange={(e) => setDocTypeFilter(e.target.value)}
            className="h-8 text-xs w-44"
          >
            <option value="">All doc types</option>
            {INBOX_DOC_TYPES.filter((t) => t !== 'NOT_FINANCIAL').map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </Select>
          <div className="ml-auto flex items-center gap-2">
            {someSelected && (
              <>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <Button size="sm" onClick={() => bulkApprove.mutate()} disabled={bulkApprove.isPending}>
                  {bulkApprove.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Approve selected'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => bulkReject.mutate()} disabled={bulkReject.isPending}>
                  {bulkReject.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Reject selected'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2 w-8"></th>
                <th className="text-left px-2 py-2">File</th>
                <th className="text-left px-2 py-2">From</th>
                <th className="text-left px-2 py-2">Date</th>
                <th className="text-left px-2 py-2">Type</th>
                <th className="text-right px-2 py-2">Confidence</th>
                <th className="text-left px-2 py-2">Status</th>
                <th className="text-right px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docsQ.isLoading ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : docs.length === 0 ? (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No documents in this filter.</td></tr>
              ) : docs.map((d) => (
                <InboxImportRow
                  key={d.id}
                  doc={d}
                  selected={selected.has(d.id)}
                  onToggleSelect={() => toggleSelect(d.id)}
                  onPreview={() => setPreview(d.id)}
                  onApprove={(createRule) => approve.mutate({ id: d.id, createRule })}
                  onReject={() => reject.mutate({ id: d.id, blocklist: false })}
                  isPending={approve.isPending || reject.isPending}
                />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <InboxImportPreviewSheet docId={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/web run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/apps/web/src/pages/reports/InboxImportsTab.tsx
git commit -m "feat(web): InboxImportsTab — filter bar + row table + bulk actions"
```

---

## Task 26: Mount the tab on Reports page

**Files:**
- Modify: `apps/web/src/pages/reports/ReportsPage.tsx`

- [ ] **Step 1: Add tab state + render**

Open `ReportsPage.tsx`. Add the import:

```tsx
import { InboxImportsTab } from './InboxImportsTab';
import { useSearchParams } from 'react-router-dom';
```

Inside the component, add tab state synced to URL:

```tsx
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'reports';
```

Add tab buttons before the existing reports content:

```tsx
      <div className="border-b mb-4">
        <nav className="flex gap-6 -mb-px">
          {[
            { id: 'reports', label: 'Reports' },
            { id: 'inbox-imports', label: 'Inbox imports' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('tab', t.id);
                setParams(next, { replace: true });
              }}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'inbox-imports' ? <InboxImportsTab /> : null}
      {tab === 'reports' ? (
        <>
          {/* existing reports content stays here, wrapped in this fragment */}
        </>
      ) : null}
```

(Wrap the existing return JSX inside the `tab === 'reports'` branch — the existing widgets like `RecentEmailImports` keep working.)

- [ ] **Step 2: Typecheck**

Run: `cd portfolioos && pnpm --filter @portfolioos/web run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add portfolioos/apps/web/src/pages/reports/ReportsPage.tsx
git commit -m "feat(web): Reports tabs — add Inbox imports"
```

---

## Task 27: Manual QA checklist

**Files:**
- Create: `packages/api/test/manual-qa-gmail-ingestion.md`

- [ ] **Step 1: Write the checklist**

Create:

```md
# Manual QA — Gmail Full-Inbox Ingestion

Run end-to-end against the Railway deployment after `prisma migrate deploy` + redeploy.

## Setup
- [ ] Anthropic API key set + `ENABLE_LLM_PARSER=true` on Railway.
- [ ] Google OAuth client + redirect URL set on Railway.
- [ ] Demo user can log in.

## Onboarding
- [ ] New user signs up. Dashboard shows the `ConnectGmailCard` CTA.
- [ ] Click "Connect Gmail". Google consent screen opens.
- [ ] Grant scope. Browser lands on `/gmail/scan-setup`.
- [ ] Date inputs default to last 5y → today.

## Scan
- [ ] Click "Start scan". Redirects to `/reports?tab=inbox-imports`.
- [ ] Progress strip shows running scan with live counts.
- [ ] Dashboard `GmailScanProgressCard` mirrors the same numbers.
- [ ] Discovered docs appear with `status=CLASSIFYING` then transition.

## Approval queue
- [ ] Filter by `status=Pending review` shows only `PENDING_APPROVAL` rows.
- [ ] Click filename → `InboxImportPreviewSheet` opens with the PDF rendered.
- [ ] Approve a contract note → status flips to `IMPORTING` → `IMPORTED`.
- [ ] `/import` history shows the new ImportJob with `gmailDocId` set.
- [ ] Re-upload of the same file content via `/import` is dedup'd (existing behaviour).

## Bulk + auto-approve
- [ ] Select 3 rows → "Approve selected" → all flip to `IMPORTED`.
- [ ] Click "✓ Always" on a row → upserts an enabled rule.
- [ ] Run a second scan → docs from that sender land directly in `APPROVED`.

## Reject + blocklist
- [ ] Reject a doc with blocklist=true → upserts a disabled rule.
- [ ] Re-run scan → matching docs appear with status `REJECTED` immediately.

## Cancel + resume
- [ ] Start a long scan, hit `POST /api/gmail/scan-jobs/:id/cancel`. Worker stops at next checkpoint.
- [ ] Verify scan status `CANCELLED` and no orphaned files in `UPLOAD_DIR/gmail-imports/`.

## Budget cap
- [ ] Set `AppSetting.llm.monthly_cap_inr=1` (or any tiny value).
- [ ] Start a scan → hits cap → scan completes with errorMessage describing the cap.
- [ ] Reset cap to 1000, hit `POST /api/gmail/scan-jobs/:id/resume` → remaining docs classify.

## Failure modes
- [ ] Disconnect the Gmail account mid-scan → scan FAILS with "reconnect Gmail".
- [ ] Upload a password-protected PDF as an attachment → doc status `PENDING_APPROVAL` with `classifierNotes='locked'`.
```

- [ ] **Step 2: Commit**

```bash
git add portfolioos/packages/api/test/manual-qa-gmail-ingestion.md
git commit -m "docs(qa): manual checklist for gmail full-inbox ingestion"
```

---

## Task 28: Final integration build + push

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd portfolioos && pnpm -r run typecheck`
Expected: clean across all packages.

- [ ] **Step 2: Full test suite**

Run: `cd portfolioos && pnpm -r run test`
Expected: clean. Failing tests block this task — fix before push.

- [ ] **Step 3: Apply migration to Neon (production DB)**

Run: `cd portfolioos && pnpm --filter @portfolioos/api exec prisma migrate deploy`
Expected: `Applying migration `20260507120000_gmail_full_inbox_pipeline`` then `All migrations have been successfully applied.`

- [ ] **Step 4: Push**

```bash
git push origin main
```

Railway will rebuild + redeploy.

- [ ] **Step 5: Post-deploy smoke**

After the new deploy is live (uptime <60s):
```bash
curl -sS https://mprofit-production.up.railway.app/health
curl -sS -X POST https://mprofit-production.up.railway.app/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo@portfolioos.in","password":"Demo@1234"}'
# extract accessToken, then:
curl -sS https://mprofit-production.up.railway.app/api/gmail/scan-jobs -H "Authorization: Bearer <token>"
```
Expected: 200 with empty array.

---

## Notes for implementers

- **MonitoredSender retirement:** This pipeline does not touch `MonitoredSender`. The old discovery endpoint (`POST /api/gmail/:id/discover`) and its UI remain — they're harmless. A follow-up cleanup task will remove them once usage telemetry confirms no callers.
- **`/api/mailboxes` listing:** Already lists Gmail-OAuth accounts. The dashboard's `hasGmail` check uses this — no new endpoint needed.
- **OnlyOffice preview note:** The `getDocPreviewUrl` controller currently issues a non-signed URL pointing at `/api/gmail/discovered-docs/:id/raw`. That endpoint authenticates via Bearer token — which the iframe-loaded URL won't carry. Two follow-up options once the rest is shipping:
  1. Issue a JWT-signed token mirroring `signedDownloadToken` and accept it on `/raw`.
  2. Use the existing OnlyOffice integration (would require materialising each discovered doc into a `Document` row first).
  Pick (1) on first iteration; spec'd separately to keep this plan focused on the pipeline itself.
- **Gmail token refresh:** `getOAuthClientForMailbox` must auto-refresh expired access tokens. If the existing connector doesn't, add the standard `googleapis` `client.on('tokens', persist)` hook there before merging.
