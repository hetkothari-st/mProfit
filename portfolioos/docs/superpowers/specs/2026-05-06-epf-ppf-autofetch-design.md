# EPF + PPF Auto-Fetch — Design

**Date:** 2026-05-06
**Status:** Design approved; awaiting written-spec review.
**Author:** brainstormed via /superpowers:brainstorming
**Targets:** `packages/api`, `apps/web`, new `extension/` workspace.

---

## 1. Problem

EPF and PPF accounts are entered manually today (`apps/web/src/pages/assetClasses/EPFFormDialog.tsx`, `PPFNpsFormDialog.tsx`, `ProvidentFundPage.tsx`). Holdings stay stale, contributions/interest never reflect, no XIRR or cash-flow timeline for these accounts. Users must remember and type every monthly contribution.

## 2. Goal

Auto-fetch full passbook history (first fetch) and incremental updates (subsequent fetches) for:
- **EPF** — every member ID linked under one UAN (multi-establishment).
- **PPF** — accounts at SBI, India Post, HDFC, ICICI, Axis, PNB, Bank of Baroda (7 institutions).

Output: `CanonicalEvent` rows that project to `Transaction` + `CashFlow` rows; `HoldingProjection` recomputed; user sees real balances, real timeline, real XIRR.

## 3. Non-goals (v2 scope)

- Account Aggregator (TSP) integration — separate parallel track.
- DigiLocker integration — fallback only if Playwright path fully blocked later.
- Background unattended fetches (incompatible with mandatory OTP at every login).
- NPS auto-fetch (Phase 5-E item, separate adapter chain).

## 4. Decisions locked during brainstorm

| # | Decision |
|---|---|
| Q1 | Hybrid credential model: stored creds opt-in per account; OTP always live. |
| Q2 | Hybrid execution: browser extension primary, server-headless Playwright fallback. |
| Q3 | Full passbook on first fetch + incremental on later fetches via `sourceHash` dedup. |
| Q4 | All EPF member IDs (e2) + all 7 PPF banks (p4). |
| Q5 | EasyOCR-first CAPTCHA with user-prompt fallback (c2); on-demand refresh + monthly nudge (t2). |

## 5. Architecture overview

```
┌─────────────────────┐         ┌────────────────────────────────────┐
│  Browser extension  │ ◄────►  │  Railway server (existing API)     │
│  (primary)          │  HTTPS  │                                    │
│  - Chrome MV3       │         │  /epfppf/sessions/*  (REST)        │
│  - host_perms only  │         │  /epfppf/results/*                 │
│    for 8 portals    │         │  /epfppf/captcha/*                 │
│  - Scrapes DOM in   │         │  /epfppf/otp/*                     │
│    user's session   │         │                                    │
│  - POSTs            │         │  ┌──────────────────────────────┐  │
│    RawScrapePayload │         │  │ Adapter chain                │  │
└─────────────────────┘         │  │  - EpfoAdapter               │  │
                                │  │  - SbiPpfAdapter             │  │
┌─────────────────────┐         │  │  - IndiaPostPpfAdapter       │  │
│  Server-headless    │ ──────► │  │  - HdfcPpfAdapter            │  │
│  fallback           │         │  │  - IciciPpfAdapter           │  │
│  - Playwright on    │         │  │  - AxisPpfAdapter            │  │
│    Railway worker   │         │  │  - PnbPpfAdapter             │  │
│  - Stealth plugin   │         │  │  - BobPpfAdapter             │  │
│  - For users w/o    │         │  └──────────────────────────────┘  │
│    extension        │         │                                    │
└─────────────────────┘         │  Parser → CanonicalEvent[] → DLQ   │
                                │  → HoldingProjection.recompute     │
                                └────────────────────────────────────┘
```

Two execution paths share the same parse layer on the server. Extension submits raw HTML/PDF; server-headless produces the same `RawScrapePayload` shape. Single source of truth for parse logic.

Existing reuse: `packages/api/src/adapters/otpDriven/types.ts` (extend, do not replace), CanonicalEvent / IngestionFailure / HoldingProjection / AuditLog from CLAUDE.md schema.

## 6. Schema

New models in `packages/api/prisma/schema.prisma`:

