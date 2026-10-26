# Glossary fragment (wave 0) — app-wide terms

> Source commit: 9d9025c4 · Code-only · Only terms verified in UI text. Module-specific terms belong in the batch glossaries.

| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| EveryPaisa | The product: a multi-asset portfolio ledger for Indian investors ("A multi-asset ledger for India"). |
| Plan | Your subscription level: **Free**, **Plus**, **Family** or **Pro/Advisor**. Each plan includes everything in the plans below it; a paid plan lasts 30 days (monthly) or 365 days (annual) from payment and then returns to Free. |
| Free | The starting plan for every new account: net worth and dashboard, manual entry across all asset classes, 1 portfolio, basic reports. |
| Plus | Paid plan that adds the full tax/CA report catalog, account-aggregator auto-import, more portfolios, AI insights and the AI Assistant, goal projections, and the other Plus features listed on the Pricing page. |
| Family | Paid plan that adds family sharing (3 seats included), consolidated family net worth and reports, on top of Plus. |
| Pro/Advisor | Top paid plan for accountants and advisors: adds the full accounting module, unlimited portfolios and clients, and F&O-heavy reports (Schedule 43), on top of Family. |
| Upgrade | Header button and sidebar card that open the plans page; not shown on Pro/Advisor. |
| Locked | A feature your plan does not include. It shows "<feature> is locked" with **View plans**. |
| Portfolio | A named container for holdings and transactions, used to separate, for example, long-term investments from trading or goal-based money. Free allows 1 portfolio. |
| Portfolio group | A bundle of several portfolios viewed together ("New group" on the Portfolios page). |
| Asset Classes | The sidebar section listing each kind of asset or liability you track (Stocks, Mutual Funds, FDs & RDs, Loans, …). You can reorder, hide and add classes. |
| By value / My order | Sort choice for the Asset Classes sidebar section: largest holding first, or the order you set with **Edit**. |
| Add asset class | Sidebar button that adds an optional class (Bonds, Crypto, Forex, NPS, Post Office) to the sidebar. |
| F & O | Futures and options (the derivatives asset class). |
| FDs & RDs | Fixed deposits and recurring deposits. |
| PPF & EPF | Public Provident Fund and Employees' Provident Fund, shown together on one page. |
| CAS | Consolidated Account Statement — the statement of your mutual fund and demat holdings that you can request from CAMS, KFintech, NSDL or CDSL by email. |
| Total Net Worth | The dashboard's headline figure: investments + real estate + vehicles, before loans and credit-card liabilities ("Gross"). |
| Portfolio value | Dashboard figure for tradable and accrual holdings only; excludes real estate, vehicles and insurance. |
| Total invested | Dashboard figure: the sum of cost basis across all holdings (what you put in). |
| Unrealised P&L | Dashboard figure: current value minus invested, across holdings only; not annualised. |
| Today's change | Dashboard figure: the day's move on market-priced holdings only (equities, mutual funds, crypto, gold). |
| Cash Activity | The page of bank credits and debits parsed from your connected accounts (sidebar Overview → Cash Activity). |
| Portfolio Score | Sidebar name for the **Financial Health Score** page: one number summarising emergency readiness, investing discipline, debt load, diversification, insurance and goal progress, recalculated every 24 hours. |
| Planning | Sidebar group with Goals, Will Maker, Succession, Tax Planning and AI connectors. |
| Succession | The page where you name nominees who get read-only access to your financial picture after inactivity or on a date you choose. |
| Will Maker | Guided tool to "write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign." |
| AI connectors | Settings page where you connect your own ChatGPT or Claude to your EveryPaisa data (read-only, for the areas you choose). |
| AI Assistant | The built-in chat ("Portfolio Assistant") opened from the round button on every page; answers need Plus or higher. |
| Inbox | Sidebar section for connecting Gmail ("Connect your Gmail") so statements and alerts are imported from your mailbox. |
| Alerts & Reminders | The bell in the header and the Alerts page: maturities, premium due dates, expiries and your own reminders. |
| Hide values / Show values | Header eye button that masks money amounts on screen on this browser. |
| Personal view | The default view showing only your own data. The opposite is a family view chosen from **Switch view**. |
| Switch view | Header menu (shown only to family members) to switch between **Personal view** and a family's combined view. |
| Accounts you manage | User-menu list of family members without their own login whose accounts you keep; choosing one shows "You are managing <name>'s account". |
| Back to my account | Returns from managing a family member's account to your own. |
| Account Access | Your page listing the accountants and advisors you have let into your books, what each can reach, and everything they have done; you can withdraw access here on any plan. |
| Client books | Sidebar entry (page title "Clients") for a professional who has been given access to someone else's books. |
| Two-factor sign-in | Signing in with an authenticator-app code in addition to your password, switched on in Settings; required for the professional workspace and admin tools. |
<!-- END GLOSSARY -->

Sources: `apps/web/src/components/layout/AuthLayout.tsx:114`, `apps/web/src/pages/pricing/PricingPage.tsx:30`, `apps/web/src/pages/pricing/PricingPage.tsx:41`, `apps/web/src/pages/pricing/PricingPage.tsx:56`, `apps/web/src/pages/pricing/PricingPage.tsx:67`, `packages/api/src/services/billing/planActivation.service.ts:4`, `packages/api/src/lib/effectivePlan.ts:16`, `apps/web/src/components/layout/Header.tsx:121`, `apps/web/src/components/common/LockedFeature.tsx:59`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:56`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:116`, `apps/web/src/pages/portfolios/PortfolioListPage.tsx:65`, `apps/web/src/pages/portfolios/PortfolioGroupDetailPage.tsx:67`, `apps/web/src/components/layout/AssetClassSectionList.tsx:99`, `apps/web/src/components/layout/AssetClassSectionList.tsx:108`, `packages/shared/src/types/preferences.ts:17`, `apps/web/src/components/layout/navItems.tsx:59`, `apps/web/src/components/layout/navItems.tsx:62`, `apps/web/src/components/layout/navItems.tsx:66`, `apps/web/src/pages/cas/CasPage.tsx:42`, `apps/web/src/pages/dashboard/DashboardPage.tsx:540`, `apps/web/src/pages/dashboard/DashboardPage.tsx:542`, `apps/web/src/pages/dashboard/DashboardPage.tsx:867`, `apps/web/src/pages/cashflows/CashFlowsPage.tsx:46`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:127`, `apps/web/src/components/layout/navItems.tsx:84`, `apps/web/src/pages/legacy/LegacyPage.tsx:89`, `apps/web/src/pages/settings/SettingsPage.tsx:169`, `apps/web/src/components/ai/AssistantButton.tsx:221`, `apps/web/src/components/layout/navItems.tsx:106`, `apps/web/src/pages/alerts/AlertsPage.tsx:406`, `apps/web/src/components/layout/Header.tsx:163`, `apps/web/src/components/family/FamilyScopeSwitcher.tsx:112`, `apps/web/src/components/family/FamilyScopeSwitcher.tsx:87`, `apps/web/src/components/layout/Header.tsx:236`, `apps/web/src/components/family/ActingAsBanner.tsx:28`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:122`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:74`, `packages/api/src/lib/professionalMfa.ts:29`, `apps/web/src/pages/settings/TwoFactorSection.tsx:128`, `apps/web/src/pages/will/WillOverviewPage.tsx:40`, `apps/web/src/pages/legacy/LegacyPage.tsx:43`.
