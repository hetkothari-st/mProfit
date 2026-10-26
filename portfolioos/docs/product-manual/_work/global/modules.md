# Navigation and route map (wave 0) — EveryPaisa

> Source commit: 9d9025c4 · Code-only · Scope: whole application.
> Route table: `apps/web/src/App.tsx:108` (one flat `<Routes>`; there are no nested routers — wizard steps and tabs are URL params / search params inside pages). Nav config: `apps/web/src/components/layout/navItems.tsx:56` (lists), rendered by `apps/web/src/components/layout/SidebarNav.tsx:83`.

## Sidebar structure (exact labels, top to bottom)

The same `SidebarNav` renders the desktop sidebar and the phone drawer (`apps/web/src/components/layout/Sidebar.tsx:49`, `apps/web/src/components/layout/MobileNavDrawer.tsx:46`).

1. Brand block: logo + "EveryPaisa" wordmark, caption "Wealth · Ledger", links to `/dashboard` (`apps/web/src/components/layout/SidebarNav.tsx:88`, `apps/web/src/components/layout/SidebarNav.tsx:98`). Collapse/expand button (desktop ≥1024px only).
2. **Family tree** (only if the user belongs to a family): family name rows → `/family`, member rows → `/family/members/:userId` (`apps/web/src/components/layout/FamilyNavTree.tsx:17`).
3. **Overview**: Dashboard, Analytics, Portfolios, Family, Income, Portfolio Score, Advisor, Transactions, Cash Activity (`apps/web/src/components/layout/navItems.tsx:78`).
4. **Planning** (collapsible group, open by default): Goals, Will Maker, Succession, Tax Planning, AI connectors (`apps/web/src/components/layout/navItems.tsx:94`, `apps/web/src/components/layout/PlanningNavGroup.tsx:57`).
5. **Asset Classes** (reorderable/hideable, server-stored; header buttons **By value**/**My order**, **Edit**/**Done**, "+ N hidden", **Add asset class**): Bank Accounts, Stocks, F & O, Mutual Funds, Bonds, FDs & RDs, Gold & Silver, Crypto, Forex, PPF & EPF, NPS, Post Office, Real Estate, Rental, Vehicles, Insurance, Loans, Credit Cards, Others. Bonds, Crypto, Forex, NPS, Post Office are *optional*: absent until added via **Add asset class** (`apps/web/src/components/layout/navItems.tsx:56`, `apps/web/src/components/layout/AssetClassSectionList.tsx:99`, `packages/shared/src/types/preferences.ts:17`).
6. Unheaded: **Account Access** (everyone); **Client books** (only when the user holds ≥1 client grant) (`apps/web/src/components/layout/SidebarNav.tsx:163`, `apps/web/src/components/layout/SidebarNav.tsx:171`).
7. **Inbox**: Connect your Gmail (`apps/web/src/components/layout/navItems.tsx:104`).
8. **Tools**: Reports, Import, Connectors, CAS, Accounting, Split Expenses, EMI Calculator, Documents, Alerts, Settings (`apps/web/src/components/layout/navItems.tsx:110`). A commented-out "Failures (DLQ)" item is hidden (`apps/web/src/components/layout/navItems.tsx:121`).
9. Footer: upgrade card (Go Plus / Go Family / Go Pro/Advisor → `/pricing`, hidden on Pro/Advisor) and version label "v0.5.0" (`apps/web/src/components/layout/UpgradeSidebarCard.tsx:5`, `apps/web/src/components/layout/SidebarNav.tsx:193`).

Phone bottom tab bar (<768px): Dashboard, Portfolios, Transactions, Analytics, **More** (opens the drawer) (`apps/web/src/components/layout/MobileTabBar.tsx:6`, `apps/web/src/components/layout/MobileTabBar.tsx:44`).

Header (`apps/web/src/components/layout/Header.tsx:87`): date + "Welcome back, <name>", **Upgrade** (→ `/pricing`, not on Pro/Advisor), desktop-app download, family "Switch view" menu, Alerts bell (→ `/alerts`), theme toggle, Hide/Show values, user menu (**Profile & Settings**, **AI connectors**, **Back to my account**, "Accounts you manage", **Sign out**).

