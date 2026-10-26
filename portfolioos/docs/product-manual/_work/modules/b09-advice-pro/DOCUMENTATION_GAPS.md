# Documentation Gaps — Advisor, Professional workspace, Split Expenses (B09)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Investment Advisor, Professional workspace, Split Expenses

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; charts, QR codes, email rendering and phone share sheets were not seen.
- AI narration, named-fund advice and emails depend on operator configuration (keys, `RIA_VERDICTS_ENABLED`, SMTP) and live data; their production behaviour was not observed.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-ADV-005 | Which products recommendations name in production | Whether the house methodology is enabled/signed/fresh, so whether cards say House methodology, Algorithmically ranked or No product named | Depends on `RIA_VERDICTS_ENABLED`, a signed methodology and nightly snapshots | Check the latest `AdvisorRun.namedFundGate` |
| F-ADV-009 | AI narration availability and quality | Whether the switch is on, the model in use, how often narration is rejected by the consistency check | Operator config + live model | Check `/api/advisor/llm-status` and `advisor.prose.*` logs |
| F-ADV-014 | Fund scoring runs and freshness | Whether snapshots are produced nightly | Runtime job | Check `[fundScoring]` logs |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-ADV-004 | Defect: the allocation card takes targets from the newest-created *active* model portfolio, not the one tied to the user's current assessment. All four model portfolios are created active in order Conservative → Aggressive, so the card normally shows Aggressive targets; the engine (rebalance rule) uses the assessment's portfolio — the page and the advice disagree for anyone not Aggressive | `packages/api/src/controllers/advisor.controller.ts:203`, `packages/api/src/services/advisor/riskProfile.service.ts:100`, `packages/api/src/services/advisor/advisorFacts.builder.ts:208` | Read the target from the current assessment's `modelPortfolioId`? |
| F-ADV-007 | Defect: urgency badge thresholds (≤1 "Do first", ≤3 "Soon") never match engine priorities (minimum 5 = tax harvest base 5 + offset 0), so every card reads "When convenient" | `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:70`, `packages/api/src/services/advisor/constants.ts:80` | Rescale the badge to the 1–60 bands? |
| F-ADV-006 | Snoozed recommendations never return to Open: the page always filters by status, and the server's snooze-expiry rule applies only without a status filter; re-runs keep SNOOZED rows SNOOZED | `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:36`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:165`, `packages/api/src/services/advisor/advisorEngine.service.ts:67` | Flip expired snoozes back to OPEN? |
| F-ADV-005 | Live recommendations that no rule re-emits stay OPEN indefinitely (no stale-close step) | `packages/api/src/services/advisor/advisorEngine.service.ts:236` | Close or supersede advice no longer produced? |
| F-ADV-002 | Age rules differ: web 18–100, server schema 0–120 and service rejects ≤0 or >120 | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `packages/api/src/controllers/advisor.controller.ts:64`, `packages/api/src/services/advisor/riskProfile.service.ts:167` | Align? |
| F-ADV-014 | Job comment says 22:30 IST; cron is 22:45 IST | `packages/api/src/jobs/fundScoring.job.ts:117` | Doc follows the cron |
| F-CA-002 | Defect: **Invite your own clients** and **See advisor plans** link to `/settings/billing`, which is not a route (falls to the not-found page) | `apps/web/src/pages/ca/CaWorkspacePage.tsx:83`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:135`, `apps/web/src/App.tsx:280` | Point to `/pricing`? |
| F-CA-015 | Defect: client report downloads are gated on the professional's own plan (TAX_REPORT_CATALOG Plus; ACCOUNTING_MODULE Pro/Advisor), contradicting "acting for a client who invited you is free" | `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:114`, `packages/api/src/middleware/requirePlan.ts:16`, `packages/api/src/routes/ca.routes.ts:78` | Gate client-context downloads on the client grant instead? |
| F-CA-004 | Account holders emailing their own invitation from Account Access (B06) hit the professional two-factor gate, because preview/send live on `/api/ca` behind `requireProfessionalSecondFactor` | `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:98`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:603` | Move the client-side send off the professional gate? |
| F-CA-005 | Accept page copy promises the professional can "keep your books: creating and editing vouchers…", but new grants are view-only (all edit flags default false) | `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:44`, `packages/api/prisma/schema.prisma:520` | Reword? |
| F-CA-012 | On correction, net amount = gross + charges only for BUY; SIP, SWITCH_IN and DIVIDEND_REINVEST get gross − charges | `packages/api/src/controllers/caAccounting.controller.ts:591` | Treat all purchase-type transactions like BUY? |
| F-CA-003 | Workspace error toasts use `e.message` (axios text) instead of the server message for close and create-invitation | `apps/web/src/pages/ca/CaWorkspacePage.tsx:62`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:323` | Use `apiErrorMessage`? |
| F-CA-008 | Account, voucher and FMV deletes happen on one click with no confirmation | `apps/web/src/pages/ca/ClientBooksPage.tsx:381`, `apps/web/src/pages/ca/ClientBooksPage.tsx:484`, `apps/web/src/pages/ca/ClientBooksPage.tsx:653` | Add confirmation? |
| F-CA-017 | Activity summaries are written in the account holder's voice ("You granted your CA access…") but are also shown to the professional | `packages/api/src/services/ca/caAccess.service.ts:519` | Per-viewer wording? |
| F-SPLIT-001 | Friend totals silently drop a group's balance when no FX rate exists for that currency pair (only the "≈" marker is shown) | `packages/api/src/services/split/ledger.service.ts:58` | Show "rate unavailable"? |
| — | Module distinction not covered by global roles: a professional's four per-grant edit rights act like sub-roles of R-PROF | `packages/api/src/services/ca/caAccess.service.ts:116` | Keep as flags (documented per feature) |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-ADV-011 | Reorder override list (`PUT /api/advisor/approved-products/order`) | Backend-only — client helper exists, no caller | `packages/api/src/routes/advisor.routes.ts:58` |
| F-ADV-012 | Model portfolios list / edit target weights | Backend-only — no page edits targets | `packages/api/src/routes/advisor.routes.ts:65` |
| F-ADV-013 | Engine run history (`GET /api/advisor/runs`) | Backend-only | `packages/api/src/routes/advisor.routes.ts:39` |
| F-CA-018 | Records for clients without a login (SHADOW) | Deprecated — creation always refused; existing rows stay readable; CA may reinstate a revoked SHADOW record via API | `packages/api/src/services/ca/caAccess.service.ts:322`, `packages/api/src/routes/ca.routes.ts:103` |
| F-CA-019 | Ledger, P&L, balance sheet, voucher detail/edit, accounts tree | Backend-only for the workspace (reports cover P&L/balance sheet as downloads) | `packages/api/src/routes/ca.routes.ts:164` |
| F-SPLIT-020 | Contact edit/delete, contact UPI ID, settlement edit, group-type change, deleted-expense listing, label delete | Backend-only | `packages/api/src/routes/split.routes.ts:16`, `packages/api/src/routes/split.routes.ts:40` |
| — | `SplitSettings.detectEmail/detectPaste/detectReceipt/detectSms` columns | Hidden — schema only, no API or UI | `packages/api/prisma/schema.prisma:5437` |
| — | Advisor risk-assessment history (returned with the profile) | Hidden — not rendered | `packages/api/src/controllers/advisor.controller.ts:171` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-CA-015 | Reports tab offered to every professional | Downloads refused below Plus (catalogue) / Pro/Advisor (accounting) | `apps/web/src/components/ca/ClientReportsTab.tsx:81`, `packages/api/src/routes/reports.routes.ts:85` |
| F-CA-004 | Account Access offers **Send email** to every account holder (B06) | Send/preview require professional two-factor | `packages/api/src/routes/ca.routes.ts:73` |
| F-CA-001 | Sidebar comment says the entry shows for "someone who… pays for the advisor plan" | Entry shows only when client rows exist | `apps/web/src/components/layout/SidebarNav.tsx:157`, `apps/web/src/components/layout/SidebarNav.tsx:170` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Documented the six advisor rules inside F-ADV-005 rather than as six features | One feature per rule | Users experience them as one "Refresh" action; rules have no separate controls |
| Marked F-ADV-005, F-ADV-009, F-ADV-014 as Doc status Gaps | Verified | Their visible output depends on operator configuration not observable in code |
| Treated the professional's per-grant edit rights as conditions on R-PROF, not new roles | New R- IDs | Brief forbids new R- IDs |
| Documented Account Access (client side) only as dependency D-CA-001 | Full documentation here | Brief assigns `settings/ProfessionalAccessPage` to B06 |
| Marked F-CA-018 Deprecated | Hidden | Endpoint and UI text explicitly say records are "no longer created" |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