```prisma
model ProvidentFundAccount {
  id                  String   @id @default(cuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id])
  portfolioId         String?
  portfolio           Portfolio? @relation(fields: [portfolioId], references: [id])

  type                PfType                 // EPF | PPF
  institution         PfInstitution          // EPFO | SBI | INDIA_POST | HDFC | ICICI | AXIS | PNB | BOB
  identifier          String                 // UAN for EPF, masked acct no for PPF; ENCRYPTED at rest via pgcrypto
  identifierLast4     String                 // for display
  holderName          String
  branchCode          String?                // PPF branch
  storedCredentials   Json?                  // { usernameCipher, passwordCipher, mpinCipher? } — nullable; opt-in
  credentialsKeyId    String?                // pgcrypto key reference for rotation

  status              PfAccountStatus  @default(ACTIVE)
  lastRefreshedAt     DateTime?
  lastFetchSource     PfFetchSource?         // EXTENSION | SERVER_HEADLESS | MANUAL_PDF

  currentBalance      Decimal? @db.Decimal(18,4)
  assetKey            String                  // "pf:epf:<sha(uan)>" | "pf:ppf:<inst>:<sha(acct)>"

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  memberIds           EpfMemberId[]
  fetchSessions       PfFetchSession[]

  @@unique([userId, assetKey])
  @@index([userId, status, lastRefreshedAt])
}

model EpfMemberId {
  id                       String   @id @default(cuid())
  providentFundAccountId   String
  account                  ProvidentFundAccount @relation(fields: [providentFundAccountId], references: [id], onDelete: Cascade)

  memberId                 String   // ENCRYPTED
  memberIdLast4            String
  establishmentName        String
  establishmentCode        String?
  dateOfJoining            DateTime? @db.Date
  dateOfExit               DateTime? @db.Date
  currentBalance           Decimal?  @db.Decimal(18,4)
  lastInterestUpdatedForFY String?                       // "2024-25"

  @@unique([providentFundAccountId, memberId])
}

model PfFetchSession {
  id                       String   @id @default(cuid())
  providentFundAccountId   String
  account                  ProvidentFundAccount @relation(fields: [providentFundAccountId], references: [id], onDelete: Cascade)
  userId                   String
  source                   PfFetchSource          // EXTENSION | SERVER_HEADLESS
  status                   PfFetchStatus
  startedAt                DateTime @default(now())
  completedAt              DateTime?
  captchaAttempts          Int     @default(0)
  ocrUsed                  Boolean @default(false)
  ocrSucceeded             Boolean?
  rawPayloadRef            String?
  eventsCreated            Int     @default(0)
  errorMessage             String?
  ingestionFailureId       String?

  @@index([providentFundAccountId, startedAt])
}

enum PfType            { EPF PPF }
enum PfInstitution     { EPFO SBI INDIA_POST HDFC ICICI AXIS PNB BOB }
enum PfAccountStatus   { ACTIVE NEEDS_REAUTH LOCKED INSTITUTION_CHANGED }
enum PfFetchSource     { EXTENSION SERVER_HEADLESS MANUAL_PDF }
enum PfFetchStatus     { INITIATED AWAITING_CAPTCHA AWAITING_OTP SCRAPING PARSING COMPLETED FAILED CANCELLED }
```

`CanonicalEventType` enum extensions (additive):

```
PF_EMPLOYER_CONTRIBUTION
PF_EMPLOYEE_CONTRIBUTION
PF_VPF_CONTRIBUTION
PF_INTEREST_CREDIT
PF_WITHDRAWAL
PF_TRANSFER_IN
PF_TRANSFER_OUT
PF_OPENING_BALANCE      // synthetic when first fetch cannot reach inception
```

RLS policies (CLAUDE.md §3.6) added to all three new tables: `USING (user_id = current_setting('app.current_user_id', true)::text)`.

Encryption: pgcrypto `pgp_sym_encrypt` with `APP_ENCRYPTION_KEY` env (Parameter Store in prod, `.env.local` dev). Same pattern as existing Gmail OAuth tokens.

## 7. Data flow