## Ownership overrides decided here (brief was ambiguous)

| Route | Page file | Brief dir rule says | Assigned to | Why |
|---|---|---|---|---|
| `/mutual-funds` | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx` | B01 (file in assetClasses) | **B02** | The page is the MF holdings list and renders B02's `pages/mutualFunds/*` dialogs and cards (`apps/web/src/pages/assetClasses/MutualFundsPage.tsx:23`); `/mutual-funds/analysis` and `/mutual-funds/:schemeCode` (B02) are its children. B01 lists it as a dependency. |
| `/provident-fund` | `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx` | B01 (file in assetClasses) | **B11** | Renders B11's `pages/pf/*` dialogs (`apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:9`) and links to `/provident-fund/extension` (B11). B01 lists it as a dependency; `EPFFormDialog.tsx` / `PPFNpsFormDialog.tsx` in assetClasses are used by it — B11 documents them for PF, B01 for NPS. |

Kept per the brief's dir rule, with a dependency note for the other batch: `/settings/professional-access` (B06; relationship lives in B09 → B09 lists D-), `/settings/loan-rates` (B06 admin page; data shown in B04's EMI Live rates → B04 lists D-), `/connectors` (B06 per brief though it is a data-import page; B07 lists D-).

## Route map

Legend — Nav: sidebar path with exact labels; "Link:" = reached only from an in-page link (file cited); "Email link" = only from an emailed URL; "Redirect" = `<Navigate>`; "None" = no UI entry found.

| # | Route | Page component | How it is reached | Batch |
|---|---|---|---|---|
| 1 | `/login` | `pages/auth/LoginPage` | Public; ProtectedRoute redirects here | B06 |
| 2 | `/register` | `pages/auth/RegisterPage` | Public; Login → **Create one** | B06 |
| 3 | `/forgot-password` | `pages/auth/ForgotPasswordPage` | Public; Login → **Forgot password?** | B06 |
| 4 | `/privacy` | `pages/legal/PrivacyPage` | Public | B06 |
| 5 | `/legal/ai-use` | `pages/legal/AiUsePage` | Public; Link: `apps/web/src/components/ai/AIAssistant.tsx:740` | B06 |
| 6 | `/families/invitations/:token/accept` | `pages/family/AcceptInvitationPage` | Email link (`packages/api/src/services/family/familyInviteEmail.service.ts:203`) | B03 |
| 7 | `/family/claims/:token` | `pages/family/ClaimProfilePage` | Email link (`packages/api/src/services/family/familyInviteEmail.service.ts:202`) | B03 |
| 8 | `/legacy/ok/:token` | `pages/legacy/LegacyLinkPage` (kind ok) | Email link | B03 |
| 9 | `/legacy/ack/:token` | `pages/legacy/LegacyLinkPage` (kind ack) | Email link | B03 |
| 10 | `/legacy/verify/:token` | `pages/legacy/LegacyLinkPage` (kind verify) | Email link | B03 |
| 11 | `/legacy/access/:token` | `pages/legacy/LegacyAccessPage` | Email link (`packages/api/src/services/legacy/publicLinks.service.ts:115`) | B03 |
| 12 | `/professional-invitations/:token` | `pages/ca/AcceptProfessionalInvitePage` | Email link (`packages/api/src/services/ca/caInviteEmail.service.ts:202`) | B09 |
| 13 | `/connect/authorize` | `pages/connect/ConnectAuthorizePage` (signed in, no shell) | Opened by the external chatbot's OAuth flow | B06 |
| 14 | `/onboarding` | `pages/onboarding/OnboardingWizard` (signed in, no shell, not while managing) | After registration / unfinished onboarding (`apps/web/src/pages/auth/RegisterPage.tsx:123`, `apps/web/src/pages/auth/loginRedirect.ts:26`) | B06 |
| 15 | `/` | Redirect → `/dashboard` | — | B10 |
| 16 | `/dashboard` | `pages/dashboard/DashboardPage` | Overview → Dashboard; tab bar; brand logo | B10 |
| 17 | `/analytics` | `pages/analytics/AnalyticsPage` | Overview → Analytics; tab bar | B08 |
| 18 | `/portfolios` | `pages/portfolios/PortfolioListPage` | Overview → Portfolios; tab bar | B10 |
| 19 | `/portfolios/:id` | `pages/portfolios/PortfolioDetailPage` | Link from Portfolios list | B10 |
| 20 | `/portfolio-groups/:id` | `pages/portfolios/PortfolioGroupDetailPage` | Link: `apps/web/src/pages/portfolios/PortfolioListPage.tsx` | B10 |
| 21 | `/family` | `pages/family/FamilyPage` | Overview → Family; family tree row | B03 |
| 22 | `/family/members/:userId` | `pages/family/FamilyMemberPage` | Family tree member rows | B03 |
| 23 | `/ca` | `pages/ca/CaWorkspacePage` (inside `ProfessionalTwoFactorGate`) | **Client books** (only with grants) | B09 |
| 24 | `/ca/clients/:clientId` | `pages/ca/ClientBooksPage` (2FA gate) | Link from Clients list | B09 |
| 25 | `/ca/invitations/:token/accept` | `pages/ca/AcceptCaInvitationPage` | Email link (`packages/api/src/services/ca/caInviteEmail.service.ts:203`) | B09 |
| 26 | `/settings/professional-access` | `pages/settings/ProfessionalAccessPage` | **Account Access** | B06 |
| 27 | `/settings/ai-connectors` | `pages/settings/AiConnectorsPage` | Planning → AI connectors; user menu → **AI connectors**; Settings card | B06 |
| 28 | `/settings/loan-rates` | `pages/settings/LoanRatesAdminPage` | Settings → "Loan rates" card → **Open loan rates** (admins only, `apps/web/src/pages/settings/SettingsPage.tsx:183`) | B06 |
| 29 | `/transactions` | `pages/transactions/TransactionsPage` | Overview → Transactions; tab bar | B10 |
| 30 | `/stocks` | `pages/assetClasses/StocksPage` | Asset Classes → Stocks | B01 |
| 31 | `/mutual-funds` | `pages/assetClasses/MutualFundsPage` | Asset Classes → Mutual Funds | **B02** (override) |
| 32 | `/mutual-funds/analysis` | `pages/mf/MfPortfolioPage` | Link: `apps/web/src/pages/assetClasses/MutualFundsPage.tsx` | B02 |
| 33 | `/mutual-funds/:schemeCode` | `pages/mf/FundDetailPage` | Links from MF pages | B02 |
| 34 | `/methodology/mf-score` | `pages/mf/MethodologyPage` | Link: `apps/web/src/pages/mf/MfPortfolioPage.tsx` | B02 |
| 35 | `/admin/mf-qualitative-facts` | `pages/mf/QualitativeFactsAdminPage` | None (typed URL; admin only) — Hidden | B02 |
| 36 | `/fo` | `pages/assetClasses/FuturesOptionsPage` | Asset Classes → F & O | B01 |
| 37 | `/bonds` | `pages/assetClasses/BondsPage` | Asset Classes → Bonds (optional) | B01 |
| 38 | `/fds` | `pages/assetClasses/FixedDepositsPage` | Asset Classes → FDs & RDs | B01 |
| 39 | `/fds/:holdingId` | `pages/assetClasses/FdDetailPage` | Link from FDs list | B01 |
| 40 | `/gold` | `pages/assetClasses/GoldPage` | Asset Classes → Gold & Silver | B01 |
| 41 | `/gold/:holdingId` | `pages/assetClasses/GoldAssetDetailPage` | Link from Gold list | B01 |
| 42 | `/crypto` | `pages/assetClasses/CryptoPage` | Asset Classes → Crypto (optional) | B01 |
| 43 | `/crypto/:holdingId` | `pages/assetClasses/CryptoDetailPage` | Link from Crypto list | B01 |
| 44 | `/forex` | `pages/forex/ForexPage` | Asset Classes → Forex (optional) | B11 |
| 45 | `/provident-fund` | `pages/assetClasses/ProvidentFundPage` | Asset Classes → PPF & EPF | **B11** (override) |
| 46 | `/provident-fund/extension` | `pages/pf/PfExtensionPairPage` | Link: `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx` | B11 |
| 47 | `/ppf` | Redirect → `/provident-fund` | Old bookmarks | B11 |
| 48 | `/epf` | Redirect → `/provident-fund` | Old bookmarks | B11 |
| 49 | `/nps` | `pages/assetClasses/NpsPage` | Asset Classes → NPS (optional) | B01 |
| 50 | `/post-office` | `pages/assetClasses/PostOfficePage` | Asset Classes → Post Office (optional) | B01 |
| 51 | `/post-office/:holdingId` | `pages/assetClasses/PostOfficeDetailPage` | Link from Post Office list | B01 |
| 52 | `/others` | `pages/assetClasses/OtherAssetsPage` | Asset Classes → Others | B01 |
| 53 | `/vehicles` | `pages/vehicles/VehicleListPage` | Asset Classes → Vehicles | B05 |
| 54 | `/vehicles/value` | `pages/vehicles/VehicleValuePage` | Link: `apps/web/src/pages/vehicles/VehicleListPage.tsx` | B05 |
| 55 | `/vehicles/:id` | `pages/vehicles/VehicleDetailPage` | Link from Vehicles list | B05 |
| 56 | `/rental` | `pages/rental/RentalListPage` | Asset Classes → Rental | B05 |
| 57 | `/rental/tenancies/:tenancyId` | `pages/rental/TenantKhataPage` | Link: `apps/web/src/pages/rental/RentalDetailPage.tsx` | B05 |
| 58 | `/rental/:id` | `pages/rental/RentalDetailPage` | Link from Rental list | B05 |
| 59 | `/insurance` | `pages/insurance/InsuranceListPage` | Asset Classes → Insurance | B11 |
| 60 | `/insurance/emergency-sheet` | `pages/insurance/EmergencySheetPage` | Link: `apps/web/src/pages/insurance/InsuranceListPage.tsx` | B11 |
| 61 | `/insurance/help` | `pages/insurance/HelpLibraryPage` | Links: `apps/web/src/components/insurance/EscalationPanel.tsx` and others | B11 |
| 62 | `/insurance/coverage` | `pages/insurance/CoveragePage` | Link: `apps/web/src/pages/insurance/InsuranceListPage.tsx` | B11 |
| 63 | `/insurance/:id` | `pages/insurance/InsuranceDetailPage` | Link from Insurance list | B11 |
| 64 | `/loans` | `pages/loans/LoanListPage` | Asset Classes → Loans | B04 |
| 65 | `/loans/given/:id` | `pages/loans/given/LoanGivenDetailPage` | Link: `apps/web/src/pages/loans/given/LoansGivenSection.tsx` | B04 |
| 66 | `/loans/:id` | `pages/loans/LoanDetailPage` | Link from Loans list | B04 |
| 67 | `/split` | `pages/split/SplitHomePage` | Tools → Split Expenses | B09 |
| 68 | `/emi` | `pages/emi/EmiCalculatorPage` | Tools → EMI Calculator | B04 |
| 69 | `/documents` | `pages/documentSorter/DocumentSorterPage` | Tools → Documents | B07 |
| 70 | `/legacy` | `pages/legacy/LegacyPage` | Planning → Succession | B03 |
| 71 | `/split/settings` | `pages/split/SplitSettingsPage` | Link: `apps/web/src/pages/split/SplitHomePage.tsx` | B09 |
| 72 | `/split/groups/:id` | `pages/split/GroupPage` | Link from Split home | B09 |
| 73 | `/split/expenses/:id` | `pages/split/ExpenseDetailPage` | Link from group/friend | B09 |
| 74 | `/split/friends/:key` | `pages/split/FriendPage` | Link from Split home | B09 |
| 75 | `/goals` | `pages/goals/GoalsPage` | Planning → Goals | B11 |
| 76 | `/will` | `pages/will/WillOverviewPage` | Planning → Will Maker | B03 |
| 77 | `/will/:id/execute` | `pages/will/execute/WillExecutePage` | Link from Will overview | B03 |
| 78 | `/will/:id/:step` | `pages/will/WillWizardPage` | Link from Will overview | B03 |
| 79 | `/income` | `pages/income/IncomePage` | Overview → Income | B11 |
| 80 | `/health-score` | `pages/intelligence/HealthScorePage` | Overview → Portfolio Score (page title "Financial Health Score") | B08 |
| 81 | `/advisor` | `pages/advisor/AdvisorPage` | Overview → Advisor | B09 |
| 82 | `/credit-cards` | `pages/creditCards/CreditCardListPage` | Asset Classes → Credit Cards | B04 |
| 83 | `/credit-cards/:id` | `pages/creditCards/CreditCardDetailPage` | Link from Credit Cards list | B04 |
| 84 | `/bank-accounts` | `pages/bankAccounts/BankAccountListPage` | Asset Classes → Bank Accounts | B10 |
| 85 | `/bank-accounts/:id` | `pages/bankAccounts/BankAccountDetailPage` | Link from Bank Accounts list | B10 |
| 86 | `/real-estate` | `pages/realEstate/RealEstateListPage` | Asset Classes → Real Estate | B05 |
| 87 | `/real-estate/:id` | `pages/realEstate/RealEstateDetailPage` | Link from Real Estate list | B05 |
| 88 | `/cashflows` | `pages/cashflows/CashFlowsPage` | Overview → Cash Activity | B11 |
| 89 | `/reports` | `pages/reports/ReportsPage` | Tools → Reports | B08 |
| 90 | `/tax` | `pages/tax/TaxPage` | Planning → Tax Planning | B08 |
| 91 | `/import` | `pages/imports/ImportPage` | Tools → Import | B07 |
| 92 | `/import/failures` | `pages/imports/FailuresPage` | None — nav item and page link both commented out (`apps/web/src/components/layout/navItems.tsx:121`, `apps/web/src/pages/imports/ImportPage.tsx:137`) — Hidden | B07 |
| 93 | `/ops/ingestion-failures` | Redirect → `/import/failures` | None | B07 |
| 94 | `/connectors` | `pages/connectors/ConnectorsPage` | Tools → Connectors | B06 |
| 95 | `/mailboxes` | Redirect → `/ingestion` | Old bookmarks | B07 |
| 96 | `/gmail/callback` | `pages/mailboxes/GmailCallbackPage` | Google OAuth return | B07 |
| 97 | `/gmail/scan-setup` | `pages/mailboxes/GmailScanSetupPage` | Link: `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx` | B07 |
| 98 | `/cas` | `pages/cas/CasPage` | Tools → CAS | B07 |
| 99 | `/ingestion` | `pages/ingestion/IngestionPage` | Inbox → Connect your Gmail | B07 |
| 100 | `/ingestion/senders` | `pages/ingestion/SendersPage` | Link: `apps/web/src/pages/ingestion/IngestionPage.tsx` | B07 |
| 101 | `/ingestion/history` | `pages/ingestion/ReviewPage` | Link: `apps/web/src/pages/ingestion/IngestionPage.tsx` | B07 |
| 102 | `/ingestion/review` | Redirect → `/ingestion` | Old bookmarks | B07 |
| 103 | `/ingestion/discovery` | Redirect → `/ingestion` | Old bookmarks | B07 |
| 104 | `/accounting` | `pages/accounting/AccountingPage` | Tools → Accounting | B11 |
| 105 | `/pricing` | `pages/pricing/PricingPage` | Header **Upgrade**; sidebar upgrade card; lock cards **View plans** | B06 |
| 106 | `/alerts` | `pages/alerts/AlertsPage` | Tools → Alerts; header bell | B10 |
| 107 | `/settings` | `pages/settings/SettingsPage` | Tools → Settings; user menu → **Profile & Settings** | B06 |
| 108 | `*` | `pages/notFound/NotFoundPage` ("This page doesn’t exist", **Go to dashboard**) | Any unknown signed-in URL | B06 |

### Routes per batch

| Batch | Count | Routes (#) |
|---|---|---|
| B01 | 13 | 30, 36–43, 49–52 |
| B02 | 5 | 31–35 |
| B03 | 12 | 6–11, 21, 22, 70, 76–78 |
| B04 | 6 | 64–66, 68, 82, 83 |
| B05 | 8 | 53–58, 86, 87 |
| B06 | 14 | 1–5, 13, 14, 26–28, 94, 105, 107, 108 |
| B07 | 13 | 69, 91–93, 95–103 |
| B08 | 4 | 17, 80, 89, 90 |
| B09 | 10 | 12, 23–25, 67, 71–74, 81 |
| B10 | 9 | 15, 16, 18–20, 29, 84, 85, 106 |
| B11 | 14 | 44–48, 59–63, 75, 79, 88, 104 |
| Total | 108 | |

## UNASSIGNED — global features and orphans, with suggested batch

| Item | What it is | Suggested batch | Evidence |
|---|---|---|---|
| Family "Switch view" menu (Personal view / each family, role shown) | Header control that sets family view (`X-Viewing-As-Family`) and clears cached data | B03 (B10 lists as D-) | `apps/web/src/components/family/FamilyScopeSwitcher.tsx:17`, `apps/web/src/api/client.ts:42` |
| "Accounts you manage" user-menu items, **Back to my account**, managing banner, onboarding blocked while managing | Managed-profile switching (R-MANAGER) | B03 (B10 lists as D-) | `apps/web/src/components/layout/Header.tsx:223`, `apps/web/src/components/family/ActingAsBanner.tsx:13`, `apps/web/src/components/family/NotWhileManaging.tsx:13` |
| Sidebar family tree | Household rows in nav | B03 | `apps/web/src/components/layout/FamilyNavTree.tsx:17` |
| Header **Upgrade** button, sidebar upgrade card, `<LockedFeature>` lock card ("<feature> is locked", **View plans**) | Plan upsell shell | B10 shell (B06 owns Pricing/checkout) | `apps/web/src/components/layout/Header.tsx:114`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:18`, `apps/web/src/components/common/LockedFeature.tsx:42` |
| Desktop app download button (header) | "Download EveryPaisa for Mac/Windows" | B06 (with Settings → Desktop app) | `apps/web/src/components/layout/DesktopDownloadButton.tsx:24`, `apps/web/src/pages/settings/DesktopAppSection.tsx` |
| Gmail auto-connect banner ("Auto-import statements from your inbox." **Connect Gmail**, dismiss) and global scan context | Shell banner for Gmail users | B07 | `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72`, `apps/web/src/components/layout/AppShell.tsx:11` |
| Session resume / token refresh / sign-out on expiry | `useResolvedSession`, `useTokenRefresh` | B06 | `apps/web/src/components/layout/ProtectedRoute.tsx:10`, `apps/web/src/components/layout/AppShell.tsx:33` |
| App error screen | `ErrorBoundary` around every page, reset on navigation | B10 | `apps/web/src/components/ErrorBoundary.tsx`, `apps/web/src/components/layout/AppShell.tsx:107` |
| Theme toggle, **Hide values**/**Show values**, alerts bell + unread badge (polled every 5 min), mobile tab bar, drawer swipe gestures, sidebar collapse, asset-class sidebar customisation, Planning group | Shell controls | B10 (already in brief; listed so nobody else documents them) | `apps/web/src/components/layout/Header.tsx:72`, `apps/web/src/components/layout/Header.tsx:149`, `apps/web/src/components/layout/Header.tsx:160`, `apps/web/src/components/layout/AppShell.tsx:40` |
| `PlaceholderPage` | Imported in App.tsx but never rendered — dead code | B10 (gap note only) | `apps/web/src/App.tsx:14`, `apps/web/src/pages/PlaceholderPage.tsx:5` |
| `MailboxesPage` | Imported but never routed (`/mailboxes` redirects) — dead code | B07 (gap note only) | `apps/web/src/App.tsx:37`, `apps/web/src/App.tsx:268` |
| Global search | Does not exist (no search control in header or shell) | B10 ("What this area doesn't do") | `apps/web/src/components/layout/Header.tsx:87` |
| Keyboard shortcuts | No app-wide shortcuts; only Escape closes menus, the AI panel and sidebar edit mode | B10 | `apps/web/src/components/layout/Header.tsx:35`, `apps/web/src/components/layout/AssetClassSectionList.tsx:63` |
| Billing checkout (Razorpay) and ADMIN plan switch | `/api/billing/*` behind Pricing | B06 | `packages/api/src/routes/billing.routes.ts:33`, `packages/api/src/routes/billing.routes.ts:133` |
| Notification channel config + alert preferences | `/api/notifications/*` (Settings → notifications section) | B06 | `packages/api/src/routes/notifications.routes.ts:16`, `apps/web/src/pages/settings/NotificationsSection.tsx` |
| Account deletion (scheduled, restore on sign-in) + `accountDeletionJob` | | B06 | `apps/web/src/pages/settings/DeleteAccountSection.tsx`, `packages/api/src/jobs/accountDeletionJob.ts` |
| Nightly stored-data integrity check (`dataIntegrityJob`) | Recomputes holdings/gains and flags drift | B08 | `packages/api/src/jobs/dataIntegrityJob.ts` |
| Price feeds (`priceJobs`: AMFI NAV 22:00, stock EOD 16:30 Mon–Fri, intraday every 15 min 09–15 Mon–Fri, corporate actions 20:00, commodities 23:30, crypto every 2 min), `corporateActionApplyJob`, `netWorthSnapshotJob` | Valuation inputs behind every holding | B10 (B01/B02 cite as D-) | `packages/api/src/jobs/priceJobs.ts:327`, `packages/api/src/jobs/corporateActionApplyJob.ts`, `packages/api/src/jobs/netWorthSnapshotJob.ts` |
| Security/ops jobs (`securityAlertJobs` every 15 min, key/secret rotation, PII-at-rest backfill, `startupSync`) | Operator-only | B06 operator-config table only | `packages/api/src/jobs/securityAlertJobs.ts:9`, `packages/api/src/jobs/keyRotationJobs.ts`, `packages/api/src/jobs/piiAtRestJobs.ts` |

