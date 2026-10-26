# Global roles (wave 0) — EveryPaisa

> Source commit: 9d9025c4 · Code-only (no UI verification) · Scope: whole application, app-level access only.
> Batches: use ONLY these `R-` IDs. Copy the heading lines you reference (`### <Role name> <!-- R-XXX -->`) into your `## Roles and profiles` section and your USER_ROLES_AND_PERMISSIONS.md. If your module distinguishes people in a way these roles do not cover, record it as an ambiguity in your gaps fragment — do not mint a new `R-` ID.

## How access is decided (read this first)

Access in EveryPaisa is decided by four independent things. A person's effective access is the combination:

1. **Signed in or not.** Every `/api/*` route except the public token/peek routes runs `authenticate`, which requires a Bearer access token (default lifetime `15m`, env `JWT_ACCESS_EXPIRY`) and binds the user id into the Postgres row-level-security context (`app.current_user_id`). Sources: `packages/api/src/middleware/authenticate.ts:13`, `packages/api/src/middleware/authenticate.ts:35`, `packages/api/src/config/env.ts:30`, `packages/api/src/lib/prisma.ts:362`. On the web, every page inside the app shell is wrapped in `ProtectedRoute`, which sends a signed-out visitor to `/login` (`apps/web/src/components/layout/ProtectedRoute.tsx:13`, `apps/web/src/App.tsx:157`).
2. **Plan tier** (`User.plan`: `FREE` < `PLUS` < `FAMILY` < `PRO_ADVISOR`, a strict ladder — each tier includes everything below it). Gated with `requireFeature(<FLAG>)` on the server and `useEntitlement` / `<LockedFeature>` on the web, both reading the single table `FEATURE_MIN_TIER`. ADMIN does **not** bypass plan gates. Sources: `packages/api/prisma/schema.prisma:372`, `packages/shared/src/entitlements.ts:11`, `packages/shared/src/entitlements.ts:25`, `packages/api/src/middleware/requirePlan.ts:13`, `apps/web/src/hooks/useEntitlement.ts:16`, `apps/web/src/components/common/LockedFeature.tsx:42`.
   - The plan in force is the **effective plan**: a paid plan whose `planExpiresAt` has passed counts as FREE (`packages/api/src/lib/effectivePlan.ts:16`). The effective plan is baked into the access token at sign-in/refresh (`packages/api/src/services/auth/auth.service.ts:65`).
3. **User role** (`User.role`: `INVESTOR`, `HNI`, `FAMILY_OFFICE`, `ADVISOR`, `CA`, `ADMIN`). The first five are self-chosen on the sign-up form ("I am") and grant **nothing** — `requireRole()` refuses to be configured with them. Only `ADMIN` is used for authorization. Sources: `packages/api/prisma/schema.prisma:360`, `packages/api/src/middleware/authenticate.ts:76`, `packages/api/src/middleware/authenticate.ts:84`, `apps/web/src/pages/auth/RegisterPage.tsx:207`.
4. **Relationship context** that changes *whose* data a request reaches: viewing a family (`X-Viewing-As-Family` header), managing a family member's account (`X-Act-As` header), acting for a client as a professional (CA grant), an external AI chatbot connection (MCP token), or a Succession nominee session (`x-legacy-session` header). These are the overlay roles R-FAMOWNER … R-NOMINEE below.

**Two-factor sign-in** is not a role but a session property (`mfa` claim): it is required, *switched on and used for this session*, by the professional workspace (R-PROF) and by admin tools (R-ADMIN). Error code `TWO_FACTOR_REQUIRED`, messages "Turn on two-factor sign-in (Settings) to use …" / "Sign out and sign in again with your authenticator code to use …". Sources: `packages/api/src/lib/professionalMfa.ts:23`, `packages/api/src/lib/professionalMfa.ts:29`, `packages/api/src/lib/professionalMfa.ts:37`.

