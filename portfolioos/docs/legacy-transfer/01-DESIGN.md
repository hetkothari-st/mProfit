# Legacy Transfer — Design

Status: DRAFT for owner review · 2026-10-12 · branch `feat/legacy-transfer`

> Ensure your loved ones are never left in the dark about your finances.
> Designate trusted nominees and automatically share your portfolio,
> insurance, and account information if you become inactive or on a
> scheduled date.

## 1. Locked decisions (owner, 2026-10-12)

| # | Decision | Value |
|---|---|---|
| D1 | Inactivity period | Default **90 days**; owner may pick any value **≥ 30 days** |
| D2 | Verifier | **Optional** |
| D3 | Nominee access | **Secure link + email OTP**. No app account needed |
| D4 | SMS | **Not in v1.** Email-only warnings. See §11 (deferred work) |
| D5 | Plan | **Premium feature** |
| D6 | Amounts | **Owner chooses per nominee**: full amounts, or "what exists + where" only |

## 2. Scope

**In v1**
- Owner setup: nominees, per-nominee scope, trigger (inactivity / scheduled date / both), optional verifier, personal letter, vault documents.
- Real-activity tracking on the owner account.
- Daily state-machine job: warnings, grace, verifier, release.
- One-click "I'm OK" reset link in every warning email.
- Nominee access: emailed link → email OTP → read-only Legacy View + PDF + claims checklist.
- Owner revoke at any time, before or after release.
- Full audit trail.

**Not in v1**
- SMS / WhatsApp / push channels (§11).
- Any transfer of money or assets. This is information only.
- Legal will generation.
- Nominees editing, exporting raw data or acting as the owner. **Never, in any version.**

## 3. Concepts

| Term | Meaning |
|---|---|
| **Owner** | The user who creates the Legacy Plan |
| **Legacy Plan** | One per owner: trigger settings + state |
| **Nominee** | A person who receives read-only access after release. Has a scope |
| **Verifier** | A nominee flagged to confirm that something has happened. Optional, max 1 in v1 |
| **Scope** | Which categories a nominee sees, whether amounts are shown, and whether full identifiers are shown |
| **Release** | The moment nominee access opens |
| **Real activity** | Something only the owner can do (§5). Background jobs never count |

## 4. Owner flow

1. `/legacy` (gated by `LEGACY_TRANSFER` feature). Non-premium users see the explainer + upgrade CTA.
2. **Add nominee**: name, email, relationship, priority (1..n). Pick from existing family members to prefill.
3. **Scope per nominee**:
   - Categories (multi-select): Investments · Bank accounts · Insurance · Loans & credit cards · Property · Vehicles · Provident fund / NPS · Documents (vault) · Personal letter
   - `showAmounts`: on → values visible; off → "what exists + where" (institution, type, nominee-on-record, how to claim) with no ₹ figures.
   - `revealIdentifiers`: off by default → account/folio/policy numbers masked to last 4.
   - Documents: pick specific vault documents, not the whole vault.
4. **Trigger**: `INACTIVITY` (days ≥ 30, default 90) · `SCHEDULED` (date) · `BOTH` (first to fire wins).
5. **Verifier** (optional): mark one nominee.
6. **Personal letter** (optional, encrypted): free text, e.g. "FD papers are in SBI Andheri locker #42".
7. **Activate**: requires password re-entry, plus the 2FA code if 2FA is on. Nominees are emailed an invite.
8. **Nominee invite**: the email says "X has named you as a trusted contact." It shows nothing financial. The nominee clicks Acknowledge, which proves the email works. Unacknowledged nominees are shown to the owner as ⚠ "email not confirmed".

Every later change (add/remove nominee, change scope, change trigger, pause, delete) needs the same re-auth and sends the owner a "your Legacy Plan was changed" email. This protects against a hijacked session silently adding an attacker as nominee.

## 5. Real-activity tracking

New column `User.lastActiveAt`. It is updated (throttled to once per hour per user) by:
- successful login / refresh-token rotation by the **owner's own** session
- any authenticated API request from the owner's own session
- clicking "I'm OK" in a Legacy email
- desktop / mobile app opens (they hit the API, so covered above)

It is **not** updated by:
- cron / background jobs (`runAsSystem`), Gmail/mailbox pollers, AA sync, price jobs
- a family admin acting on the owner via `X-Act-As`
- a nominee viewing the Legacy View

## 6. State machine

