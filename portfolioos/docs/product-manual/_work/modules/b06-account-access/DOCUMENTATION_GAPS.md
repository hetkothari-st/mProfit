# Documentation Gaps — Account & access (B06)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Sign-in & session, First-run setup, Settings & Account Access, Connections, Plans & billing, Legal pages

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; dialogs, Google's and Razorpay's windows and the QR code were not seen.
- Emails (verification, reset, deletion codes, two-factor and security notices, AI-connector notices, professional invitations) depend on the server's mail configuration and were not sent.
- Razorpay, Google sign-in, broker OAuth (Kite, Upstox, Angel One), Finvu/Finfactor and the MCP flow with ChatGPT/Claude need live credentials and were not exercised.
- Row-level-security effects were reasoned from service code, not run against a database.
- Some B06 defects listed below are being fixed in a separate PR; this fragment documents commit 9d9025c4 as it is.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-CONN-006 | Exact data returned by each of the 23 MCP tools | Field lists and masking per tool were not traced one by one; only the tool list, area gating, 10-second timeout, masking layer and audit were read | Size of `packages/api/src/services/mcp/tools/*` and no live chatbot | Review each tool file against the area descriptions in `packages/shared/src/aiConnector.ts:13` |
| F-CONN-009 | Finvu consent round trip | Whether Finvu returns a redirect URL, which statuses its webhook sends, and how expiry is reported | Needs the live Finfactor API | Run one consent in a staging environment and record the statuses |
| F-LEGAL-002 | Where `/privacy` is linked from | Probably the browser-extension store listing; no link exists in the web app | External listing not in the repo | Confirm the store listing points here |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-CONN-006 | Confirmed (brief item): `/mcp` decides whether the plan still includes the AI connector from the stored `user.plan`, not the effective plan, so a lapsed Plus/Family/Pro user's chatbot keeps reading data | `packages/api/src/routes/mcp.routes.ts:48`, `packages/api/src/lib/effectivePlan.ts:16` | Use `effectivePlan(user)` here |
| F-PLAN-001 | Confirmed (brief item): Pricing advertises "Priority AA refresh frequency" and "Unlimited portfolios / clients" for Pro/Advisor; the flags PRIORITY_AA_REFRESH and UNLIMITED_CLIENTS have no server gate or behaviour. "PDF/ITR exports" has no Pro-only flag at all | `apps/web/src/pages/pricing/PricingPage.tsx:72`, `apps/web/src/pages/pricing/PricingPage.tsx:74`, `packages/shared/src/entitlements.ts:68`, `packages/shared/src/entitlements.ts:70` | Remove the copy or implement the features |
| F-AUTH-002 | Confirmed (brief item): the registration schema comment says ADMIN "bypasses every plan-tier gate (see requireFeature)"; `requireFeature` explicitly does not bypass | `packages/api/src/controllers/auth.controller.ts:38`, `packages/api/src/middleware/requirePlan.ts:6` | Fix the comment |
| F-SET-014 | Confirmed (brief item): `requireRole` answers a non-admin with 401 "Insufficient role" instead of 403. The web client treats every non-auth 401 as an expired token, refreshes the session and retries once | `packages/api/src/middleware/authenticate.ts:95`, `apps/web/src/api/client.ts:98` | Return ForbiddenError (403) |
| F-SET-014 | Confirmed (brief item): `/api/admin/mf-qualitative-facts` (B02 page `/admin/mf-qualitative-facts`) requires only the ADMIN role — no two-factor session, unlike loan rates and the plan switch — and the page has no navigation link | `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, `apps/web/src/App.tsx:203`, `packages/api/src/routes/adminLoanRates.routes.ts:17` | Add `requireSecondFactor('admin tools')` and a Settings link for admins |
| F-SET-009 | Defect: the Account Access invitation email (preview, send, and the only way to see/copy the link) calls `/api/ca/clients/:id/invite-email/*`, mounted after `caRouter.use(requireProfessionalSecondFactor)`. An account holder without a two-factor session gets 403, and the composer shows "Preparing the email…" forever (no error state) | `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:98`, `apps/web/src/components/ca/InviteEmailComposer.tsx:105`, `packages/api/src/lib/professionalMfa.ts:14` | Mount client-initiated invite-email routes on `/api/me/professional-access` without the professional gate, and show the error |
| F-AUTH-007 | Defect: POST `/api/auth/logout` has no `authenticate`, so `req.user` is never set: logout is never written to the audit log and `everywhere: true` can never revoke all sessions | `packages/api/src/routes/auth.routes.ts:37`, `packages/api/src/controllers/auth.controller.ts:158`, `packages/api/src/controllers/auth.controller.ts:163` | Use an optional-auth middleware on logout |
| F-PLAN-002 | Defect: every paid plan button except the current one is enabled and labelled "Upgrade to <plan>", so a Pro/Advisor or Family user can buy a lower plan, which replaces the higher one; the server does not compare tiers. The current plan cannot be renewed early, and a new purchase's 30/365 days start at payment, not at the old end date | `apps/web/src/pages/pricing/PricingPage.tsx:217`, `packages/api/src/routes/billing.routes.ts:37`, `packages/api/src/services/billing/planActivation.service.ts:41` | Block or label downgrades; extend from the current end date |
| F-PLAN-004 | Gap: `planExpiresAt` is returned to the web app but never displayed, and no job reminds users before or after expiry | `packages/api/src/services/auth/auth.service.ts:66`, `apps/web/src/pages/settings/SettingsPage.tsx:140` | Show the end date in Settings → Plan; add a reminder |
| F-CONN-009 | Mismatch: the card says "Once approved, holdings sync automatically", but the data webhook only logs ("auto-sync on every data event is deferred"); the only web caller of the sync endpoint is the MF page's Finvu sandbox card | `apps/web/src/pages/connectors/FinvuConsentCard.tsx:138`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:110`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:133` | Fix the copy or implement sync |
| F-CONN-009 | Mismatch: the Finvu card has no plan lock; for Free users the consent list request fails every 10 seconds (shown as "No consents yet") and **Connect via Finvu** fails with "This feature requires the PLUS plan or higher" | `apps/web/src/pages/connectors/FinvuConsentCard.tsx:59`, `packages/api/src/routes/finfactor.routes.ts:42` | Wrap the card in a lock card |
| F-CONN-007 | Minor: the Upstox **Redirect URI** hint says to paste the value from "Server redirect" below, but that box renders only after the broker is configured | `apps/web/src/pages/connectors/ConnectorsPage.tsx:63`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:316` | Show the redirect URI in the setup form |
| F-SET-004 | Mismatch: the note says "You'll be redirected to Google, then back here", and the component comment says the callback returns to the dashboard; the callback actually goes to `/gmail/scan-setup`. The grant also includes Gmail read-only access (inbox import), not just sending | `apps/web/src/pages/settings/NotificationsSection.tsx:145`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:55`, `packages/api/src/ingestion/gmail/gmail.connector.ts:24` | Align copy with behaviour |
| F-SET-001 | Gap: the PAN field is always blank and Settings never shows whether a PAN is saved (`hasPan`/`panMasked` are unused on this page); a saved PAN cannot be cleared | `apps/web/src/pages/settings/SettingsPage.tsx:50`, `apps/web/src/pages/settings/SettingsPage.tsx:79` | Show the masked PAN and offer clear |
| F-SET-002 | Minor: plan and role are shown as raw enum codes (e.g. PRO_ADVISOR, INVESTOR) | `apps/web/src/pages/settings/SettingsPage.tsx:140`, `apps/web/src/pages/settings/SettingsPage.tsx:144` | Show display names |
| F-CONN-003 | Minor: PATCH connections requires the Plus plan even to narrow sharing, so a downgraded user can only revoke | `packages/api/src/routes/connect.routes.ts:71` | Allow narrowing without the plan |
| F-ONB-005 | Design note: "onboarding done" and "onboarding in progress" are localStorage-only, so behaviour differs per browser | `apps/web/src/lib/onboardingProgress.ts:10`, `apps/web/src/pages/dashboard/DashboardPage.tsx:358` | Store on the server? |
| F-AUTH-001 | Note: the auth rate limiter (20 per 15 minutes) is keyed by IP even on authenticated two-factor endpoints, so users behind one office NAT share it | `packages/api/src/middleware/rateLimit.ts:159`, `packages/api/src/routes/auth.routes.ts:44` | Key authenticated routes by user |
| F-LEGAL-002 | Mismatch: the extension privacy policy says pairings can be revoked from "your EveryPaisa web account settings"; the pairing UI lives in the PF area, not Settings | `apps/web/src/pages/legal/PrivacyPage.tsx:39`, `packages/api/src/routes/pf.routes.ts:52` | Update the policy text |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-AUTH-009 | Sign out everywhere (`everywhere: true` on logout) — no UI, and cannot work because the route lacks authentication | Backend-only | `packages/api/src/controllers/auth.controller.ts:158` |
| F-SET-015 | Per-user SMTP config (`GET/PUT/DELETE /api/notifications/config`): app password stored encrypted, host derived from the email domain (Gmail, Outlook, Yahoo, iCloud, Zoho only); no web page calls it and the test email refuses SMTP | Backend-only | `packages/api/src/routes/notifications.routes.ts:17`, `packages/api/src/services/notifications/config.service.ts:33`, `packages/api/src/services/notifications/config.service.ts:214` |
| F-CONN-006 | MCP server `/mcp`, OAuth `/oauth/register|authorize|token|revoke`, `/.well-known/oauth-*` — called by ChatGPT/Claude; 404 unless MCP_ENABLED=true and API_PUBLIC_URL set; tokens: access 1 hour, refresh 30 days with reuse detection; 60 calls/minute and 2000/day per connection; daily cleanup 03:40 IST | Backend-only | `packages/api/src/routes/mcpOAuth.routes.ts:9`, `packages/api/src/services/mcp/oauth.service.ts:24`, `packages/api/src/middleware/rateLimit.ts:310`, `packages/api/src/jobs/mcpCleanupJob.ts:11` |
| F-CONN-010 | Finfactor webhooks `/api/integrations/finfactor/webhook/{consent,data,historical,cohort,subscription}` — HMAC-verified; only `consent` changes data (AaConsent status) | Backend-only | `packages/api/src/routes/finfactor.routes.ts:75`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:36` |
| F-LEGAL-002 | Browser extension privacy policy at `/privacy` — public, no link anywhere in the web app | Hidden | `apps/web/src/App.tsx:114` |
| F-SET-009 | Invite a professional — Partial: the invitation is created, but delivering it (email or link) needs a two-factor session | Partial | `packages/api/src/routes/ca.routes.ts:73` |
| F-CONN-008 | Legacy broker connections — labelled "deprecated" in the UI; no way to create new ones | Live (deprecated) | `apps/web/src/pages/connectors/ConnectorsPage.tsx:342` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-SET-009 | Account Access is open to every plan without two-factor | Its email step requires the professional two-factor session | `packages/api/src/routes/ca.routes.ts:73` |
| F-CONN-009 | Finvu card buttons enabled for Free | Consent endpoints require PLUS | `packages/api/src/routes/finfactor.routes.ts:42` |
| F-CONN-006 | After a lapse the AI connectors page locks connect and hides Edit sharing | `/mcp` keeps serving the lapsed user's chatbot | `packages/api/src/routes/mcp.routes.ts:48` |
| F-SET-014 | Loan rates card shown by a browser role check | Server: ADMIN + two-factor; non-admin gets 401 not 403 | `apps/web/src/pages/settings/SettingsPage.tsx:176`, `packages/api/src/middleware/authenticate.ts:95` |
| F-PLAN-002 | Lower-tier "Upgrade to …" buttons enabled for paid users | Server accepts any tier | `apps/web/src/pages/pricing/PricingPage.tsx:217` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Documented the code at 9d9025c4 even where a fix PR is in flight | Wait for the fix | The brief says to document this commit |
| Put Account Access under the SET prefix as its own chapter | A separate prefix | The brief lists only AUTH, ONB, SET, PLAN, LEGAL, CONN for B06 |
| Put the not-found page under AUTH (F-AUTH-010) | LEGAL or a new prefix | It belongs to the signed-in routing; no NOTFOUND prefix exists |
| Documented the header Sign out and desktop-app link here | Leave to B10 | The brief assigns session handling and the desktop download button to B06 |
| Marked `/privacy` Hidden and kept it out of the end-user chapters except a pointer | Live | It has no in-app link |
| Listed the full PAN reveal endpoint as a dependency (D-AUTH-002) instead of a feature | Separate feature | Its only UI is the B02 dialog |
| Security, key-rotation, PII backfill and startup jobs only in operator configuration | Features | Brief: operator-config only; no user-visible effect except the security emails (F-AUTH-008) |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
| (none) | — | No sample identifiers were quoted; PAN, email and phone placeholders were paraphrased |
<!-- END ALLOWLIST -->