**Feature-flag deployment switches** that remove whole role surfaces (operator config, not user-facing): `ENABLE_FAMILY` (default `true`) mounts `/api/families`, `/api/managed-profiles`, `/api/ca`, `/api/me/professional-access`, `/api/professional-invitations` (`packages/api/src/routes/index.ts:139`, `packages/api/src/config/env.ts:132`); `MCP_ENABLED` (default `false`) gates the AI connector endpoints (`packages/api/src/routes/mcpOAuth.routes.ts:9`, `packages/api/src/config/env.ts:136`).

## Plan-gated features (server-enforced)

| Feature flag | Minimum plan | Server gate | Notes |
|---|---|---|---|
| MULTIPLE_PORTFOLIOS / portfolio cap | FREE = 1, PLUS = 5, FAMILY = 5, PRO_ADVISOR = unlimited | `packages/api/src/lib/planLimits.ts:11` via `packages/api/src/controllers/portfolio.controller.ts:57` | Caps marked "placeholder" in code (`packages/shared/src/entitlements.ts:82`). Error: "Your FREE plan allows 1 portfolio. Upgrade to PLUS for multiple." |
| TAX_REPORT_CATALOG | PLUS | `packages/api/src/routes/reports.routes.ts:85` | |
| AA_FINVU_AUTOIMPORT | PLUS | `packages/api/src/routes/finfactor.routes.ts:42` | |
| AI_INSIGHTS | PLUS | `packages/api/src/routes/analytics.routes.ts:33` | |
| GOAL_PROJECTIONS | PLUS | `packages/api/src/routes/goals.routes.ts:9` | whole Goals API |
| AI_CONNECTOR | PLUS | `packages/api/src/routes/connect.routes.ts:44`, `packages/api/src/routes/mcp.routes.ts:49` | approve/widen only; list/revoke/decline ungated |
| ADVICE_ENGINE | PLUS | `packages/api/src/routes/advisor.routes.ts:27` | |
| MF_ANALYTICS | PLUS | `packages/api/src/routes/mfAnalytics.routes.ts:61`, `packages/api/src/routes/mfPortfolio.routes.ts:49` | `/methodology` deliberately ungated |
| WILL_MAKER | PLUS | `packages/api/src/routes/will.routes.ts:51` | document downloads ungated (`packages/api/src/routes/will.routes.ts:47`) |
| DOCUMENT_SORTER | PLUS | `packages/api/src/routes/documentSorter.routes.ts:10` | |
| LEGACY_TRANSFER (Succession) | PLUS | `packages/api/src/routes/legacy.routes.ts:21` | configure only; pause/resume/deactivate/revoke/remove-nominee ungated |
| FAMILY_SHARING | FAMILY | `packages/api/src/routes/families.routes.ts:180` (create family) and `packages/api/src/routes/families.routes.ts:463` (family dashboard) | |
| ACCOUNTING_MODULE | PRO_ADVISOR | `packages/api/src/routes/accounting.routes.ts:32`, `packages/api/src/routes/reports.routes.ts:86` | |
| CA_WORKSPACE | PRO_ADVISOR | `packages/api/src/routes/ca.routes.ts:87` | only for onboarding your OWN clients (`POST /api/ca/clients`, `/clients/invite`); acting for a client who invited you is free |
| FNO_SCHEDULE_43 | PRO_ADVISOR | `packages/api/src/routes/fo.routes.ts:46`, `packages/api/src/routes/tax.routes.ts:39` | |
| UNLIMITED_CLIENTS, PRIORITY_AA_REFRESH | PRO_ADVISOR | none found | Defined (`packages/shared/src/entitlements.ts:68`) but no `requireFeature` caller — "Priority AA refresh frequency" on the Pricing page is not enforced anywhere. |
| AI Assistant chat | PLUS (FREE = 0/day) | `packages/api/src/ai/rateLimit.ts:44` | daily caps PLUS 100, FAMILY 200, PRO_ADVISOR 500 (`packages/api/src/ai/rateLimit.ts:37`) |

## Roles