```
User clicks "Refresh" on PF account row
  → POST /epfppf/sessions { accountId }
  → PfFetchSession created (INITIATED)
  → Returns { sessionId, preferredSource }

If extension installed:
  Extension picks up session, runs in user's tab.

Else server-headless:
  Bull job pf-headless-fetch enqueued.
  Worker spawns Playwright (stealth).

Login:
  Fill username + password (from stored creds, else prompt user).

CAPTCHA:
  Read <img> bytes → POST /epfppf/captcha (server-side path)
  OR extension reads inline.
  Server tries EasyOCR; confidence >= 0.85 → submit.
  Else SSE push captcha_required → user types in modal → POST /epfppf/captcha.

OTP (sms/email):
  SSE push otp_required → user types in modal → POST /epfppf/otp.
  90s timeout → FAILED with retry CTA.
  OTP never persisted; held only in worker memory.

Per portal scrape:
  EPFO: list member IDs → for each, download passbook PDF + scrape balance HTML.
  PPF banks: navigate PPF account → download statement PDF + scrape transactions table.
  Output: RawScrapePayload {
    adapterId, adapterVersion, capturedAt,
    members: [{ memberId|accountIdentifier, establishmentName,
                passbookPdf {base64, sha256}, htmlSnapshots[],
                structuredRows[]? }]
  }

POST /epfppf/results { payload }
  → server stores raw blob (Railway volume / S3-compatible)
  → status PARSING.

Parse pipeline (per institution):
  pdfjs/pdf-parse → row tokens → mapper → CanonicalEvent[]
  Per row sourceHash =
    sha256(`pf:${institution}:${memberId|acctSha}:${eventDate}:${amount}:${type}:${seq}`)
  Insert with @@unique([userId, sourceHash]); duplicates rejected silently.
  Failures → IngestionFailure row; partial commit OK.

Project CONFIRMED canonical events:
  PF_*_CONTRIBUTION → CashFlow + Transaction (qty=₹/par, price=1).
  PF_INTEREST_CREDIT → CashFlow (income) + Transaction (BUY at par, source=INTEREST).
  PF_WITHDRAWAL → SELL Transaction + CashFlow.
  HoldingProjection.recomputeForAsset(portfolioId, assetKey).
  Status COMPLETED. eventsCreated set.

UI: account card → "Updated just now". Diff toast: "Imported 14 new entries (+₹38,400)".
```

Invariants enforced:
- Idempotency: re-fetching same passbook → zero new events (CLAUDE.md §3.3).
- Holdings derived: never directly mutated (CLAUDE.md §3.1).
- Partial commit: per-row failures isolated to DLQ.

SSE channel for prompts: `/epfppf/sessions/:id/events` (server → web). Frontend modal subscribes, posts back via REST.

## 8. Adapter framework

```ts
// packages/api/src/adapters/pf/types.ts

export interface PfAdapter {
  id: string;                    // "pf.epfo.v1" | "pf.ppf.sbi.v1" | ...
  version: string;
  institution: PfInstitution;
  type: PfType;
  hostnames: string[];           // ["passbook.epfindia.gov.in", "unifiedportal-mem.epfindia.gov.in"]

  scrape(ctx: ScrapeContext): Promise<RawScrapePayload>;        // server-headless only
  parse(raw: RawScrapePayload): Promise<ParseResult<PfCanonicalEvent>>;  // shared
}

export interface ScrapeContext {
  sessionId: string;
  account: ProvidentFundAccount;
  credentials?: { username: string; password: string; mpin?: string };
  prompt: {
    askCaptcha(imgBytes: Buffer): Promise<string>;
    askOtp(channel: "sms"|"email"): Promise<string>;
    askText(label: string): Promise<string>;
  };
  emit(status: PfFetchStatus, info?: any): void;
  abortSignal: AbortSignal;
}

export interface RawScrapePayload {
  adapterId: string;
  adapterVersion: string;
  capturedAt: string;
  members: Array<{
    memberId?: string;
    accountIdentifier?: string;
    establishmentName?: string;
    passbookPdf?: { base64: string; sha256: string };
    htmlSnapshots?: Array<{ url: string; html: string }>;
    structuredRows?: Array<{
      date: string; type: string; amount: string; balance?: string; raw: string;
    }>;
  }>;
}
```

```
adapters/pf/
├── types.ts
├── index.ts                       # registry: id → adapter
├── chain.ts                       # picks adapter by institution + type
├── shared/
│   ├── pdfPassbookParser.ts      # generic PDF table extractor (pdfjs)
│   ├── captcha.ts                # easyOcrAttempt() + userPromptFallback()
│   ├── credentials.ts            # decryptStored(), promptIfAbsent()
│   └── canonicalize.ts           # row → CanonicalEvent mapping rules
├── epf/
│   └── epfo.v1.ts
└── ppf/
    ├── sbi.v1.ts
    ├── indiaPost.v1.ts
    ├── hdfc.v1.ts
    ├── icici.v1.ts
    ├── axis.v1.ts
    ├── pnb.v1.ts
    └── bob.v1.ts
```

