# B06 discovery — Account & access

Source commit 9d9025c4 · code-only · scope: B06 routes (#1–5, 13, 14, 26–28, 94, 105, 107, 108 in `_work/global/modules.md`) plus brief extra scope.

## Stack touch points
- Web: `apps/web/src/pages/{auth,onboarding,settings,pricing,legal,notFound,connect,connectors}`, `apps/web/src/components/auth/*`, `apps/web/src/components/ca/{GrantScopePanel,InviteEmailComposer,CaActivityFeed,AccessParts}` (rendered by Account Access), `apps/web/src/stores/auth.store.ts`, `apps/web/src/api/client.ts`, `apps/web/src/hooks/{useResolvedSession,useTokenRefresh,useNextPath}.ts`, `apps/web/src/lib/{desktopApp,razorpay,onboardingProgress,privacyPromise}.ts`, header Sign out + desktop download button.
- API: `routes/{auth,billing,notifications,connect,mcp,mcpOAuth,connectors,finfactor,adminLoanRates}.routes.ts`, `/api/fo/brokers/*` in `fo.routes.ts`, `/api/me/professional-access` in `ca.routes.ts`; services `auth/*`, `account/accountDeletion`, `billing/*`, `mcp/*`, `notifications/{config,alertPrefs,gmailSender}`, `security/securityAlerts`, `ca/caAccess` (client side), `ingestion/fno/brokerOauth`, `ingestion/finfactor/webhooks`.
- Jobs: accountDeletionJob (03:30 IST), mcpCleanupJob (03:40 IST), securityAlertJobs (every 15 min), keyRotationJobs/secretRotationJobs/piiAtRestJobs/startupSync (boot, operator only).

## Module checklist
- [x] AUTH — sign in, register, Google, 2FA challenge, forgot password, session refresh, sign out, security emails, 404
- [x] ONB — welcome, starter portfolio, picker, quick-add forms, finish/resume
- [x] SET — profile, plan card, 2FA, email notifications, loan rate alerts, desktop app, delete account, Account Access (6), loan rates admin, SMTP config (backend-only)
- [x] CONN — AI connectors (4 + approve page + MCP/OAuth backend), broker connectors, legacy connections, Finvu AA, Finfactor webhooks
- [x] PLAN — pricing, Razorpay upgrade, admin switch, plan expiry
- [x] LEGAL — AI-use notice, extension privacy policy (no in-app link)

## Brief items verified
- MCP ignores plan expiry — confirmed `packages/api/src/routes/mcp.routes.ts:48`.
- Pricing advertises ungated flags — confirmed `packages/shared/src/entitlements.ts:68`, `packages/shared/src/entitlements.ts:70`, `apps/web/src/pages/pricing/PricingPage.tsx:72`.
- ADMIN comment vs code — confirmed `packages/api/src/controllers/auth.controller.ts:38` vs `packages/api/src/middleware/requirePlan.ts:6`.
- Non-admin on admin route gets 401 — confirmed `packages/api/src/middleware/authenticate.ts:95`; side effect: web interceptor refreshes the session on that 401 (`apps/web/src/api/client.ts:98`).
- `/admin/mf-qualitative-facts` no 2FA, no nav — confirmed `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, only route reference `apps/web/src/App.tsx:203`.

## New defects found
- Logout route has no `authenticate`: logout is never audited and "everywhere" can never run (`packages/api/src/routes/auth.routes.ts:37`).
- Account Access invite email composer calls `/api/ca/clients/:id/invite-email/*`, mounted behind the professional two-factor gate (`packages/api/src/routes/ca.routes.ts:73`) — an account holder without two-factor sees "Preparing the email…" forever and can't get the link.
- Pricing lets a paid user buy a lower tier labelled "Upgrade to …"; no early renewal; plan expiry date never shown.
- Finvu card says holdings "sync automatically" but the data webhook only logs; no plan lock on the card (server 403 for FREE).
- Upstox setup hint points to a "Server redirect" box that only appears after setup.
- Settings → Connect Gmail says "then back here" but the callback goes to `/gmail/scan-setup`.