### Signed-out visitor <!-- R-VISITOR -->
- **Who:** anyone without a valid session (never signed up, signed out, or session expired).
- **Gets/loses it:** by not being signed in; becomes R-FREE (or higher) on sign-in.
- **Can:** open `/login`, `/register`, `/forgot-password`, `/privacy`, `/legal/ai-use`; open emailed token links that are deliberately outside the protected tree — family invitation accept (`/families/invitations/:token/accept`), profile claim (`/family/claims/:token`), Succession links (`/legacy/ok|ack|verify|access/:token`), professional invitation (`/professional-invitations/:token`). Public API: token "peek" endpoints, profile claim, Succession public actions (`packages/api/src/routes/families.routes.ts:65`, `packages/api/src/routes/families.routes.ts:88`, `packages/api/src/routes/legacy.routes.ts:39`).
- **Can't:** reach any page inside the app shell; any unknown URL also redirects to `/login` because the 404 page sits inside the protected shell (`apps/web/src/App.tsx:282`). `/connect/authorize` and `/onboarding` send the visitor to `/login` and back (`apps/web/src/App.tsx:139`).
- **Plan limits:** not applicable.
- Sources: `apps/web/src/App.tsx:111`, `apps/web/src/App.tsx:122`, `apps/web/src/App.tsx:125`, `apps/web/src/App.tsx:133`, `apps/web/src/components/layout/ProtectedRoute.tsx:13`.

### Free user <!-- R-FREE -->
- **Who:** any signed-in account whose effective plan is `FREE`. Covers user roles `INVESTOR`, `HNI`, `FAMILY_OFFICE`, `ADVISOR`, `CA` — identical access verified: these roles are self-assignable and refused by `requireRole` (`packages/api/src/middleware/authenticate.ts:76`); no other code branches on them.
- **Gets it:** every new account starts on FREE (registration never accepts a plan; `packages/api/src/controllers/auth.controller.ts:44`). A paid user drops back here when `planExpiresAt` passes (`packages/api/src/lib/effectivePlan.ts:16`). There is no automatic renewal: a Razorpay payment sets 30 days (monthly) or 365 days (annual) (`packages/api/src/services/billing/planActivation.service.ts:4`).
- **Loses it:** by paying for a higher plan on **Pricing** (`packages/api/src/routes/billing.routes.ts:83`).
- **Can:** use every ungated module on their own data: dashboard, 1 portfolio, transactions, all asset-class pages (manual entry), imports, Gmail inbox, CAS, alerts, settings, reports outside the PLUS catalog, Split Expenses, EMI Calculator, Account Access (see/withdraw professionals — never plan-gated, `packages/api/src/routes/ca.routes.ts:178`), join a family someone else created (accept invitation), act for a client who invited them (R-PROF), be a Succession nominee.
- **Can't:** any PLUS/FAMILY/PRO_ADVISOR feature in the table above; AI Assistant answers are tier-locked (quota 0).
- **Plan limits:** 1 portfolio.
- Sources: `packages/shared/src/entitlements.ts:83`, `packages/api/src/ai/rateLimit.ts:44`, `apps/web/src/pages/pricing/PricingPage.tsx:30`.

### Plus subscriber <!-- R-PLUS -->
- **Who:** signed-in account with effective plan `PLUS` (UI name "Plus").
- **Gets/loses it:** Razorpay checkout on **Pricing** (₹499/month or ₹4,999/year — `packages/shared/src/pricing.ts:19`); lapses to R-FREE at `planExpiresAt`.
- **Can:** everything R-FREE can, plus: up to 5 portfolios, tax/CA report catalog, AA/Finvu auto-import, AI insights, AI Assistant (100 messages/day), goal projections (Goals), AI connectors, Advisor engine, MF analytics, Will Maker, Documents sorter, Succession configuration.
- **Can't:** create a family, family dashboard, accounting module, CA practice onboarding, F&O Schedule 43.
- Sources: `packages/shared/src/entitlements.ts:26`, `packages/api/src/ai/rateLimit.ts:41`, `apps/web/src/pages/pricing/PricingPage.tsx:41`.