Two-layer split:
- **Scrape layer** = institution-specific Playwright/extension steps. Volatile. Versioned.
- **Parse layer** = institution-specific row mapper. Pure function. Tested with golden fixtures (CLAUDE.md §3.9: ≥5 fixtures per parser).

Versioning (CLAUDE.md §3.4): every emitted CanonicalEvent carries `sourceAdapter = "pf.ppf.sbi.v1"`, `sourceAdapterVer`. Format change → bump version → never in-place rewrite.

Per-adapter fixtures committed under `packages/api/test/fixtures/pf/<institution>/`. Anonymized: UAN/account/PAN scrubbed.

## 9. CAPTCHA + OTP UX

**Modal lifecycle (web app):**

```
Refresh button
   ▼
PfRefreshDialog opens, calls POST /epfppf/sessions
   ▼
EventSource("/epfppf/sessions/:id/events") subscribes
   ├── on "captcha_required" → render <CaptchaPrompt img={base64}>
   │      user types → POST /epfppf/captcha { sessionId, value }
   ├── on "otp_required"     → render <OtpPrompt channel="sms"|"email">
   │      user types → POST /epfppf/otp { sessionId, value }
   ├── on "status"           → progress bar + text ("Fetching member 2 of 3…")
   ├── on "completed"        → close modal, show diff toast
   └── on "failed"           → show error + "View in DLQ" button
```

**EasyOCR:** server runs OCR first (Tesseract.js inline, OR Python sidecar `easyocr` if added). Confidence ≥ 0.85 + length matches expected → submit silently. Otherwise push image to user. Outcome logged on `PfFetchSession.ocrUsed` + `ocrSucceeded` for tuning.

**OTP timeout:** 90 s session-side. Countdown shown. Expire → status `FAILED`, retry button.

**No OTP storage anywhere.** Held only in worker memory until consumed. Logged as `<redacted>`.

## 10. Credentials + security

- Storage opt-in (Q1.d): UI checkbox on first refresh — "Save credentials for faster refresh (encrypted)".
- If checked → POST creds with session → server encrypts via pgcrypto `pgp_sym_encrypt` using `APP_ENCRYPTION_KEY` env (CLAUDE.md §15.10 — Parameter Store in prod, `.env.local` dev).
- Persisted as `ProvidentFundAccount.storedCredentials` JSON: `{ usernameCipher, passwordCipher, mpinCipher? }`.
- Decryption only inside Bull worker process; never returned in API responses.
- "Forget credentials" button per account → null the column + AuditLog.
- Audit log rows for: `pf_account_create`, `pf_credentials_store`, `pf_credentials_use`, `pf_credentials_forget`, `pf_fetch_started`, `pf_passbook_view`.
- UAN / PPF account always encrypted at column level. Display layer only uses `identifierLast4`.
- Extension never reads stored creds from server. Either user types in browser tab (extension just observes), or server-headless path uses creds. Extension cannot exfiltrate.
- RLS (CLAUDE.md §3.6) on `ProvidentFundAccount`, `EpfMemberId`, `PfFetchSession`.
- Bot-detection mitigations (server-headless only): rotating real Chrome UA strings; `playwright-extra` stealth plugin; realistic click delays; per-account rate cap of 1 fetch / 6 hr.

## 11. Browser extension

Manifest V3, Chromium + Firefox.

```
extension/
├── manifest.json
├── background.ts           # service worker; manages sessions
├── content/
│   ├── epfo.ts             # epfindia.gov.in
│   ├── sbi.ts              # onlinesbi.sbi
│   ├── indiapost.ts        # ebanking.indiapost.gov.in
│   ├── hdfc.ts             # netbanking.hdfcbank.com
│   ├── icici.ts            # infinity.icicibank.com
│   ├── axis.ts             # axisbank.com
│   ├── pnb.ts              # netpnb.com
│   └── bob.ts              # bobnetbanking.bankofbaroda.in
├── popup/
│   └── index.html
└── shared/
    ├── api.ts              # talks to Railway /epfppf/*
    └── auth.ts             # bearer token paired with web session
```

Pairing: install extension → open popup → click "Pair with PortfolioOS" → opens web pairing page → web generates short-lived code → user pastes in extension → exchanges for long-lived bearer (stored in `chrome.storage.local`, encrypted by browser profile).