```
            activate
 DRAFT ───────────────► ARMED ◄──────────────────────────────┐
                          │ inactive ≥ D days                │
                          ▼                                  │
                     WARNING_1 ──(+7d)──► WARNING_2          │ any real activity
                                              │(+7d)         │ or "I'm OK"
                                              ▼              │ or owner pause/cancel
                                         FINAL_WARNING ──────┤
                                              │(+7d)         │
                                              ▼              │
                                           GRACE ────────────┤
                                  (nominees told "opens in 7d";
                                   verifier asked to confirm)
                                              │(+7d, or verifier confirms early)
                                              ▼
                                          RELEASED ──── owner revokes ──► ARMED (fresh)
```

- With 90-day inactivity: first warning at day 90, release at about **day 118**. With 30-day inactivity: release at about day 58.
- **Scheduled trigger**: owner reminders at T−30, T−7 and T−1 days, each with "Postpone / Cancel" links. Release on T, with no grace period (the owner chose the date deliberately).
- **BOTH**: both clocks run, and whichever reaches release first wins.
- **Verifier answers** (from the GRACE email):
  - "Yes, release now" → RELEASED immediately.
  - "No, they're fine" → back to FINAL_WARNING with a fresh 7-day clock, and the owner is alerted that the verifier vouched for them.
  - No answer → release at the end of GRACE. An unreachable verifier must never block release forever.
- **Nominees can never start a release.** The verifier can only speed up or delay one that is already in GRACE.
- Owner **pause** (e.g. long trek with no internet): ARMED → PAUSED until a chosen date (max 180 days), with no warnings. Resumes to ARMED.

### Daily job

`legacyTransferJob.ts`, `node-cron` at 10:00 IST, gated by `ENABLE_LEGACY_CRONS`. For each non-DRAFT plan it computes the target state from `lastActiveAt` + stage timestamps and advances **at most one stage per run**. It is idempotent: each stage writes `stageEnteredAt` and an outbox row keyed `(planId, stage, cycle)`, so a re-run never double-sends. The email send happens after the state commit (BUG-011 rule: no DB transaction around I/O).

## 7. Nominee access