### Family subscriber <!-- R-FAMILY -->
- **Who:** effective plan `FAMILY` (UI "Family").
- **Gets/loses it:** Razorpay checkout (₹899/month — `packages/shared/src/pricing.ts:23`); lapses to R-FREE.
- **Can:** everything R-PLUS can, plus create families and use the family dashboard (FAMILY_SHARING); AI Assistant 200/day. Seat math: `Family.includedSeats` default 3, extra seat ₹199 (placeholders, `packages/api/prisma/schema.prisma:3789`).
- **Can't:** accounting module, CA practice onboarding, Schedule 43.
- **Plan limits:** 5 portfolios.
- Sources: `packages/shared/src/entitlements.ts:34`, `packages/api/src/routes/families.routes.ts:180`, `packages/api/src/ai/rateLimit.ts:39`.

### Pro/Advisor subscriber <!-- R-PRO -->
- **Who:** effective plan `PRO_ADVISOR` (UI "Pro/Advisor").
- **Gets/loses it:** Razorpay checkout (₹1,999/month — `packages/shared/src/pricing.ts:24`); lapses to R-FREE.
- **Can:** everything R-FAMILY can, plus Accounting (Trial Balance, P&L, Balance Sheet, Chart of Accounts, Tally export), onboarding your own clients into the CA workspace (still needs two-factor), F&O Schedule 43; unlimited portfolios; AI Assistant 500/day. The **Upgrade** header button and sidebar upgrade card are hidden only for this plan.
- **Can't:** admin tools (unless also R-ADMIN).
- Sources: `packages/shared/src/entitlements.ts:63`, `packages/shared/src/entitlements.ts:86`, `apps/web/src/components/layout/Header.tsx:114`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:22`.

### Administrator <!-- R-ADMIN -->
- **Who:** account with `User.role = ADMIN`. Orthogonal to plan: an admin's features still follow their own plan (no plan bypass, `packages/api/src/middleware/requirePlan.ts:6`).
- **Gets it:** not through the app — registration rejects `ADMIN` with "Cannot self-register with this role" (`packages/api/src/controllers/auth.controller.ts:44`); no script or endpoint in the repo grants it. **Loses it:** only out-of-band.
- **Can (admin-only):** set own plan without payment on **Pricing** (needs two-factor; `packages/api/src/routes/billing.routes.ts:135`, `apps/web/src/pages/pricing/PricingPage.tsx:228`); review/correct lender loan rates at `/settings/loan-rates` (needs two-factor; `packages/api/src/routes/adminLoanRates.routes.ts:17`; link shown in Settings only to admins, `apps/web/src/pages/settings/SettingsPage.tsx:176`); edit MF qualitative facts at `/admin/mf-qualitative-facts` (no two-factor, no nav link; `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`); Succession "test mode" (`packages/api/src/services/legacy/plan.service.ts:93`, `apps/web/src/pages/legacy/LegacyPage.tsx:132`). Active admins also receive data-ops alert emails from scheduled jobs (e.g. `packages/api/src/jobs/mfOpsAlertsJob.ts:75`).
- **Can't:** use a role guard while acting for a managed profile (acting identity is always `INVESTOR`, `packages/api/src/services/family/managedProfile.service.ts:109`).
- Note: `requireRole` answers a non-admin with **401** "Insufficient role", not 403 (`packages/api/src/middleware/authenticate.ts:95`).

### Family owner <!-- R-FAMOWNER -->
- **Who:** an ACTIVE `FamilyMember` with role `OWNER`, while the header switcher is set to that family (overlay on any plan role). The family creator becomes OWNER; a family may have several OWNERs.
- **Gets/loses it:** create a family (needs FAMILY plan) or be promoted by an owner; loses it when demoted, removed or on leaving.
- **Can (in family view):** read every active member's personal data and all family-shared portfolios, with no asset-class/category caps; write family-shared portfolios; invite/remove/edit members and their visibility caps (owner checks inside the service, e.g. `assertOwnerOf`). Writes to other members' *personal* data are never allowed.
- Sources: `packages/api/prisma/schema.prisma:3756`, `packages/api/src/services/family/familyScope.service.ts:182`, `packages/api/src/routes/families.routes.ts:56`.

### Family contributor <!-- R-FAMCONTRIB -->
- **Who:** ACTIVE `FamilyMember` with role `CONTRIBUTOR` (the default role for invitations), in family view.
- **Gets/loses it:** accept an owner's invitation; loses it on removal/leave/role change.
- **Can (in family view):** read the family's members' data and family-shared portfolios **filtered by their own** `visibleAssetClasses` / `visibleCategories` (empty list = sees nothing in that dimension); write family-shared portfolios; write only their own personal data.
- **Can't:** manage members; see beyond their caps.
- Sources: `packages/api/src/services/family/familyScope.service.ts:180`, `packages/api/src/services/family/familyScope.service.ts:207`, `packages/api/prisma/schema.prisma:3800`.

### Family viewer <!-- R-FAMVIEWER -->
- **Who:** ACTIVE `FamilyMember` with role `VIEWER`, in family view.
- **Gets/loses it:** invitation with role VIEWER; removal/leave/role change.
- **Can:** same visibility as R-FAMCONTRIB.
- **Can't:** write family-shared portfolios (`writableFamilyIds` empty); manage members.
- Sources: `packages/api/src/services/family/familyScope.service.ts:207`.

### Managing a family member's account <!-- R-MANAGER -->
- **Who:** a signed-in user who switched into a **managed profile** (a family member with no login whose account they keep) from the user menu ("Accounts you manage"). The web adds `X-Act-As` to data requests and shows the banner "You are managing <name>'s account. Everything you add here is theirs." with **Back to my account**.
- **Gets/loses it:** the profile must have `managedById` = this user, be an active shadow profile, and both must be ACTIVE in the same family — re-checked on **every** request, so removal ends it on the next click. Leaving via **Back to my account**.
- **Can:** read and write the managed person's data on data routes; features follow the **manager's** plan (`plan: manager.plan`).
- **Can't:** any "account route" — `/api/auth`, `/api/billing`, `/api/families`, `/api/ca`, `/api/me`, `/api/professional-invitations`, `/api/managed-profiles`, `/api/gmail`, `/api/mailboxes`, `/api/legacy` (error "Switch back to your own account to do this."); Will Maker and AI connectors also refuse (`packages/api/src/routes/will.routes.ts:15`, `packages/api/src/routes/connect.routes.ts:14`); the onboarding wizard redirects to `/portfolios` (`apps/web/src/components/family/NotWhileManaging.tsx:13`).
- Sources: `packages/api/src/middleware/authenticate.ts:40`, `packages/api/src/middleware/authenticate.ts:48`, `packages/api/src/services/family/managedProfile.service.ts:37`, `packages/api/src/services/family/managedProfile.service.ts:113`, `apps/web/src/api/client.ts:48`, `apps/web/src/components/family/ActingAsBanner.tsx:24`, `apps/web/src/components/layout/Header.tsx:236`.

### Professional acting for a client <!-- R-PROF -->
- **Who:** an accountant/advisor (any plan) who holds an ACTIVE `Client` grant on someone's books — sidebar entry **Client books** (`/ca`) appears once they hold at least one.
- **Gets it:** the account holder invites them from **Account Access** and they accept (`/professional-invitations/:token`), free for the professional; or an R-PRO practice invites/creates the client. **Loses it:** client or professional revokes; `accessFrom`/`accessUntil` window ends (enforced in the database).
- **Can:** with two-factor sign-in on and used this session — read the client's books within the grant scope (all or listed portfolios / asset classes / categories); edit only what the client allowed (`canEditBooks`, `canEditTransactions`, `canEditImports`, `canEditFmv`, all off by default); add and correct transactions.
- **Can't:** delete a client transaction (no route, no RLS policy, `packages/api/src/routes/ca.routes.ts:132`); open the workspace without two-factor.
- Sources: `packages/api/src/routes/ca.routes.ts:71`, `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:90`, `packages/api/src/services/ca/caAccess.service.ts:132`, `packages/api/prisma/schema.prisma:520`, `apps/web/src/components/layout/SidebarNav.tsx:170`, `apps/web/src/components/ca/ProfessionalTwoFactorGate.tsx:15`.

### AI chatbot connection <!-- R-AICONN -->
- **Who:** an external chatbot (ChatGPT or Claude) the user connected through **AI connectors** (OAuth approval at `/connect/authorize`); it calls `/mcp` with a bearer token (`epa_` prefix).
- **Gets/loses it:** user approves (needs PLUS); revoked from AI connectors (takes effect on the next call — no caching); token expiry. Only available when the operator sets `MCP_ENABLED=true`.
- **Can:** read-only access to the approved data areas (Investments, Retirement, Banking and cards, Loans, Insurance, Property, Vehicles, Goals and tax, Split expenses on by default; Will and succession, Documents off by default) and to opted-in family members.
- **Can't:** write anything; act while the user is managing someone else's account.
- Sources: `packages/api/src/routes/mcp.routes.ts:22`, `packages/api/src/services/mcp/oauth.service.ts:316`, `packages/shared/src/aiConnector.ts:6`, `packages/shared/src/aiConnector.ts:13`, `packages/api/src/routes/connect.routes.ts:28`.

### Succession nominee <!-- R-NOMINEE -->
- **Who:** a person named as nominee in someone's **Succession** plan; usually has no account.
- **Gets it:** after the plan releases, they receive a `/legacy/access/:token` link, confirm with a one-time code, and get a nominee session (`x-legacy-session`). **Loses it:** session expiry ("Session expired. Open your link again."), owner revokes.
- **Can:** read-only view of what the owner released, its PDF and released documents (`/api/legacy-view`).
- **Can't:** reach any other API — a nominee session is never a user token.
- Sources: `apps/web/src/App.tsx:128`, `packages/api/src/middleware/legacySession.ts:10`, `packages/api/src/routes/legacy.routes.ts:43`, `packages/api/src/routes/legacy.routes.ts:49`.

ROLE ORDER: R-VISITOR, R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN, R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER, R-MANAGER, R-PROF, R-AICONN, R-NOMINEE

Matrix guidance for batches: the first six columns are base roles (every signed-in person is exactly one of R-FREE/R-PLUS/R-FAMILY/R-PRO, possibly also R-ADMIN). R-FAMOWNER … R-NOMINEE are overlays — fill them only where your module behaves differently in that context; otherwise write "Same as base plan" or "n/a". R-ADMIN cells mean "admin-only powers"; otherwise an admin has the access of their plan.

## App-level permission table

| Route group | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sign-in, register, forgot password, legal pages | Allowed | Redirected to app | Redirected to app | Redirected to app | Redirected to app | Redirected to app | n/a | n/a | n/a | n/a | n/a | Denied | Denied | `apps/web/src/App.tsx:111` |
| Emailed token pages (family invite/claim, Succession links, professional invite) | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed | n/a | n/a | n/a | n/a | n/a | Denied | Allowed (access link) | `apps/web/src/App.tsx:116` |
| App shell pages (dashboard, portfolios, transactions, asset classes, imports, inbox, alerts, settings) | Denied (to /login) | Allowed | Allowed | Allowed | Allowed | Allowed | Family data within role | Family data within caps | Read family data within caps | Managed person's data | Client books only via /ca | Read-only via /mcp | Denied | `apps/web/src/components/layout/ProtectedRoute.tsx:13`, `packages/api/src/middleware/authenticate.ts:13` |
| Second portfolio and beyond | Denied | Denied (cap 1) | Up to 5 | Up to 5 | Unlimited | Per own plan | Per own plan | Per own plan | Per own plan | Manager's plan | n/a | Denied | Denied | `packages/api/src/lib/planLimits.ts:11` |
| PLUS features (reports catalog, AA, AI insights/assistant, goals, advisor, MF analytics, will, documents sorter, succession setup, AI connectors) | Denied | Denied (locked card) | Allowed | Allowed | Allowed | Per own plan | Per own plan | Per own plan | Per own plan | Manager's plan (Will, Succession, AI connectors refused) | n/a | n/a | Denied | `packages/shared/src/entitlements.ts:25` |
| Create family / family dashboard | Denied | Denied | Denied | Allowed | Allowed | Per own plan | Dashboard needs own FAMILY plan | Dashboard needs own FAMILY plan | Dashboard needs own FAMILY plan | Denied (account route) | n/a | n/a | Denied | `packages/api/src/routes/families.routes.ts:180`, `packages/api/src/routes/families.routes.ts:463` |
| Accounting, Schedule 43, CA practice onboarding | Denied | Denied | Denied | Denied | Allowed | Per own plan | Per own plan | Per own plan | Per own plan | Accounting by manager's plan; CA denied | Client books free | Denied | Denied | `packages/api/src/routes/accounting.routes.ts:32`, `packages/api/src/routes/ca.routes.ts:87` |
| Account Access (who can see my books) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Own account | Own account | Own account | Denied (account route) | n/a | Denied | Denied | `packages/api/src/routes/ca.routes.ts:178` |
| Client books (/ca) | Denied | Only with a grant + 2FA | Only with a grant + 2FA | Only with a grant + 2FA | Grant or own practice + 2FA | Per plan + 2FA | n/a | n/a | n/a | Denied | Allowed with 2FA | Denied | Denied | `packages/api/src/routes/ca.routes.ts:73` |
| Admin tools (loan rates, MF qualitative facts, plan switch) | Denied | Denied | Denied | Denied | Denied | Allowed (loan rates + plan switch need 2FA) | n/a | n/a | n/a | Denied | Denied | Denied | Denied | `packages/api/src/routes/adminLoanRates.routes.ts:17`, `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, `packages/api/src/routes/billing.routes.ts:135` |
| Succession nominee view | Denied | Denied | Denied | Denied | Denied | Denied | n/a | n/a | n/a | n/a | n/a | Denied | Allowed | `packages/api/src/middleware/legacySession.ts:10` |