## Backend-only route groups (no web caller), by suggested batch

| Mount | Endpoints | Why no web caller | Suggested batch |
|---|---|---|---|
| `/api/corporate-actions` | GET `/`, POST `/sync`, POST `/apply` | No reference anywhere in the web app source (corporate actions are applied by the daily job instead) | B10 (Backend-only) — `packages/api/src/routes/corporateActions.routes.ts:15` |
| `/mcp`, `/oauth/*`, `/.well-known/oauth-*` | MCP server + OAuth for external chatbots (R-AICONN) | Called by ChatGPT/Claude, not by the web app | B06 — `packages/api/src/routes/mcp.routes.ts:43`, `packages/api/src/routes/mcpOAuth.routes.ts:35` |
| `/api/integrations/finfactor/webhook` | Finvu/Finfactor account-aggregator webhook | Called by the AA provider | B06 (with `/connectors`) — `packages/api/src/routes/finfactor.routes.ts:89` |
| `/health`, `/ready` | Liveness/readiness | Operator / hosting healthcheck | none (operator) — `packages/api/src/index.ts:152`, `packages/api/src/index.ts:156` |

All other `/api/*` mounts in `packages/api/src/routes/index.ts:68` have at least one caller in the web app API client files (checked by path string; batches confirm per endpoint).

## Brief issues found

- All pages dirs named in the brief exist. Two pages live in another batch's dir (`MutualFundsPage`, `ProvidentFundPage` in `pages/assetClasses`) — resolved by the overrides above.
- `pages/connectors` is assigned to B06 (account/access), but the page is a data-import surface (broker and AA connectors, `apps/web/src/pages/connectors/FinvuConsentCard.tsx`); B07 may be the more natural owner. Kept at B06 as written.
- `pages/settings/ProfessionalAccessPage` (sidebar **Account Access**) is the client half of the CA relationship documented by B09; kept at B06 per the dir rule.
- B10's brief text says "global search/notifications": there is no global search; "notifications" in the shell is the Alerts bell (→ `/alerts`).
- `pages/PlaceholderPage.tsx` sits directly in `pages/` (not in any listed dir) and is dead code.
