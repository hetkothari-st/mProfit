# Getting started fragment (wave 0)

> Source commit: 9d9025c4 · Code-only — not visually verified · Merge copies only the text between the markers.

<!-- BEGIN GETTING-STARTED -->
## Getting started

### What EveryPaisa is

EveryPaisa is a multi-asset portfolio ledger for Indian investors. The sign-in screen describes it as "A multi-asset portfolio ledger built for investors who want one honest number, not ten dashboards. Stocks, mutual funds, real estate, vehicles, insurance — observed in one place." You record (or import) what you own and owe — stocks, mutual funds, F&O, bonds, fixed and recurring deposits, gold and silver, crypto, foreign currency, PPF/EPF, NPS, post-office schemes, real estate, rental property, vehicles, insurance, loans, credit cards and bank accounts — and EveryPaisa values them, shows your net worth, computes capital gains for tax, and keeps reminders for maturities, premiums and expiries. It runs in a web browser on computers and phones; a desktop app for Mac and Windows is offered once a release is published.

EveryPaisa has four plans — **Free**, **Plus**, **Family** and **Pro/Advisor**. Each plan includes everything in the plans below it. Free gives you net worth, the dashboard, manual entry across all asset classes and 1 portfolio. Features that need a higher plan show a lock card ("<feature> is locked — Upgrade to <plan> to unlock <feature>") with a **View plans** button. See **Roles and profiles** for exactly what each plan unlocks.

### Create an account and sign in

1. Open the sign-up page (**Create one** on the sign-in page). Fill in **Full name**, **Email**, **Password**, **Confirm password** and **I am** (Individual Investor, HNI, Family Office, Financial Advisor or Chartered Accountant — this describes you and does not change what you can do), then click **Create account**. If Google sign-in is set up for the site, you can instead sign up with your Google account.
2. EveryPaisa emails you a code. On **Verify your email**, enter the **Verification code** to finish creating the account. Every new account starts on the Free plan.
3. You are taken to the setup wizard ("What do you have?"), where you tick the kinds of things you own — Savings & investments, Physical assets, Loans & cards, Protection — and add the first few. Choose **Continue** to go through them, or **Skip — I'll add things later**. The wizard ends with **Go to dashboard**.
4. Next time, sign in on **Sign in** with **Email** and **Password** (or Google, when it is set up). Leave **Remember me on this device** ticked to keep the session on this device after the browser closes, or untick it on a shared computer (exact behaviour is described in the account chapter). If you turned on two-factor sign-in, you are asked for your authenticator code. **Forgot password?** lets you reset it by email code.

The full sign-up, sign-in, two-factor and password-reset rules are in the account chapter.

### The screen layout

**Sidebar (left).** At the top is the EveryPaisa logo (click it for the Dashboard) and, on large screens, a button to collapse the sidebar into an icon rail. Below it, in order:

- Your **family** (only if you belong to one): the family name and each member — click to open the family page or a member's page.
- **Overview**: Dashboard, Analytics, Portfolios, Family, Income, Portfolio Score, Advisor, Transactions, Cash Activity.
- **Planning** (click the heading to fold or unfold it): Goals, Will Maker, Succession, Tax Planning, AI connectors.
- **Asset Classes**: Bank Accounts, Stocks, F & O, Mutual Funds, FDs & RDs, Gold & Silver, PPF & EPF, Real Estate, Rental, Vehicles, Insurance, Loans, Credit Cards, Others. Bonds, Crypto, Forex, NPS and Post Office appear only after you add them with **Add asset class**. **Edit** lets you drag to reorder and hide classes (click **Done** to save; hidden ones are counted as "+ N hidden"). **By value** / **My order** switches between sorting by how much you hold (largest first) and your own order; By value is the starting choice.
- **Account Access** — who you have let into your books. **Client books** appears here only if someone has given you access to theirs.
- **Inbox**: Connect your Gmail.
- **Tools**: Reports, Import, Connectors, CAS, Accounting, Split Expenses, EMI Calculator, Documents, Alerts, Settings.
- At the bottom: an upgrade card (**Go Plus**, **Go Family** or **Go Pro/Advisor**; not shown on Pro/Advisor) and the version number.

**Top bar.** On the left, today's date and "Welcome back, <your name>". On the right:

- **Upgrade** — opens the plans page (not shown on Pro/Advisor).
- A desktop-app download button (computers only, once a release exists).
- **Switch view** — only if you belong to a family: choose **Personal view** or a family to see that family's combined data. Your choice is remembered on this browser.
- The bell — **Alerts & Reminders**, with a count of unread alerts (checked every 5 minutes).
- The sun/moon button — switch between dark mode (the starting theme) and light mode.
- The eye button — **Hide values** masks money amounts on screen (for example when sharing your screen); **Show values** brings them back.
- Your initials — opens a menu with **Profile & Settings**, **AI connectors**, the family members whose accounts you keep ("Accounts you manage", if any), **Back to my account** (while managing someone else's account) and **Sign out**.

**Banners under the top bar.** While you manage a family member's account, a strip says "You are managing <name>'s account. Everything you add here is theirs." with **Back to my account**. If you signed up with a Gmail address and have not connected Gmail, a strip offers **Connect Gmail** ("Auto-import statements from your inbox."), which you can dismiss.

**AI Assistant.** A round button in the bottom-right corner of every page ("Ask the AI Assistant") opens the Portfolio Assistant chat. On a phone it slides out of the way while you scroll down and comes back when you scroll up. Answers need the Plus plan or higher.

### On a phone

Below 768 pixels wide the sidebar is replaced by a bottom bar with **Dashboard**, **Portfolios**, **Transactions**, **Analytics** and **More**. **More**, the menu button at the top left, or swiping right anywhere on the page opens the full sidebar as a drawer; swipe left or pick a page to close it. Between 768 and 1023 pixels the sidebar shows as a narrow icon rail.

### Moving around

- Click any sidebar item to open its page; the current page is highlighted.
- Pages open at the top; the browser **Back** button returns you to where you were scrolled.
- Some pages are reached from inside other pages (for example a portfolio, fund or vehicle detail page from its list).
- Typing an address that does not exist shows "This page doesn’t exist" with **Go to dashboard**. If you are signed out, any page sends you to **Sign in** and back to that page afterwards.
- There is no app-wide search box and no app-wide keyboard shortcuts; **Escape** closes open menus and panels.
<!-- END GETTING-STARTED -->

Sources: `apps/web/src/components/layout/AuthLayout.tsx:67`, `apps/web/src/components/layout/AuthLayout.tsx:114`, `apps/web/index.html:17`, `apps/web/src/components/brand/BrandLogo.tsx:27`, `apps/web/src/pages/pricing/PricingPage.tsx:30`, `apps/web/src/components/common/LockedFeature.tsx:59`, `apps/web/src/pages/auth/RegisterPage.tsx:131`, `apps/web/src/pages/auth/RegisterPage.tsx:207`, `apps/web/src/pages/auth/RegisterPage.tsx:221`, `apps/web/src/stores/auth.store.ts:31`, `apps/web/src/pages/auth/RegisterPage.tsx:233`, `apps/web/src/pages/auth/RegisterPage.tsx:279`, `apps/web/src/pages/auth/RegisterPage.tsx:300`, `apps/web/src/pages/auth/RegisterPage.tsx:123`, `packages/api/src/controllers/auth.controller.ts:44`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:114`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:173`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:272`, `apps/web/src/pages/onboarding/onboardingItems.ts:43`, `apps/web/src/pages/auth/LoginPage.tsx:121`, `apps/web/src/pages/auth/LoginPage.tsx:138`, `apps/web/src/pages/auth/LoginPage.tsx:199`, `apps/web/src/pages/auth/LoginPage.tsx:226`, `apps/web/src/components/auth/GoogleSignInButton.tsx:100`, `apps/web/src/components/layout/SidebarNav.tsx:88`, `apps/web/src/components/layout/SidebarNav.tsx:163`, `apps/web/src/components/layout/SidebarNav.tsx:171`, `apps/web/src/components/layout/SidebarNav.tsx:193`, `apps/web/src/components/layout/navItems.tsx:56`, `apps/web/src/components/layout/navItems.tsx:78`, `apps/web/src/components/layout/navItems.tsx:94`, `apps/web/src/components/layout/navItems.tsx:104`, `apps/web/src/components/layout/navItems.tsx:110`, `apps/web/src/components/layout/PlanningNavGroup.tsx:57`, `apps/web/src/components/layout/AssetClassSectionList.tsx:113`, `apps/web/src/components/layout/AssetClassSectionList.tsx:175`, `apps/web/src/components/layout/AssetClassSectionList.tsx:188`, `apps/web/src/hooks/useSidebarClassValues.ts:54`, `packages/shared/src/types/preferences.ts:17`, `apps/web/src/components/layout/UpgradeSidebarCard.tsx:5`, `apps/web/src/components/layout/Sidebar.tsx:20`, `apps/web/src/hooks/useMediaQuery.ts:36`, `apps/web/src/components/layout/Header.tsx:103`, `apps/web/src/components/layout/Header.tsx:114`, `apps/web/src/components/layout/Header.tsx:72`, `apps/web/src/components/layout/Header.tsx:136`, `apps/web/src/components/layout/Header.tsx:152`, `apps/web/src/components/layout/Header.tsx:163`, `apps/web/src/components/layout/Header.tsx:214`, `apps/web/src/components/layout/Header.tsx:261`, `apps/web/src/stores/theme.store.ts:18`, `apps/web/src/stores/familyScope.store.ts:32`, `apps/web/src/components/family/FamilyScopeSwitcher.tsx:87`, `apps/web/src/components/family/FamilyScopeSwitcher.tsx:112`, `apps/web/src/components/family/ActingAsBanner.tsx:24`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:89`, `apps/web/src/components/layout/DesktopDownloadButton.tsx:24`, `apps/web/src/components/ai/AssistantButton.tsx:158`, `apps/web/src/components/ai/AssistantButton.tsx:79`, `packages/api/src/ai/rateLimit.ts:44`, `apps/web/src/components/ai/AssistantButton.tsx:221`, `apps/web/src/components/layout/MobileTabBar.tsx:6`, `apps/web/src/components/layout/MobileTabBar.tsx:44`, `apps/web/src/components/layout/AppShell.tsx:40`, `apps/web/src/components/layout/MobileNavDrawer.tsx:18`, `apps/web/src/components/layout/AppShell.tsx:80`, `apps/web/src/pages/notFound/NotFoundPage.tsx:16`, `apps/web/src/components/layout/ProtectedRoute.tsx:13`, `apps/web/src/components/layout/Header.tsx:35`.