## Notes, mismatches and possible defects (for batch gap fragments)

- **AI connector ignores plan expiry.** `/mcp` computes `planOk` from the stored `user.plan`, not `effectivePlan`, so a lapsed PLUS user's chatbot keeps reading data until the plan field changes (`packages/api/src/routes/mcp.routes.ts:48`, compare `packages/api/src/lib/effectivePlan.ts:16`). Owner: B06.
- **Stale comment claims ADMIN bypasses plan gates** (`packages/api/src/controllers/auth.controller.ts:38`) — the code says it does not (`packages/api/src/middleware/requirePlan.ts:6`). Documentation follows the code.
- **Schema comment vs code on family visibility.** `packages/api/prisma/schema.prisma:3752` says CONTRIBUTOR/VIEWER "never see another member's personal data"; `getEffectiveScope` makes every active member readable, filtered by caps (`packages/api/src/services/family/familyScope.service.ts:180`). Owner: B03.
- **Family dashboard needs the caller's own FAMILY plan.** A FREE/PLUS member invited into someone's family gets "This feature requires the FAMILY plan or higher" on the family dashboard endpoints (`packages/api/src/routes/families.routes.ts:463`), though other data routes honour family view regardless of plan. Owner: B03 to confirm UI behaviour.
- **Advertised but unenforced:** "Priority AA refresh frequency" and "Unlimited … clients" on Pricing map to flags with no gate (`packages/shared/src/entitlements.ts:68`, `packages/shared/src/entitlements.ts:70`). Owner: B06.
- Pricing page shows plan card features as marketing copy; the authoritative gates are the table above.