Per-host content script waits for user's normal login to succeed (DOM heuristic: passbook menu visible) → pulls passbook PDF / scrapes table → sends `RawScrapePayload`. Extension never asks user to re-login.

Permissions: `host_permissions` only for the 8 portal hostnames. No `<all_urls>`. Reviewable, minimal.

Update channel: Chrome Web Store + Firefox AMO. Auto-update.

## 12. Build sequence

| # | Milestone | Output | Days |
|---|---|---|---|
| 1 | Schema + migration + RLS + audit hooks | Models, enums, pgcrypto wiring | 2 |
| 2 | Server: session + SSE + captcha/otp endpoints | REST/SSE skeleton green | 2 |
| 3 | Adapter framework + golden-fixture harness | `pf/types.ts`, fixture runner | 1 |
| 4 | EPFO adapter (server-headless) — passbook PDF parser | end-to-end fetch one UAN; 5 fixtures | 4 |
| 5 | EPFO frontend: account add, refresh modal, member list, holdings projection | UI shipped | 3 |
| 6 | Manual PDF upload path (defensive fallback) | passbook upload works regardless of scrape | 1 |
| 7 | SBI PPF adapter | most users covered | 3 |
| 8 | Extension MV3 skeleton + EPFO content script | fetch via extension end-to-end | 4 |
| 9 | Extension SBI content script + pairing UX | parity with server path | 2 |
| 10 | Remaining 6 PPF adapters (India Post → HDFC → ICICI → Axis → PNB → BoB) | 1.5–2 d each | ~10 |
| 11 | Monthly nudge + alert center wiring | t2 cadence live | 1 |
| 12 | Bot-detection hardening + load test + DLQ ops UI | production gate | 2 |

Total ≈ 35 working days. Critical path 1 → 2 → 3 → 4 → 5 (≈ 12 days to first user value, EPF only).

## 13. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bank DOM changes mid-quarter | High | Versioned adapters; golden fixtures in CI; `INSTITUTION_CHANGED` status surfaces stale adapters |
| Extension store rejection | Medium | Minimal `host_permissions`; clear privacy policy; no remote code |
| EPFO portal CAPTCHA hardening | Medium | EasyOCR optional, user-prompt fallback always works |
| Server IP banned by banks | Medium | Extension-primary architecture sidesteps; rotating egress optional |
| Stored creds leak | Catastrophic | Per-row pgcrypto; key in Parameter Store; opt-in; audit every use |
| OTP MITM via SSE | Low | TLS-only; session-bound nonce; OTP never persisted |
| Multi-establishment EPF malformed | Medium | Per-member parser, partial commit, DLQ |
| Headless detection on Railway | High | Stealth plugin; degrade gracefully → "use extension" CTA |

## 14. Exit criteria

- [ ] Add EPF account with UAN → click Refresh (no extension) → server-headless fetches passbook for every member ID → CanonicalEvents created → HoldingProjection shows correct balance.
- [ ] Re-click Refresh → zero new events (idempotency invariant).
- [ ] Install extension, pair with web app → next Refresh uses extension path → passbook scraped without re-login.
- [ ] Add SBI PPF account → fetch via either path → passbook parsed end-to-end.
- [ ] Add accounts at all 7 PPF banks → each yields ≥ 5 golden fixtures + adapter passes CI.
- [ ] EasyOCR succeeds on ≥ 60% of CAPTCHAs in dev sample; user prompt covers remainder.
- [ ] OTP expiry = 90 s with countdown; expiry → graceful retry.
- [ ] DLQ shows all parse failures with raw payload reference; retry from DLQ works.
- [ ] Stored creds opt-in: "Save credentials" toggle works; "Forget" wipes column; AuditLog rows present.
- [ ] Monthly nudge appears when `lastRefreshedAt > 30 d`.
- [ ] RLS: cross-user access blocked at DB level (manual test with RLS-bypass disabled).

## 15. Open questions for plan stage

- EasyOCR vs Tesseract.js: pick after running both against EPFO CAPTCHA samples.
- Raw payload storage: Railway persistent volume vs S3-compatible — defer to plan stage; both viable.
- Extension distribution: Chrome Web Store first, Firefox AMO second; or both at GA.
- Whether to ship India Post adapter ahead of HDFC (market share vs adapter ease).