1. On RELEASED: each acknowledged nominee gets an email with a link `/legacy/access/<token>`. The token is 32 random bytes; only its **SHA-256 hash is stored** (the same pattern as PR #230 invite tokens). Valid 90 days and re-issuable from the access page.
2. Opening the link → "Send code to n•••@gmail.com" → 6-digit email OTP (hash stored, 10-min expiry, 5 attempts, then 30-min lock). Rate limit is 5/min per IP and per token.
3. Correct OTP → a short-lived **legacy session** (httpOnly cookie, 30 min, scoped to `/api/legacy-view/*` only). It is a separate auth path and never a normal user JWT, so it cannot reach any other route.
4. **Legacy View** (read-only, server-filtered):
   - Summary header (net worth only if `showAmounts`).
   - One section per allowed category: institution · type · masked identifier · nominee on record · branch/contact · "how to claim" steps.
   - Liabilities flagged "action needed" (EMIs, card dues, premiums due).
   - Selected vault documents (download, audited).
   - Personal letter.
   - Claims checklist (static per category/institution type; v1 = generic Indian claim steps).
   - "Download PDF" with the same content and a "Generated for <nominee> on <date>" footer.
5. Data is **live** as of view time, not a snapshot from setup.
6. **Scope is enforced on the server** (`buildLegacyView(planId, nomineeId)`). Amount and identifier fields are dropped from the payload rather than hidden in the UI.

## 8. Owner revoke / return

- The owner logs in after release → banner "Your Legacy Plan was released on <date>". **Revoke all** or revoke per nominee.
- Revoke deletes the access tokens and legacy sessions immediately and emails each affected nominee ("access withdrawn by owner").
- The plan returns to ARMED with a fresh cycle.
- Removing a nominee at any time ends their access immediately.

## 9. Premium gating and lapse

- New flag `LEGACY_TRANSFER` in `packages/shared/src/entitlements.ts`. **Proposed min tier: `PLUS`** (lowest paid tier). Confirm.
- **Lapse rule (important):** if the owner dies, their subscription will lapse. So **a plan armed while premium stays armed and releases even after the plan lapses**. A lapsed owner can still pause, cancel, revoke and see status, but cannot add nominees or widen scope until they upgrade again.
- Account deletion (the existing purge job): delete the plan and nominees, and notify acknowledged nominees "X has closed their account". The `RESTRICT` FKs must be pre-cleared (see the account-deletion notes).

## 10. Data model (sketch)

```prisma
model LegacyPlan {
  id               String   @id @default(cuid())
  userId           String   @unique
  status           LegacyStatus   // DRAFT ARMED WARNING_1 WARNING_2 FINAL_WARNING GRACE RELEASED PAUSED
  triggerMode      LegacyTrigger  // INACTIVITY SCHEDULED BOTH
  inactivityDays   Int      @default(90)   // CHECK >= 30
  scheduledFor     DateTime? @db.Date
  pausedUntil      DateTime? @db.Date
  stageEnteredAt   DateTime?
  cycle            Int      @default(1)
  releasedAt       DateTime?
  letterEnc        String?  // encrypted personal letter
  activatedAt      DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  nominees         LegacyNominee[]
}

model LegacyNominee {
  id                 String   @id @default(cuid())
  planId             String
  userId             String   // owner, for RLS
  nameEnc            String
  emailEnc           String
  relationship       String
  priority           Int
  isVerifier         Boolean  @default(false)
  categories         String[] // scope
  documentIds        String[]
  showAmounts        Boolean  @default(false)
  revealIdentifiers  Boolean  @default(false)
  acknowledgedAt     DateTime?
  removedAt          DateTime?
}

model LegacyAccessToken   { id, nomineeId, userId, tokenHash @unique, purpose (INVITE|ACCESS|IM_OK|VERIFY), expiresAt, usedAt }
model LegacyOtp           { id, nomineeId, codeHash, expiresAt, attempts, lockedUntil }
model LegacyAccessSession { id, nomineeId, sessionHash @unique, expiresAt, ip, userAgent }
model LegacyOutbox        { id, planId, stage, cycle, recipient, sentAt  @@unique([planId, stage, cycle, recipient]) }

// User: + lastActiveAt DateTime?
```

- All tables carry `userId` (the owner) → added to `USER_SCOPED_MODELS` + RLS policies. The nominee path reads via `runAsSystem` inside `buildLegacyView`, which is the **only** system-context reader, and is covered by a dedicated scope test.
- Nominee name and email are encrypted at rest (Privacy P0 rule: all identifiers encrypted).
- Audit actions: `legacy.activate`, `legacy.change`, `legacy.warning_sent`, `legacy.im_ok`, `legacy.verifier_answer`, `legacy.released`, `legacy.nominee_otp_ok/fail`, `legacy.view`, `legacy.document_download`, `legacy.pdf`, `legacy.revoke`.

## 11. Deferred: SMS channel (do not forget)

Blocked on: owner obtaining a paid SMS provider (DLT-registered sender + templates, as required in India).

When available, add:
1. SMS copy of WARNING_1 / WARNING_2 / FINAL_WARNING to the owner's phone. **Highest value**, because email-only is the biggest false-release risk (spam folder, lost email access).
2. SMS to nominees on GRACE and RELEASED.
3. Optional SMS OTP for nominee access as an alternative to email OTP.
4. Nominee phone field (encrypted) and "verify phone" step at setup.
5. Register DLT templates for each message above.

The state machine needs no change. Only the outbox gets a `channel` column.

## 12. Risks

| Risk | Mitigation |
|---|---|
| False release (owner alive, emails in spam) | 3 warnings over 21 days + 7-day grace; "I'm OK" one-click; pause option; owner revoke; SMS later |
| Hijacked owner session adds attacker as nominee | Re-auth + 2FA on every change; change-alert email to owner; nominee invite needs acknowledgement |
| Leaked access link | Link alone is useless without email OTP; tokens hashed; 30-min sessions; audit |
| Nominee sees more than intended | Server-side scope filter; amounts/IDs dropped from payload; scope tests |
| Plan lapses after owner's death | Armed plans release regardless of later plan status (§9) |
| Email provider outage on release day | Outbox retries; release state is independent of the send; nominee can re-request the link from the access page |
| Legal expectation (will, claims) | Clear disclaimer: information sharing only, not a will or a transfer of title |

## 13. Build phases

1. **Backend core**: schema + migration + RLS, `lastActiveAt` tracking, plan/nominee CRUD with re-auth, entitlement flag, state-machine job + outbox + emails, I'm-OK/verifier links. Tests: state-machine table tests (fake clock), activity-source tests, idempotency, RLS.
2. **Owner UI**: `/legacy` setup wizard, nominee scope editor, status card ("next warning on …"), pause/revoke, change-alert emails.
3. **Nominee access**: token + OTP + legacy session, `buildLegacyView`, Legacy View page, PDF, claims checklist. Tests: scope filtering, OTP lockout, session isolation (legacy cookie rejected on every other route).
4. **Hardening**: audit coverage, account-deletion purge, lapse rule, manual QA on the Docker Postgres with a time-travel script.

## 14. Open questions for owner

1. Min tier for `LEGACY_TRANSFER`: **PLUS** (any paid plan) or **FAMILY**?
2. Warning cadence 7 + 7 + 7 + 7 (grace) days. OK?
3. Verifier "No, they're fine" → restart FINAL_WARNING. OK, or should it fully reset to ARMED?
4. Max pause length 180 days. OK?
