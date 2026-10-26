# Settings and Toggles Reference

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

## Sign in → Sign-in form

### Remember me on this device <!-- S-AUTH-001 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Sign in** page, under the password field |
| Purpose | Decides whether your session survives closing the browser |
| Default | Ticked, unless this browser last stored "not remembered" (source: `apps/web/src/pages/auth/LoginPage.tsx:67`, `apps/web/src/stores/auth.store.ts:14`). A new account created on the sign-up page is always remembered (`apps/web/src/pages/auth/RegisterPage.tsx:117`). |
| Values | Ticked: the session tokens are kept in the browser's local storage and survive closing the browser. Unticked: they are kept in session storage and end when the tab is closed; any copy in local storage is deleted. |
| Depends on | None. The Google button on the sign-in page uses the same choice (`apps/web/src/pages/auth/LoginPage.tsx:228`). |
| Persists | This device only |
| Stored in | localStorage key `everypaisa.auth.remember` (`apps/web/src/stores/auth.store.ts:10`); the session itself under `everypaisa.auth` (`apps/web/src/stores/auth.store.ts:110`) |
| Backend effect | None — the server issues the same 30-day refresh token either way |
| Who can change | R-VISITOR (at sign-in) |
| Sources | `apps/web/src/stores/auth.store.ts:30`, `apps/web/src/pages/auth/LoginPage.tsx:199` |

## Settings → Two-factor sign-in

### Two-factor sign-in <!-- S-SET-001 -->
| Attribute | Value |
|---|---|
| Control type | Turn on / Turn off buttons with confirmation dialogs |
| Location | **Tools → Settings → Two-factor sign-in** |
| Purpose | Adds a 6-digit authenticator-app code (or a one-time backup code) to every sign-in |
| Default | Off (no secret stored) — `packages/api/src/services/auth/twoFactor.service.ts:74` |
| Values | On: password or Google sign-in returns a challenge; you must enter a code within 5 minutes; 10 backup codes are issued. Off: sign-in needs only your password or Google. |
| Depends on | An authenticator app (Google Authenticator, Microsoft Authenticator or Authy are named in the UI) |
| Persists | Yes — server |
| Stored in | `User.twoFactorSecretEnc`, `User.twoFactorEnabledAt`, `User.twoFactorLastStep`, table `TwoFactorBackupCode` (hashed) |
| Backend effect | Turning on also returns a new session marked "signed in with a second factor", which the professional workspace (R-PROF) and admin tools (R-ADMIN) require. Emails "Two-factor sign-in turned on/off" are sent. Audit log rows `two_factor_enabled` / `two_factor_disabled` / `two_factor_codes_regenerated`. |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (own account only) |
| Sources | `apps/web/src/pages/settings/TwoFactorSection.tsx:86`, `packages/api/src/services/auth/twoFactor.service.ts:102`, `packages/api/src/services/auth/twoFactor.service.ts:158`, `packages/api/src/controllers/auth.controller.ts:322` |

## Settings → Email notifications

### Gmail connection for email notifications <!-- S-SET-003 -->
| Attribute | Value |
|---|---|
| Control type | Button (**Connect Gmail** / **Reconnect**) |
| Location | **Tools → Settings → Email notifications** |
| Purpose | Lets EveryPaisa send rent reminders from your own Gmail address |
| Default | Not connected |
| Values | Connected: shows "Gmail connected" and your Gmail address, plus **Send test**. Not connected: shows **Connect Gmail**. |
| Depends on | Server Google OAuth configuration (operator) |
| Persists | Yes — server |
| Stored in | `MailboxAccount` row with provider `GMAIL_OAUTH` (read by `packages/api/src/services/notifications/gmailSender.service.ts:37`) |
| Backend effect | The Google grant asks for both Gmail read-only and Gmail send (`packages/api/src/ingestion/gmail/gmail.connector.ts:24`). The same connection powers inbox import (B07), so connecting here also makes your inbox available to the Gmail import features and the browser goes to the Gmail scan setup page after Google, not back to Settings. |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/settings/NotificationsSection.tsx:29`, `packages/api/src/services/notifications/config.service.ts:226` |

## Settings → Loan rate alerts

### Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes <!-- S-SET-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox (saves on click) |
| Location | **Tools → Settings → Loan rate alerts** (shown under Email notifications) |
| Purpose | Opt out of refinance and repo/MCLR change alerts for your loans |
| Default | On (`packages/api/prisma/schema.prisma:176`) |
| Values | On: the daily loan-rate check may raise alerts for your loans. Off: it does not. |
| Depends on | Having loans (B04) |
| Persists | Yes — server |
| Stored in | `User.loanRateAlerts` |
| Backend effect | Read by the B04 loan rate alert job ("Checked every morning against live lender rates and RBI / MCLR changes"). While managing a family member's account the setting read and written is the managed profile's own (`packages/api/src/services/notifications/alertPrefs.service.ts:4`). |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed profile |
| Sources | `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:53`, `packages/api/src/controllers/alertPrefs.controller.ts:7`, `packages/api/src/services/notifications/alertPrefs.service.ts:14` |

## Account Access → Manage access panel

### What they can do <!-- S-SET-004 -->
| Attribute | Value |
|---|---|
| Control type | Two mode cards (**View only**, **Keep my books**) plus four switches under **Choose each permission** |
| Location | **Account Access → (professional) → Manage access → What they can do** |
| Purpose | Decides whether a professional may change anything in your books |
| Default | All four permissions off — view only (`packages/api/prisma/schema.prisma:520`) |
| Values | **View only**: read everything in scope and download reports. **Keep my books**: all four on. Switches: **Keep my books** (chart of accounts and vouchers), **Add and correct transactions** ("Never delete one"), **Upload statements** (contract notes, CAS, bank files), **Set fair market values** (for grandfathered gains). Any partial set shows "Custom — only the permissions switched on below." |
| Depends on | An accepted grant (status ACTIVE) |
| Persists | Yes — server, after **Save access** |
| Stored in | `Client.canEditBooks`, `canEditTransactions`, `canEditImports`, `canEditFmv` |
| Backend effect | Enforced on every professional request (B09). A change is recorded in the activity feed. |
| Who can change | The account holder (R-FREE, R-PLUS, R-FAMILY, R-PRO) only; never the professional |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:42`, `apps/web/src/components/ca/GrantScopePanel.tsx:174`, `packages/api/src/controllers/ca.controller.ts:128` |

### Portfolios <!-- S-SET-005 -->
| Attribute | Value |
|---|---|
| Control type | Segmented **All** / **Chosen (n)** plus portfolio chips |
| Location | **Account Access → Manage access → What they can see → Portfolios** |
| Purpose | Limit a professional to particular portfolios |
| Default | All ("All, including ones you add later") — `packages/api/prisma/schema.prisma:525` |
| Values | All: every current and future portfolio. Chosen: only the ticked portfolios (up to 200 ids accepted). |
| Depends on | None |
| Persists | Yes — server |
| Stored in | `Client.scopeAllPortfolios` and the chosen portfolio list |
| Backend effect | Server refuses portfolios that are not yours: "One of those portfolios is not yours." |
| Who can change | Account holder |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:218`, `packages/api/src/controllers/ca.controller.ts:136`, `packages/api/src/services/ca/caAccess.service.ts:741` |

### Categories <!-- S-SET-006 -->
| Attribute | Value |
|---|---|
| Control type | Segmented **All** / **Chosen (n)** plus chips |
| Location | **Account Access → Manage access → What they can see → Categories** |
| Purpose | Limit which parts of your financial life beyond investments a professional sees |
| Default | All ("Loans, cards, property, insurance and the rest") — `packages/api/prisma/schema.prisma:527` |
| Values | Chips: Vehicles, Rental property, Insurance, Loans, Credit cards, Bank accounts, Property owned, Goals |
| Depends on | None |
| Persists | Yes — server |
| Stored in | `Client.scopeAllCategories` and chosen categories |
| Backend effect | Applied when a professional reads your books (B09) |
| Who can change | Account holder |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:243`, `apps/web/src/api/ca.api.ts:84` |

### Asset classes <!-- S-SET-007 -->
| Attribute | Value |
|---|---|
| Control type | Segmented **All** / **Chosen (n)** plus chips |
| Location | **Account Access → Manage access → What they can see → Asset classes** |
| Purpose | Limit a professional to particular asset classes |
| Default | All ("Every asset class") — `packages/api/prisma/schema.prisma:526` |
| Values | One chip per asset class known to the app |
| Depends on | None |
| Persists | Yes — server |
| Stored in | `Client.scopeAllAssetClasses` and chosen classes |
| Backend effect | Applied when a professional reads your books (B09) |
| Who can change | Account holder |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:268`, `packages/api/src/controllers/ca.controller.ts:137` |

### When (From / Until) <!-- S-SET-008 -->
| Attribute | Value |
|---|---|
| Control type | Two date fields |
| Location | **Account Access → Manage access → When** |
| Purpose | A window outside which the professional's access stops by itself |
| Default | Blank — no start and no end ("No end date") — `packages/api/prisma/schema.prisma:508` |
| Values | From: access starts on this date. Until: access ends on this date. Blank: no limit. |
| Depends on | Until must not be before From ("Access cannot end before it starts.") |
| Persists | Yes — server |
| Stored in | `Client.accessFrom`, `Client.accessUntil` |
| Backend effect | Enforced in the database for every professional request (see global roles R-PROF) |
| Who can change | Account holder |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:300`, `packages/api/src/services/ca/caAccess.service.ts:728` |

## Settings → Loan rates (admin)

### Rate override (Set rate) <!-- S-SET-009 -->
| Attribute | Value |
|---|---|
| Control type | Form: Basis, Tenor (MCLR only), From (% p.a.), To (% p.a., optional), With effect from (optional), Note |
| Location | **Tools → Settings → Loan rates → Open loan rates → (lender) → Set rate** |
| Purpose | Correct a lender rate shown on the EMI calculator's Live rates tab |
| Default | No override; users see the rate read from the bank page |
| Values | Set: "A rate you set here wins over the bank page until you clear it." Cleared (**Clear override**): "Users will see the bank page figure again." |
| Depends on | ADMIN role and a two-factor session |
| Persists | Yes — server |
| Stored in | Loan-rate manual override rows (B04 data) |
| Backend effect | Every write leaves an AuditLog row (`packages/api/src/routes/adminLoanRates.routes.ts:13`) |
| Who can change | R-ADMIN |
| Sources | `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:97`, `packages/api/src/controllers/loanRates.controller.ts:20` |

## AI connectors → Sharing

### Choose what <chatbot> can read <!-- S-CONN-001 -->
| Attribute | Value |
|---|---|
| Control type | 11 checkboxes |
| Location | **/connect/authorize** approval page, and **AI connectors → Edit sharing** |
| Purpose | Which areas of your data a connected chatbot may read |
| Default | On: Investments, Retirement, Banking and cards, Loans, Insurance, Property, Vehicles, Goals and tax, Split expenses. Off: Will and succession, Documents. A reconnecting chatbot starts with what it had. (`packages/shared/src/aiConnector.ts:13`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:34`) |
| Values | Ticked: the chatbot gets that area's tools. Unticked: those tools are not offered. With nothing ticked the connection shows "Overview only". |
| Depends on | PLUS plan or higher to approve or edit |
| Persists | Yes — server |
| Stored in | `McpGrant.areas` |
| Backend effect | The MCP server registers only the tools of shared areas plus the always-available overview and people tools (`packages/api/src/services/mcp/server.ts:97`). Takes effect on the chatbot's next call. |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/connect/SharingToggles.tsx:15`, `packages/api/src/services/mcp/oauth.service.ts:374` |

### Whose data <!-- S-CONN-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per family member |
| Location | Same places as S-CONN-001, shown only when you have shareable people |
| Purpose | Let the chatbot also read relatives' data |
| Default | Nobody ticked; a reconnect keeps whoever was shared before and is still shareable (`apps/web/src/pages/connect/ConnectAuthorizePage.tsx:37`) |
| Values | Ticked: the chatbot may read that person's data within the family visibility you already have. Disabled rows read "Has not allowed family AI connectors". |
| Depends on | Managed profiles are always shareable; members with their own login only after they turn on S-CONN-003 |
| Persists | Yes — server |
| Stored in | `McpGrant.memberUserIds` |
| Backend effect | Eligibility is re-checked on every tool call (`packages/api/src/services/mcp/people.ts:10`) |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/connect/SharingToggles.tsx:28`, `packages/api/src/services/mcp/people.ts:61` |

### Allow family to include me in their AI connectors <!-- S-CONN-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox (saves on click) |
| Location | **AI connectors** page, bottom card |
| Purpose | Consent for relatives who can already see your data to let their own chatbot read it |
| Default | Off (`packages/api/prisma/schema.prisma:58`) |
| Values | On: you appear as shareable on your relatives' approval pages. Off: you appear greyed out; anyone already sharing you stops seeing your data on the next call. |
| Depends on | Membership in a family (B03) |
| Persists | Yes — server |
| Stored in | `User.aiConnectorFamilyOptIn` |
| Backend effect | Audit row `mcp_sharing_changed` |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (not plan-gated) |
| Sources | `apps/web/src/pages/settings/AiConnectorsPage.tsx:126`, `packages/api/src/routes/connect.routes.ts:64` |

## Connectors → Broker cards

### Broker setup fields <!-- S-CONN-004 -->
| Attribute | Value |
|---|---|
| Control type | Text/password fields after **Configure** / **Reconfigure** |
| Location | **Tools → Connectors → (broker card)** |
| Purpose | Your own broker developer-app credentials |
| Default | Not configured |
| Values | Zerodha (Kite Connect): API key, API secret. Upstox: API key (client id), API secret, Redirect URI. Angel One (SmartAPI): API key, Client code, Login PIN/password, TOTP seed (Base32). |
| Depends on | A developer app registered with the broker |
| Persists | Yes — server, encrypted |
| Stored in | `BrokerCredential` (API key, secret/password and TOTP seed encrypted under SECRETS_KEY) |
| Backend effect | Angel One logs in immediately on save; Zerodha and Upstox need **Connect** (browser login popup) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO; under R-MANAGER the credential is saved for the managed profile |
| Sources | `apps/web/src/pages/connectors/ConnectorsPage.tsx:41`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:30` |

## Pricing → Billing cycle

### Monthly / Annual <!-- S-PLAN-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button switch in the page header |
| Location | **Pricing** page |
| Purpose | Show and buy the monthly or annual price |
| Default | Monthly (`apps/web/src/pages/pricing/PricingPage.tsx:97`) |
| Values | Monthly: Plus ₹499/month, Family ₹899/month, Pro/Advisor ₹1,999/month. Annual: Plus ₹4,999/year; Family and Pro/Advisor show "—" and "No annual plan yet" and cannot be bought. |
| Depends on | None |
| Persists | No — resets when you leave the page |
| Stored in | Page state only |
| Backend effect | Sent as `billingCycle` to checkout; decides 30 or 365 days of plan |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/pricing/PricingPage.tsx:163`, `packages/shared/src/pricing.ts:18` |

## App frame → Sidebar

### Collapse sidebar <!-- S-SHELL-001 -->
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Collapse sidebar** / **Expand sidebar**) |
| Location | Sidebar, next to the logo |
| Purpose | Fold the sidebar into a 72px icon rail |
| Default | Expanded (source: `apps/web/src/components/layout/Sidebar.tsx:13` — only the stored value "true" folds it) |
| Values | Folded: icons only, names on hover · Expanded: full 256px sidebar |
| Depends on | Screen width: honoured only at 1024px and wider; 768–1023px is always folded; below 768px the sidebar is a drawer |
| Persists | This device only |
| Stored in | localStorage `sidebar_collapsed` |
| Backend effect | None |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN |
| Sources | `apps/web/src/components/layout/Sidebar.tsx:9`, `apps/web/src/components/layout/Sidebar.tsx:20`, `apps/web/src/hooks/useMediaQuery.ts:36` |

### Planning group open <!-- S-SHELL-002 -->
| Attribute | Value |
|---|---|
| Control type | Heading toggle (**Planning**) |
| Location | Sidebar → Planning |
| Purpose | Show or fold Goals, Will Maker, Succession, Tax Planning, AI connectors |
| Default | Open (source: `apps/web/src/components/layout/PlanningNavGroup.tsx:19`) |
| Values | Open · Folded (a dot shows when the current page is inside) |
| Depends on | Not shown on the icon rail (icons always visible there) |
| Persists | This device only; if storage is blocked, for the current page view |
| Stored in | localStorage `sidebar_planning_open` ("1"/"0") |
| Backend effect | None |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN |
| Sources | `apps/web/src/components/layout/PlanningNavGroup.tsx:15`, `apps/web/src/components/layout/PlanningNavGroup.tsx:25` |

### By value / My order <!-- S-SHELL-003 -->
| Attribute | Value |
|---|---|
| Control type | Text toggle |
| Location | Sidebar → Asset Classes heading |
| Purpose | Sort asset classes by how much you hold, or by your own order |
| Default | By value (source: `apps/web/src/hooks/useSidebarClassValues.ts:54`) |
| Values | By value: largest first, empty classes last and faded · My order: saved order (S-SHELL-004) |
| Depends on | Hidden while editing; editing always shows the saved order |
| Persists | This device only |
| Stored in | localStorage `everypaisa.sidebar.assetSort` ("manual" for My order) |
| Backend effect | By value reads dashboard net worth, bank accounts and real-estate summary |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN |
| Sources | `apps/web/src/hooks/useSidebarClassValues.ts:50`, `apps/web/src/components/layout/AssetClassSectionList.tsx:104`, `apps/web/src/lib/sidebarClassValues.ts:113` |

### Asset class order and visibility <!-- S-SHELL-004 -->
| Attribute | Value |
|---|---|
| Control type | Drag handles, eye toggles, remove buttons, **Add asset class** (edit mode) |
| Location | Sidebar → Asset Classes → **Edit** |
| Purpose | Choose which asset classes show, in what order, and add optional classes |
| Default | Bank Accounts, Stocks, F & O, Mutual Funds, FDs & RDs, Gold & Silver, PPF & EPF, Real Estate, Rental, Vehicles, Insurance, Loans, Credit Cards, Others — all visible; Bonds, Crypto, Forex, NPS, Post Office absent (source: `packages/api/src/services/account/userPreferences.service.ts:10`, `packages/shared/src/types/preferences.ts:17`) |
| Values | Each class: visible or hidden, position; optional classes: present or absent |
| Depends on | — |
| Persists | Yes — on your account (all devices) |
| Stored in | `User.preferences.assetSections` (with `assetSectionsVersion` 2) |
| Backend effect | Hidden classes are also removed from the Dashboard's Top holdings, Net worth breakdown and Real Estate/Vehicles/Insurance cards (mapping caveats in DOCUMENTATION_GAPS.md) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN (R-MANAGER changes the managed person's) |
| Sources | `apps/web/src/stores/assetSections.store.ts:92`, `packages/api/src/controllers/userPreferences.controller.ts:13`, `packages/api/src/services/account/userPreferences.service.ts:76`, `apps/web/src/pages/dashboard/DashboardPage.tsx:336` |

## App frame → Top bar

### Theme <!-- S-SHELL-005 -->
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Switch to light mode** / **Switch to dark mode**) |
| Location | Top bar |
| Purpose | Dark or light colours |
| Default | Dark (source: `apps/web/src/stores/theme.store.ts:18`) |
| Values | Dark · Light |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage `everypaisa.theme` |
| Backend effect | None; report downloads start on the current theme |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/stores/theme.store.ts:27`, `apps/web/src/components/layout/Header.tsx:151` |

### Hide values <!-- S-SHELL-006 -->
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Hide values** / **Show values**) |
| Location | Top bar |
| Purpose | Cover amounts and numbers with grey bars |
| Default | Off (source: `apps/web/src/stores/privacy.store.ts:13`) |
| Values | On: numbers masked app-wide (not some chart axes) · Off: shown |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage `everypaisa.privacy` |
| Backend effect | None (display only) |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/stores/privacy.store.ts:18`, `apps/web/src/components/layout/AppShell.tsx:91`, `apps/web/src/styles/globals.css:460` |

## AI Assistant → Panel

### Assistant big window <!-- S-AI-001 -->
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Open the big window** / **Shrink to the corner (Esc)**) |
| Location | Assistant panel header (screens 640px and wider) |
| Purpose | Docked corner panel or large centred window |
| Default | Docked (source: `apps/web/src/components/ai/AIAssistant.tsx:84`) |
| Values | Expanded · Docked |
| Depends on | — |
| Persists | This device only (not remembered if storage is blocked) |
| Stored in | localStorage `assistant_expanded` ("1" when expanded) |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/ai/AIAssistant.tsx:80`, `apps/web/src/components/ai/AIAssistant.tsx:190` |

### Assistant teaser dismissed <!-- S-AI-002 -->
| Attribute | Value |
|---|---|
| Control type | × on the teaser bubble (**Dismiss**) |
| Location | Next to the floating assistant button |
| Purpose | Stop the welcome/"Try asking" bubble and the pulsing ring |
| Default | Not dismissed (source: `apps/web/src/components/ai/AssistantButton.tsx:50`) |
| Values | Dismissed · Shown; on phones it dismisses itself after 6 seconds |
| Depends on | — |
| Persists | This browser tab session only |
| Stored in | sessionStorage `everypaisa.ai-teaser-seen.v2` |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/ai/AssistantButton.tsx:31`, `apps/web/src/components/ai/AssistantButton.tsx:118` |

### AI-use notice accepted <!-- S-AI-003 -->
| Attribute | Value |
|---|---|
| Control type | Button (**I understand**) |
| Location | Assistant panel, first use |
| Purpose | Record that you read how AI is used in advice |
| Default | Not accepted (source: `packages/api/src/ai/aiDisclosure.ts:32`) |
| Values | Accepted for the current version (2026-10-21) · Not accepted (assistant refuses questions) |
| Depends on | A new notice version requires acceptance again |
| Persists | Yes — on your account |
| Stored in | AuditLog row, action `ai_disclosure_acknowledged`, resource `AiDisclosure:<version>` |
| Backend effect | Unlocks `POST /api/assistant/chat` |
| Who can change | Everyone signed in; cannot be withdrawn in the app |
| Sources | `packages/api/src/ai/aiDisclosure.ts:39`, `packages/api/src/routes/aiAssistant.routes.ts:214`, `packages/shared/src/aiDisclosure.ts:16` |

## Dashboard → Page controls

### Dashboard portfolio picker <!-- S-DASH-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Dashboard header |
| Purpose | Narrow portfolio-based cards to one portfolio |
| Default | **All portfolios (N)** (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:305`) |
| Values | All portfolios · one portfolio (affects Investments in the hero, metric cards, portfolio chart, breakdown pie, top holdings, Net after debts) |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `portfolioId` passed to `/api/dashboard/net-worth`; per-portfolio summary/holdings/valuation calls |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:370`, `apps/web/src/pages/dashboard/DashboardPage.tsx:518` |

### Net worth eye <!-- S-DASH-002 -->
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Show net worth** / **Hide net worth**) |
| Location | Dashboard → Total Net Worth card |
| Purpose | Reveal the headline net worth |
| Default | Hidden (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:314`) |
| Values | Hidden ("₹ • • • • • • •") · Shown |
| Depends on | Independent of S-SHELL-006 |
| Persists | No — hidden again on every visit |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:544` |

### Portfolio chart period <!-- S-DASH-003 -->
| Attribute | Value |
|---|---|
| Control type | Toggle buttons **1M**, **3M**, **6M**, **1Y**, **All** |
| Location | Dashboard → Portfolio value over time |
| Purpose | Time window of the portfolio chart |
| Default | **1Y** (365 days) (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:306`) |
| Values | 30, 90, 180, 365 days, or since the first transaction |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `days` passed to historical valuation; may trigger a stock-price backfill |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:47`, `packages/api/src/controllers/portfolio.controller.ts:84` |

### Net worth trend period <!-- S-DASH-004 -->
| Attribute | Value |
|---|---|
| Control type | Toggle buttons **1M**, **3M**, **6M**, **1Y**, **All** |
| Location | Dashboard → Net worth over time |
| Purpose | Time window of the trend chart |
| Default | **1Y** (source: `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:30`) |
| Values | Last 30, 90, 180, 365 days, or all snapshots |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `period` query; any other value is refused with "Invalid period. Must be one of: 1M, 3M, 6M, 1Y, ALL" |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:13`, `packages/api/src/controllers/intelligence.controller.ts:22` |

### Alerts strip folded <!-- S-DASH-005 -->
| Attribute | Value |
|---|---|
| Control type | Icon button / bar (**Collapse alerts** / **Expand alerts**) |
| Location | Dashboard → alerts strip |
| Purpose | Fold the urgent-items strip into one line |
| Default | Unfolded (source: `apps/web/src/pages/dashboard/DashboardPage.tsx:322`) |
| Values | Folded ("N alerts — click to expand") · Unfolded |
| Depends on | Only when there are items |
| Persists | No — "every fresh load shows alerts expanded" |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/dashboard/DashboardPage.tsx:669`, `apps/web/src/pages/dashboard/DashboardPage.tsx:683` |

### Upgrade banner dismissed <!-- S-DASH-006 -->
| Attribute | Value |
|---|---|
| Control type | × (**Dismiss**) |
| Location | Dashboard → Free plan banner |
| Purpose | Hide the Free plan upsell banner |
| Default | Shown on Free (source: `apps/web/src/components/dashboard/UpgradeBanner.tsx:19`) |
| Values | Dismissed · Shown |
| Depends on | Only on the Free plan |
| Persists | This device, per account |
| Stored in | localStorage `everypaisa.dismissedUpgradeBanner.<userId>` |
| Backend effect | None |
| Who can change | R-FREE |
| Sources | `apps/web/src/components/dashboard/UpgradeBanner.tsx:7`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:25` |

### Dashboard export options <!-- S-DASH-007 -->
| Attribute | Value |
|---|---|
| Control type | Selects and toggles in "Download Report" |
| Location | Dashboard → **Export** |
| Purpose | Choose whose dashboard, which portfolios, file format and appearance |
| Default | Scope **All portfolios combined**, Format **PDF**, Appearance = current app theme, Report for = **Me** (source: `apps/web/src/components/reports/DownloadReportButton.tsx:41`) |
| Values | Scope: All / Specific portfolio · Format: PDF / Excel (.xlsx) · Appearance: Dark / Light (print) · Report for: Me or a family member (family view only) |
| Depends on | Specific portfolio needs a portfolio picked; for another member Scope is ignored |
| Persists | No |
| Stored in | Dialog state |
| Backend effect | Query parameters of `/api/reports/dashboard-export` |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/reports/DownloadReportButton.tsx:70`, `packages/api/src/controllers/reports.controller.ts:533` |

## Portfolios → Portfolio dialog and detail

### Portfolio type <!-- S-PORT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select (**Type**) |
| Location | Portfolios → New portfolio / Edit |
| Purpose | Label the portfolio |
| Default | Investment (source: `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:28`, server `packages/api/src/services/holdings/portfolio.service.ts:329`) |
| Values | Investment, Trading, Goal-based, Strategy — shown on the card; no calculation uses it |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Portfolio.type` |
| Backend effect | None beyond storage |
| Who can change | Portfolio creator; family OWNER for family-shared portfolios |
| Sources | `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:134`, `packages/api/prisma/schema.prisma:640` |

### Portfolio currency <!-- S-PORT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select (**Currency**) |
| Location | Portfolios → New portfolio / Edit |
| Purpose | The portfolio's currency code |
| Default | INR (source: `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:29`) |
| Values | INR, USD, EUR, GBP |
| Depends on | Portfolio groups accept only one currency |
| Persists | Yes — server |
| Stored in | `Portfolio.currency` |
| Backend effect | Group membership check ("Group members must share a currency"); values are still shown in rupees |
| Who can change | Portfolio creator; family OWNER for family-shared portfolios |
| Sources | `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:143`, `packages/api/src/services/holdings/portfolioGroup.service.ts:57` |

### Set as default portfolio <!-- S-PORT-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | Portfolios → New portfolio / Edit |
| Purpose | Mark one portfolio as your default |
| Default | Off (source: `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:31`) |
| Values | On: listed first with a star; any other default of yours is cleared · Off |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Portfolio.isDefault` |
| Backend effect | Clears `isDefault` on your other portfolios in the same transaction |
| Who can change | Portfolio creator |
| Sources | `apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:156`, `packages/api/src/services/holdings/portfolio.service.ts:346` |

### XIRR sort <!-- S-PORT-004 -->
| Attribute | Value |
|---|---|
| Control type | Sort button (**XIRR**) |
| Location | Portfolio detail → Holdings table header |
| Purpose | Rank holdings by return |
| Default | Off (source: `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:73`) |
| Values | Descending → Ascending → Off; holdings without XIRR always last |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Anyone who can see the portfolio |
| Sources | `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:108` |

## Transactions → List

### Transactions portfolio filter <!-- S-TXN-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Transactions page |
| Purpose | Show one portfolio's transactions |
| Default | **All portfolios** (source: `apps/web/src/pages/transactions/TransactionsPage.tsx:18`) |
| Values | All portfolios · one portfolio; changing it returns to page 1 |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `portfolioId` query on `/api/transactions` |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/transactions/TransactionsPage.tsx:84` |

## Bank Accounts → Account dialog

### Account type <!-- S-BANK-001 -->
| Attribute | Value |
|---|---|
| Control type | Select (**Type**) |
| Location | Bank Accounts → Add account / Edit |
| Purpose | Kind of account |
| Default | Savings (source: `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:76`) |
| Values | Savings, Current, Salary, Nre, Nro, Od (shown on the tile in capitals) — a label only |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `BankAccount.accountType` |
| Backend effect | None beyond storage |
| Who can change | Account owner |
| Sources | `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:24`, `packages/api/src/services/banking/bankAccounts.service.ts:26` |

### Account status <!-- S-BANK-002 -->
| Attribute | Value |
|---|---|
| Control type | Select (**Status**) |
| Location | Bank Accounts → Add account / Edit |
| Purpose | Mark accounts dormant or closed without deleting them |
| Default | Active (source: `packages/api/src/services/banking/bankAccounts.service.ts:192`) |
| Values | Active: counted in **Total balance**, shows "Available balance" · Dormant: counted as Inactive · Closed: counted as Inactive and never matched to e-mail alerts |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `BankAccount.status` |
| Backend effect | Closed accounts are excluded from last-4 matching of bank alerts |
| Who can change | Account owner |
| Sources | `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:30`, `packages/api/src/services/banking/bankAccounts.service.ts:492` |

## Alerts & Reminders → Filters

### Alert lens <!-- S-ALERT-001 -->
| Attribute | Value |
|---|---|
| Control type | Filter chips **All**, **Overdue**, **Due ≤ 7d**, **Unread** |
| Location | Alerts page |
| Purpose | Show one group of the loaded alerts |
| Default | All (source: `apps/web/src/pages/alerts/AlertsPage.tsx:323`) |
| Values | All · Overdue (past date, not loan checks) · Due ≤ 7d (this week band) · Unread |
| Depends on | Applies to the loaded page of 30 only |
| Persists | No |
| Stored in | Page state |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/alerts/AlertsPage.tsx:380` |

### Alert type filter <!-- S-ALERT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select (**All types**) |
| Location | Alerts page |
| Purpose | Show one alert type |
| Default | All types (source: `apps/web/src/pages/alerts/AlertsPage.tsx:322`) |
| Values | All types, FD maturity, Bond maturity, MF lock-in, SIP due, Insurance premium, Dividend, Corporate action, Price target, Loan refinance, Loan rate change, Will review, Custom |
| Depends on | Resets to page 1 |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` query on `/api/alerts` |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/pages/alerts/AlertsPage.tsx:432`, `packages/api/src/services/notifications/alerts.service.ts:29` |

## Import → Upload a file

### Target portfolio (optional) <!-- S-IMPORT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Import → Upload a file** |
| Purpose | Portfolio that receives the transactions of the next uploaded file |
| Default | **Default / first portfolio** (empty value) (source: `apps/web/src/pages/imports/ImportPage.tsx:41`) |
| Values | A portfolio: every row goes there · Empty: server uses your portfolio marked default, else your first portfolio (`packages/api/src/services/imports/import.service.ts:343`) |
| Depends on | You must own the portfolio ("Portfolio not found" otherwise) |
| Persists | No — page state only; stored on the import job (`ImportJob.portfolioId`) for that file |
| Stored in | `ImportJob.portfolioId` |
| Backend effect | Rows of that job are written to the portfolio; reprocessing keeps it |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/imports/ImportPage.tsx:155`, `packages/api/src/services/imports/import.service.ts:74` |

## Import → Unlock dialog

### Remember this password for future locked files <!-- S-IMPORT-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Tools → Import → Import history → Needs password** dialog |
| Purpose | Keep a working file password for automatic use on later locked files |
| Default | `on` (source: `apps/web/src/components/upload/PasswordPromptDialog.tsx:42`); server default `true` (`packages/api/src/controllers/imports.controller.ts:179`) |
| Values | `on`: a password that unlocked the file is added at the front of your saved list (max 10); a PAN-shaped password is saved as profile PAN instead, only if you have none · `off`: used once (a PAN-shaped password is still saved to an empty profile PAN) |
| Depends on | Only applied when the password actually unlocked the file |
| Persists | Yes — server |
| Stored in | `User.savedFilePasswordsEnc` (encrypted list) or `User.pan`/`panEnc` |
| Backend effect | Saved passwords are tried first on every future locked import (`packages/api/src/lib/decryptIfNeeded.ts:189`) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/components/upload/PasswordPromptDialog.tsx:97`, `packages/api/src/controllers/imports.controller.ts:206`, `packages/api/src/lib/userDocPasswords.ts:39` |

## Email ingestion → Monitored senders

### Active / Paused (Pause polling / Resume polling) <!-- S-INGEST-001 -->
| Attribute | Value |
|---|---|
| Control type | Toggle (power icon) |
| Location | **Inbox → Connect your Gmail → Sender settings**, each sender row |
| Purpose | Whether the sender's emails are fetched |
| Default | `on` (Active) — schema default; `packages/api/src/services/gmail/monitoredSenders.service.ts:101` creates without overriding |
| Values | `on`: included in the poll query and trusted for attachment file-name relaxation · `off`: ignored by both |
| Depends on | A connected, active Gmail |
| Persists | Yes — server |
| Stored in | `MonitoredSender.isActive` |
| Backend effect | Poll query built from active senders only (`packages/api/src/ingestion/gmail/poller.ts:236`); attachment sync trust list (`packages/api/src/ingestion/gmail/gmail.connector.ts:386`) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:158`, `packages/api/src/controllers/monitoredSenders.controller.ts:22` |

### Auto-commit <!-- S-INGEST-002 -->
| Attribute | Value |
|---|---|
| Control type | Toggle (lightning icon); also **Enable auto-commit** banner |
| Location | **Sender settings** rows; banner in **Pending review** |
| Purpose | Let a sender's events be written without manual review |
| Default | `on` for every new sender (source: `packages/api/src/services/gmail/monitoredSenders.service.ts:99`) — the UI help text implies it starts off |
| Values | `on`: new events with all figures found and confidence ≥ 0.70 are confirmed and written immediately; others wait in review · `off`: every event waits in **Pending review** |
| Depends on | Turning it on is refused while approved count < S-INGEST-003 ("Approve <n> more event(s) from this sender before enabling auto-commit."); creation bypasses this |
| Persists | Yes — server |
| Stored in | `MonitoredSender.autoCommitEnabled` |
| Backend effect | Event status PARSED vs PENDING_REVIEW and auto-projection (`packages/api/src/ingestion/gmail/pipeline.ts:171`, `packages/api/src/ingestion/gmail/pipeline.ts:522`) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:164`, `packages/api/src/controllers/monitoredSenders.controller.ts:54` |

### Auto-commit after N confirmed events <!-- S-INGEST-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Sender settings → Add sender manually** |
| Purpose | Approvals needed before auto-commit can be (re-)enabled and the offer banner shows |
| Default | `5` (source: `apps/web/src/pages/ingestion/SendersPage.tsx:23`, `packages/api/src/services/gmail/monitoredSenders.service.ts:75`) |
| Values | Whole number 1–100 |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `MonitoredSender.autoCommitAfter` |
| Backend effect | Guard on enabling auto-commit; banner condition `confirmedEventCount ≥ autoCommitAfter` |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (at creation only in the UI; API also accepts it on update) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:106`, `packages/api/src/controllers/monitoredSenders.controller.ts:16` |

### Display label (optional) <!-- S-INGEST-004 -->
| Attribute | Value |
|---|---|
| Control type | Text |
| Location | **Sender settings → Add sender manually** |
| Purpose | Friendly name shown instead of the address |
| Default | Empty; server fills the institution seed label only when the value is missing (null) |
| Values | Up to 120 characters |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `MonitoredSender.displayLabel` |
| Backend effect | None beyond display |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (at creation only in the UI) |
| Sources | `apps/web/src/pages/ingestion/SendersPage.tsx:96`, `packages/api/src/services/gmail/monitoredSenders.service.ts:90` |

## Gmail → Shell banner

### Dismiss (Gmail auto-connect banner) <!-- S-MAIL-001 -->
| Attribute | Value |
|---|---|
| Control type | Button (cross) |
| Location | Banner at the top of every signed-in page |
| Purpose | Hide the "Auto-import statements from your inbox." banner |
| Default | Not dismissed |
| Values | Dismissed: banner never shows on this browser · Not dismissed: shows when its other conditions hold |
| Depends on | Banner shows only for @gmail.com/@googlemail.com sign-in emails with no active Gmail connection and Gmail sign-in configured |
| Persists | This device only |
| Stored in | localStorage `gmail-auto-connect-dismissed` |
| Backend effect | None |
| Who can change | Any signed-in user who sees the banner |
| Sources | `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:11`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72` |

## Gmail → Choose how far back to scan

### Scan from / Scan until <!-- S-MAIL-002 -->
| Attribute | Value |
|---|---|
| Control type | Date pickers + presets (**Last 7 days**, **Last 30 days**, **Last 1 year**, **Last 5 years**) |
| Location | `/gmail/scan-setup` (after connecting Gmail) |
| Purpose | Date window of the inbox scan |
| Default | From 5 years ago to today (source: `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:31`) |
| Values | Any range ending today or earlier; the server requires **Scan until** after **Scan from** |
| Depends on | An active Gmail |
| Persists | Stored on the scan job only |
| Stored in | `GmailScanJob.lookbackFrom` / `lookbackTo` |
| Backend effect | Gmail query `after:` / `before:` (until + 1 day) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:46`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:61` |

## Mutual Funds → Sync MF via CASParser dialog

### Period <!-- S-MF-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync MF via CASParser** |
| Purpose | Date range of the requested CAS |
| Default | `All to Date` (source: `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:66`) |
| Values | `All to Date`: 1 January 1990 → today · `Last 12 months` / `Last 6 months` / `Last 3 months`: today minus that many months → today |
| Depends on | — |
| Persists | No — reset when the dialog closes |
| Stored in | Not stored; sent as `fromDate`/`toDate` |
| Backend effect | Passed to casparser.in as `from_date`/`to_date`; server defaults to 1990-01-01 → today when absent |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:41`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:48`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:350` |

### Portfolio <!-- S-MF-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync MF via CASParser** |
| Purpose | Shown as the destination portfolio |
| Default | `Default` (source: `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:207`) |
| Values | `Default` or any of your portfolios — **no effect**: the value is never sent |
| Depends on | — |
| Persists | No |
| Stored in | Not stored |
| Backend effect | None (request body has only pan, email, fromDate, toDate) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:85`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:200` |

### Nickname <!-- S-MF-003 -->
| Attribute | Value |
|---|---|
| Control type | Text (max 80) |
| Location | **Mutual Funds → Sync MF via CASParser** |
| Purpose | Shown as an optional label |
| Default | empty |
| Values | Any text — **no effect**: never sent |
| Depends on | — |
| Persists | No |
| Stored in | Not stored |
| Backend effect | None |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:216`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:85` |

## Mutual Funds → Sync via CAMS / KFintech dialog

### Period <!-- S-MF-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync via CAMS / KFintech** |
| Purpose | Date range of the requested CAS |
| Default | `All to Date` (source: `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:75`) |
| Values | `All to Date`: no dates sent (portal default range) · `Last 12/6/3 months`: today minus that many months → today |
| Depends on | — |
| Persists | Stored on the request record |
| Stored in | MFCasMailbackJob.periodFrom / periodTo |
| Backend effect | Filled into the CAMS/KFintech forms at submit |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:50`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:181` |

### Portfolio <!-- S-MF-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Sync via CAMS / KFintech** |
| Purpose | Destination portfolio recorded on the request |
| Default | `Default` — server uses your default portfolio, else your first (source: `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:39`) |
| Values | `Default` or any portfolio you own |
| Depends on | — |
| Persists | Stored on the request record |
| Stored in | MFCasMailbackJob.portfolioId |
| Backend effect | Validated (must be yours) and stored; nothing later reads it, so the arriving PDF is imported wherever the Gmail import pipeline puts it |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:306`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:28` |

### Nickname <!-- S-MF-006 -->
| Attribute | Value |
|---|---|
| Control type | Text (max 80) |
| Location | **Mutual Funds → Sync via CAMS / KFintech** |
| Purpose | Label for the request |
| Default | empty |
| Values | Any text up to 80 characters |
| Depends on | — |
| Persists | Stored on the request record |
| Stored in | MFCasMailbackJob (nickname) |
| Backend effect | None visible — no UI lists mailback requests |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:322`, `packages/api/src/controllers/mfCasMailback.controller.ts:24` |

## Mutual Funds → Finvu (Account Aggregator) card

### Unique identifier <!-- S-MF-007 -->
| Attribute | Value |
|---|---|
| Control type | Text |
| Location | **Mutual Funds → Finvu (Account Aggregator)** |
| Purpose | Identifier sent to every Finfactor call and to the import |
| Default | The Finfactor sandbox sample identifier (source: `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:33`) |
| Values | Any non-empty text; empty disables all buttons |
| Depends on | Finfactor configured or demo mode on (operator) |
| Persists | No |
| Stored in | Not stored |
| Backend effect | Sent as `uniqueIdentifier`; not checked against your own consent |
| Who can change | Everyone can type; calls need R-PLUS or higher |
| Sources | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:62`, `packages/api/src/controllers/finfactor.controller.ts:53` |

### Destination portfolio <!-- S-MF-008 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Mutual Funds → Finvu card → Import into EveryPaisa** |
| Purpose | Where imported Finvu transactions go |
| Default | `+ New "Finvu Imports" portfolio (auto-create)` (source: `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:123`) |
| Values | auto-create: reuse or create a portfolio named "Finvu Imports" · a portfolio: merge into it (must be yours) |
| Depends on | S-MF-007 |
| Persists | No |
| Stored in | Not stored |
| Backend effect | Decides the portfolio of created transactions |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:279`, `packages/api/src/ingestion/finfactor/sync.service.ts:117` |

### Statement filter chips <!-- S-MF-009 -->
| Attribute | Value |
|---|---|
| Control type | Chip group |
| Location | **Mutual Funds → Finvu card → Statement** result |
| Purpose | Filter statement rows |
| Default | `All` (source: `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:34`) |
| Values | `All` · `BUY` · `SELL` · `SIP only` · `DEMAT` · `SOA` (holding mode) |
| Depends on | A Statement result shown |
| Persists | No |
| Stored in | Component state |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:22`, `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:101` |

## Fund page → View

### Overview / Detailed calculations <!-- S-MF-010 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | Fund page `/mutual-funds/<scheme code>` |
| Purpose | Plain summary vs full evidence |
| Default | `Overview` (source: `apps/web/src/pages/mf/FundDetailPage.tsx:56`) |
| Values | `Overview`: verdict, strengths, three numbers, holding periods, alternatives · `Detailed calculations`: score card, horizon metrics, findings, portfolio, fund facts |
| Depends on | — |
| Persists | No — every visit opens on Overview |
| Stored in | Component state |
| Backend effect | None (same data) |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mf/FundDetailPage.tsx:189` |

### Horizon tabs (1Y, 3Y, 5Y, 7Y, 10Y) <!-- S-MF-011 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | Fund page → **Detailed calculations → Performance and risk** |
| Purpose | Choose the measurement window |
| Default | The shortest horizon with metrics; 3Y if none (source: `apps/web/src/pages/mf/FundDetailPage.tsx:138`) |
| Values | 1, 3, 5, 7, 10 years — all always shown; an empty one says "No N-year record" |
| Depends on | S-MF-010 = Detailed calculations |
| Persists | No |
| Stored in | Component state |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO |
| Sources | `apps/web/src/pages/mf/FundDetailPage.tsx:218`, `packages/shared/src/mfAnalytics.types.ts:98` |

## Gold & Silver → Live rate bar

### Gold purity <!-- S-GOLD-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Asset Classes → Gold & Silver**, rate bar next to **Gold** (aria label "Gold purity") |
| Purpose | Choose which gold karat's price per gram the bar shows |
| Default | `24` (24K · 999) — first option (source: apps/web/src/lib/metalPurity.ts:32, apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:43) |
| Values | `24` 24K · 999 (factor 1) · `22` 22K · 916 (22/24) · `18` 18K · 750 (18/24) · `14` 14K · 585 (14/24) |
| Depends on | Live gold price available |
| Persists | This device only |
| Stored in | localStorage `everypaisa.goldTicker.karat` |
| Backend effect | None; does not change holding values |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO (any signed-in user) |
| Sources | apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:37, apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:53 |

### Silver purity <!-- S-GOLD-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Asset Classes → Gold & Silver**, rate bar next to **Silver** (aria label "Silver purity") |
| Purpose | Choose which silver grade's price per gram the bar shows |
| Default | `999` (999 Fine) — first option (source: apps/web/src/lib/metalPurity.ts:39) |
| Values | `999` 999 Fine (×1) · `925` 925 Sterling (×0.925) · `800` 800 (×0.8) |
| Depends on | Live silver price available |
| Persists | This device only |
| Stored in | localStorage `everypaisa.goldTicker.silverPurity` |
| Backend effect | None |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:39, apps/web/src/lib/metalPurity.ts:38 |

## Futures & Options → Portfolio F&O settings (no screen)

### Auto-approve expiry close <!-- S-FNO-001 -->
| Attribute | Value |
|---|---|
| Control type | Boolean (API only — no control in the app) |
| Location | None in the UI; `PATCH /api/fo/settings/:portfolioId` `{ autoApproveExpiryClose }` |
| Purpose | Let the 17:30 IST expiry job close expiring F&O positions without waiting for **Approve** |
| Default | `false` (source: packages/api/prisma/schema.prisma:2863) |
| Values | `true`: when a settlement price exists the job approves the close immediately · `false`: request waits on the **Expiry** tab |
| Depends on | A stored settlement price (never auto-closes without one) |
| Persists | Yes — server |
| Stored in | PortfolioSetting.autoApproveExpiryClose (per portfolio) |
| Backend effect | Read by `scanExpiringPositions` |
| Who can change | Portfolio owner via the API |
| Sources | packages/api/src/controllers/fo.controller.ts:274, packages/api/src/services/fo/foExpiry.service.ts:77 |

### Default equity tax treatment <!-- S-FNO-002 -->
| Attribute | Value |
|---|---|
| Control type | Enum (API only — no control in the app) |
| Location | None in the UI; `PATCH /api/fo/settings/:portfolioId` `{ defaultEquityTaxTreatment }` |
| Purpose | Intended per-portfolio default for treating equity trades as capital gains or business income |
| Default | `CAPITAL_GAINS` (source: packages/api/prisma/schema.prisma:622) |
| Values | `CAPITAL_GAINS` · `BUSINESS_INCOME` |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Portfolio.defaultEquityTaxTreatment |
| Backend effect | None found: no code reads the stored value |
| Who can change | Portfolio owner via the API |
| Sources | packages/api/src/controllers/fo.controller.ts:283 |

## Loans → Add loan / Edit loan

### Loan type <!-- S-LOAN-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** (both the list dialog and the detail-page dialog) |
| Purpose | Kind of loan |
| Default | `Home` in the add form (source: `apps/web/src/pages/loans/LoanListPage.tsx:338`); the server has no default (required) |
| Values | Home, Car, Personal, Education, Business, Gold, LAS, Other. Each except **Other** maps to a market loan type for **Compare with market** and refinance alerts; **Other** shows "No market data for this loan type." Also sets the card's watermark icon and the alert wording ("Home loan", "Loan against securities", …) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.loanType` |
| Backend effect | Market-rate lookup in market check and daily refinance check |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:56`, `packages/shared/src/loans/loanChecks.ts:48`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:7` |

### Prepayment option <!-- S-LOAN-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** (list dialog only) |
| Purpose | What a prepayment does to the schedule |
| Default | `Reduce tenure` (form: `apps/web/src/pages/loans/LoanListPage.tsx:347`; server fallback `REDUCE_TENURE`: `packages/api/src/services/loans/loans.service.ts:740`; DB default `packages/api/prisma/schema.prisma:3073`) |
| Values | `Reduce tenure`: same EMI, schedule ends earlier · `Reduce EMI`: same end month, EMI recomputed after each prepayment/foreclosure |
| Depends on | Only matters when prepayments are recorded (F-LOAN-007) |
| Persists | Yes — server |
| Stored in | `Loan.prepaymentOption` |
| Backend effect | Schedule rebuild in summary, schedule, market check, alerts |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:519`, `packages/api/src/services/loans/loans.service.ts:333` |

### Rate type <!-- S-LOAN-003 -->
| Attribute | Value |
|---|---|
| Control type | Select (also **Fixed** / **Floating** buttons on **Compare with market**) |
| Location | **Loans → Add loan / Edit loan**; loan page **Compare with market** |
| Purpose | Whether the loan's rate is fixed or follows a benchmark |
| Default | `Not sure` (form: `apps/web/src/pages/loans/LoanRateFields.tsx:24`; DB default `UNKNOWN`: `packages/api/prisma/schema.prisma:3085`) |
| Values | `Fixed`: "Fixed rate - no benchmark alerts." · `Floating`: shows **Linked to** and **Next rate reset**; eligible for benchmark alerts · `Not sure`: the market card asks "Fixed or floating?" |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.rateType` |
| Backend effect | Switching away from Floating clears benchmark and reset date; a benchmark or reset date for a non-floating loan is refused ("A benchmark and a reset date apply to floating-rate loans only") |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:62`, `apps/web/src/pages/loans/MarketCheckCard.tsx:150`, `packages/api/src/services/loans/loans.service.ts:176`, `packages/shared/src/loans/loanChecks.ts:16` |

### Linked to <!-- S-LOAN-004 -->
| Attribute | Value |
|---|---|
| Control type | Select (shown only for Floating) |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Which benchmark a floating loan follows |
| Default | `Not set` (source: `apps/web/src/pages/loans/LoanRateFields.tsx:90`) |
| Values | `Repo rate (EBLR)`: repo alerts; reset step 3 months · `MCLR`: the lender's 1-year MCLR (repo shown if the lender is not tracked); reset step 12 months · `Other / not sure` or `Not set`: no benchmark alerts; card says to set it |
| Depends on | S-LOAN-003 = Floating |
| Persists | Yes — server |
| Stored in | `Loan.rateBenchmark` |
| Backend effect | Selects benchmark series for the market card and daily benchmark alerts |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:80`, `packages/shared/src/loans/loanChecks.ts:24`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:61`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:202` |

### Next rate reset (optional) <!-- S-LOAN-005 -->
| Attribute | Value |
|---|---|
| Control type | Date (shown only for Floating) |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Next date the lender revises the rate |
| Default | Empty (source: `apps/web/src/pages/loans/LoanRateFields.tsx:25`) |
| Values | Any real date; used to estimate "(≈ <date>)" in benchmark alerts, rolled forward by 3 or 12 months until on or after today |
| Depends on | S-LOAN-003 = Floating |
| Persists | Yes — server |
| Stored in | `Loan.nextRateResetDate` |
| Backend effect | Alert text only; "Not a real date" refused |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:97`, `packages/shared/src/loans/loanChecks.ts:154`, `packages/api/src/services/loans/loans.service.ts:182` |

### Tax benefit section <!-- S-LOAN-006 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Turns on the tax benefit panel |
| Default | `None` (source: `apps/web/src/pages/loans/LoanListPage.tsx:348`) |
| Values | `None`: no panel · `80C + 24B (Home loan)`: principal ≤ ₹1,50,000 and interest ≤ ₹2,00,000 this FY, saving at 30% · `80E (Education loan)`: all interest this FY, saving at 30% |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.taxBenefitSection` (`80C+24B`, `80E`; older rows may hold `80C_24B`, treated the same) |
| Backend effect | `taxBenefit` in the loan summary |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:548`, `packages/api/src/services/loans/loans.service.ts:56`, `packages/api/src/services/loans/loans.service.ts:577` |

### Status <!-- S-LOAN-007 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Lifecycle of the loan |
| Default | `Active` (form `apps/web/src/pages/loans/LoanListPage.tsx:349`; server `packages/api/src/services/loans/loans.service.ts:745`) |
| Values | `Active`: outstanding from schedule, next EMI, reminders, market card, refinance/benchmark alerts, dashboard liability · `Closed` / `Foreclosed`: listed under **Closed / Foreclosed** showing loan amount; no reminders, no market card · `Default`: same as Closed, stamped **Default**; not counted as a liability on the dashboard |
| Depends on | Recording a **Foreclosure** payment sets `Foreclosed` automatically; deleting it reverts to `Active` |
| Persists | Yes — server |
| Stored in | `Loan.status`, `Loan.closedDate` (set only by a foreclosure payment) |
| Backend effect | Filters in alerts, loan checks, dashboard |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:566`, `apps/web/src/pages/loans/LoanListPage.tsx:155`, `packages/api/src/services/loans/loans.service.ts:856`, `packages/api/src/services/loans/loans.service.ts:951`, `packages/api/src/services/analytics/dashboard.service.ts:239` |

### Portfolio <!-- S-LOAN-008 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio picker |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | "Optional — assign this loan to a portfolio to group it with related assets." |
| Default | None (source: `apps/web/src/pages/loans/LoanListPage.tsx:350`) |
| Values | Any of your portfolios, or none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.portfolioId` |
| Backend effect | None found in this module's screens (stored only) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:574`, `packages/api/src/services/loans/loans.service.ts:743` |

## Loans → Compare with market

### Switching costs (Processing fee (%) and Other charges (₹)) <!-- S-LOAN-009 -->
| Attribute | Value |
|---|---|
| Control type | Two text fields |
| Location | Loan page → **Compare with market** |
| Purpose | Costs of moving the loan to a cheaper lender |
| Default | 0.5% and ₹10,000 (source: `packages/shared/src/loans/loanChecks.ts:55`) |
| Values | Fee 0–10%; other charges 0 to ₹100 crore. Change **Switching costs**, **Net saving**, **Break-even** and the **Open in calculator** link |
| Depends on | Shown only when the market rate is below your rate |
| Persists | No — reset when the page reloads |
| Stored in | Not stored |
| Backend effect | None; the daily refinance alert always uses the defaults |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/MarketCheckCard.tsx:100`, `apps/web/src/pages/loans/marketCheck.ts:27`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:168` |

## Loans → Lend money / Edit loan given

### How will it be repaid? <!-- S-LOAN-010 -->
| Attribute | Value |
|---|---|
| Control type | Two toggle buttons |
| Location | **Loans given → Lend money / Edit** |
| Purpose | Repayment mode of a loan given |
| Default | `Whenever` (form `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:66`; DB default `FLEXIBLE`: `packages/api/prisma/schema.prisma:3012`) |
| Values | `Whenever` (FLEXIBLE): shows **Expected back by (optional)**; daily simple interest; reminders only with a date · `Monthly EMI` (EMI): shows **EMI (₹)**, **Months**, **First EMI on** (all required); instalment schedule, EMI reminders |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `LoanGiven.repaymentMode` (+ `dueDate` or `emiAmount`/`tenureMonths`/`firstEmiDate`) |
| Backend effect | Summary, schedule and reminder logic (F-LOAN-018, F-LOAN-020, F-LOAN-022) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:225`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:137`, `packages/api/src/services/loans/loansGiven.service.ts:450` |

## EMI Calculator → Calculate

### Calculate mode (EMI / Max loan / Tenure) <!-- S-EMI-001 -->
| Attribute | Value |
|---|---|
| Control type | Radio switch |
| Location | **Tools → EMI Calculator → Calculate** |
| Purpose | What the calculator solves for |
| Default | `EMI` (source: `apps/web/src/pages/emi/emiState.ts:56`) |
| Values | `EMI`: shows loan amount and tenure, result **Monthly EMI** · `Max loan`: shows EMI and tenure, result **You can borrow** · `Tenure`: shows loan amount and EMI, result **Loan paid off in** |
| Depends on | — |
| Persists | In the page address / share link only |
| Stored in | URL parameter `s` |
| Backend effect | None (exports re-send the inputs) |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/CalculateTab.tsx:13`, `apps/web/src/pages/emi/emiState.ts:84` |

### Tenure unit (Years / Months) <!-- S-EMI-002 -->
| Attribute | Value |
|---|---|
| Control type | Toggle |
| Location | **Calculate** tab (and each offer on **Compare**) |
| Purpose | Unit of the tenure field |
| Default | `Years` (source: `apps/web/src/pages/emi/emiState.ts:56`) |
| Values | `Years`: value × 12 months; slider 1–30 · `Months`: as typed; slider 12–360 |
| Depends on | Hidden in Tenure mode |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/CalculateTab.tsx:45`, `apps/web/src/pages/emi/EmiField.tsx:44` |

### Prepayment Repeat <!-- S-EMI-003 -->
| Attribute | Value |
|---|---|
| Control type | Select (per prepayment) |
| Location | **Calculate → Advanced → Prepayments** |
| Purpose | One-off or yearly prepayment |
| Default | `Once` (source: `apps/web/src/pages/emi/AdvancedInputs.tsx:40`) |
| Values | `Once`: in that month only · `Every year`: that month and every 12 months after |
| Depends on | A prepayment row |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:33`, `packages/shared/src/loans/emi.ts:110` |

### Prepayment Effect <!-- S-EMI-004 -->
| Attribute | Value |
|---|---|
| Control type | Select (per prepayment) |
| Location | **Calculate → Advanced → Prepayments** |
| Purpose | What the prepayment changes |
| Default | `Cut tenure` (source: `apps/web/src/pages/emi/AdvancedInputs.tsx:40`) |
| Values | `Cut tenure`: keep EMI, finish earlier · `Cut EMI`: keep end month, lower EMI |
| Depends on | A prepayment row |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:34`, `packages/shared/src/loans/emi.ts:120` |

### Rate change: Bank adjusts <!-- S-EMI-005 -->
| Attribute | Value |
|---|---|
| Control type | Select (per rate change) |
| Location | **Calculate → Advanced → Rate changes (floating loans)** |
| Purpose | How the bank absorbs a rate change |
| Default | `Tenure (keep EMI)` (source: `apps/web/src/pages/emi/AdvancedInputs.tsx:57`) |
| Values | `Tenure (keep EMI)`: end month moves (EMI raised if it no longer covers interest or the loan would pass 40 years) · `EMI (keep tenure)`: EMI recomputed |
| Depends on | A rate-change row |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:51`, `packages/shared/src/loans/emi.ts:82` |

### Processing fee and charges <!-- S-EMI-006 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Calculate → Advanced** |
| Purpose | Include fees in total cost and APR |
| Default | Off (source: `apps/web/src/pages/emi/emiState.ts:59`) |
| Values | On: fee, GST and other charges fields shown and applied · Off: no fees |
| Depends on | — |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | Included in exports when on |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:63`, `apps/web/src/pages/emi/emiState.ts:116` |

### Fee type <!-- S-EMI-007 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced** (fees on); each offer on **Compare** |
| Purpose | How the processing fee is given |
| Default | `% of loan` (source: `apps/web/src/pages/emi/emiState.ts:59`) |
| Values | `% of loan`: up to 10% · `Fixed Rs.`: an amount |
| Depends on | S-EMI-006 on (Calculate) |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:66`, `packages/shared/src/loans/apr.ts:14` |

### Tax benefit <!-- S-EMI-008 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Calculate → Advanced** |
| Purpose | Estimate tax saved and cost after tax |
| Default | Off (source: `apps/web/src/pages/emi/emiState.ts:60`) |
| Values | On: tax fields, **Tax saved**, **Cost after tax**, **Tax benefit by year**, and **Cheapest after tax** on Compare · Off: none |
| Depends on | — |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | Included in exports when on |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:75`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:48` |

### Tax regime <!-- S-EMI-009 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced → Tax benefit** |
| Purpose | Which income-tax regime applies |
| Default | `Old regime` (source: `apps/web/src/pages/emi/emiState.ts:60`) |
| Values | `Old regime`: deductions per **Loan for** · `New regime`: no deduction, note shown |
| Depends on | S-EMI-008 on |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:78`, `packages/shared/src/loans/emiTax.ts:57` |

### Loan for <!-- S-EMI-010 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced → Tax benefit** |
| Purpose | Which deduction rules apply |
| Default | `Home - self-occupied` (source: `apps/web/src/pages/emi/emiState.ts:60`); set automatically by **Use this rate** on Live rates |
| Values | `Home - self-occupied`: interest ≤ ₹2,00,000 + principal within 80C room · `Home - let out`: same, excess interest listed as carried forward (not valued) · `Education`: all interest, first 8 FYs · `Other (no benefit)`: none |
| Depends on | S-EMI-008 on |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:79`, `apps/web/src/pages/emi/liveRates.ts:4`, `packages/shared/src/loans/emiTax.ts:24` |

## EMI Calculator → Live rates

### Loan type (Live rates) <!-- S-EMI-011 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → EMI Calculator → Live rates** |
| Purpose | Which loan type's rates to list |
| Default | `Home` (source: `apps/web/src/pages/emi/LiveRatesTab.tsx:46`) |
| Values | Home, Car, Two-wheeler, Personal, Education, Gold, Loan against property, Loan against securities, Business |
| Depends on | — |
| Persists | No — resets to Home on reload (not in the share link) |
| Stored in | Not stored |
| Backend effect | `GET /api/loan-rates?loanType=` |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/LiveRatesTab.tsx:63`, `packages/shared/src/loans/loanRates.ts:9` |

## Credit Cards → Add / Edit credit card

### Status (card) <!-- S-CARD-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Card lifecycle |
| Default | `Active` (form `apps/web/src/pages/creditCards/CreditCardListPage.tsx:288`; server `packages/api/src/services/banking/creditCards.service.ts:180`) |
| Values | `Active`: counted in the summary strip and dashboard, high-utilisation warning, reminders · `Blocked` / `Closed`: listed under **Blocked / Closed**, excluded from totals and reminders; **Payment due** only when an unpaid statement exists. (`INACTIVE` is accepted by the API but not offered.) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.status` |
| Backend effect | Filters for reminders and dashboard |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/services/banking/creditCards.service.ts:26`, `packages/api/src/services/banking/creditCards.service.ts:450` |

### Network <!-- S-CARD-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Card network shown on the card face |
| Default | `— select —` (none); filled from the catalogue when a catalogue card is picked |
| Values | Visa, Mastercard, RuPay, American Express, Diners Club (`OTHER` accepted by the API) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.network` |
| Backend effect | None beyond display |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:258`, `packages/api/src/services/banking/creditCards.service.ts:24` |

### Statement day <!-- S-CARD-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Day of the month the bill is generated |
| Default | `1` (source: `apps/web/src/pages/creditCards/CreditCardListPage.tsx:284`) |
| Values | 1–31; shown on the card page ("Statement day: N") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.statementDay` |
| Backend effect | None found (display only) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:515`, `packages/api/src/controllers/creditCards.controller.ts:34` |

### Due day <!-- S-CARD-004 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Day of the month payment is due |
| Default | `20` (source: `apps/web/src/pages/creditCards/CreditCardListPage.tsx:285`) |
| Values | 1–31; with no unpaid statement, **Payment due** on the list is the next occurrence of this day (clamped to the month's last day) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.dueDay` |
| Backend effect | None (reminders use statement due dates) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:520`, `apps/web/src/lib/creditCardDue.ts:67` |

## Vehicles → List

### Individual / Family <!-- S-VEH-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button switch |
| Location | **Asset Classes → Vehicles**, page header |
| Purpose | Show vehicles in one grid or grouped by RC owner name |
| Default | `individual` (source: `apps/web/src/pages/vehicles/VehicleListPage.tsx:36`) |
| Values | **Individual**: one grid · **Family**: sections per owner name ("Unassigned" when empty), largest group first |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `vehicles_view_mode` |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/VehicleListPage.tsx:30`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:39` |

## Vehicles → Fuel prices card

### State <!-- S-VEH-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Fuel-price card on **Vehicles** list and vehicle pages |
| Purpose | Choose whose prices to show |
| Default | State code from the first vehicle's RTO (list) or this vehicle's RTO (detail); `MH` if none (source: `apps/web/src/pages/vehicles/FuelPricesCard.tsx:69`) |
| Values | Any state returned by the server list |
| Depends on | — |
| Persists | No |
| Stored in | Page state only |
| Backend effect | `GET /api/vehicles/prices?state=<code>` |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/FuelPricesCard.tsx:15`, `apps/web/src/pages/vehicles/FuelPricesCard.tsx:107` |

## Vehicles → Valuation page

### Transaction <!-- S-VEH-003 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Vehicles → Get valuation** → **Vehicle details** |
| Purpose | Price for selling or buying |
| Default | `SELL` (**I want to sell**) (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:67`) |
| Values | Sell: multiplier 1.00 (individual) / 0.88 (dealer) · Buy: 1.05 (individual) / 1.10 (dealer) |
| Depends on | S-VEH-004 |
| Persists | No (part of the quote cache key) |
| Stored in | Page state; saved valuations record it in the valuation log |
| Backend effect | Changes the quote and its cache key |
| Who can change | Any signed-in user |
| Sources | `packages/shared/src/valuation/conditionEngine.ts:71`, `packages/api/src/services/valuation/quoteService.ts:41` |

### Counterparty <!-- S-VEH-004 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Vehicles → Get valuation** → **Vehicle details** |
| Purpose | Individual or dealer on the other side |
| Default | `INDIVIDUAL` (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:68`) |
| Values | **Individual** · **Dealer** (multipliers as S-VEH-003) |
| Depends on | S-VEH-003 |
| Persists | No |
| Stored in | Page state; valuation log on save |
| Backend effect | As S-VEH-003 |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/VehicleValuePage.tsx:234`, `packages/shared/src/valuation/conditionEngine.ts:71` |

### Condition sliders <!-- S-VEH-005 -->
| Attribute | Value |
|---|---|
| Control type | 11 range sliders (Fair, Good, Very Good, Excellent) |
| Location | **Vehicles → Get valuation** → **Condition** (after a quote) |
| Purpose | Adjust the estimate for the vehicle's condition |
| Default | All **Good** (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:72`) |
| Values | Stop values Fair 0.75, Good 0.85, Very Good 0.92, Excellent 1.00; weights Engine 0.20, Transmission 0.15, Frame 0.12, Brakes 0.10, Suspension 0.10, Car Exterior 0.09, Electrical 0.08, Wheel and Tyres 0.07, Car Interior 0.05, Steering 0.03, AC 0.01; price = Good × score ÷ 0.85 |
| Depends on | A quote |
| Persists | No; snapshot stored in the valuation log when **Save to my vehicle** is used |
| Stored in | Page state; `VehicleValuationLog.sliderSnapshot` on save |
| Backend effect | None until saved |
| Who can change | Any signed-in user |
| Sources | `packages/shared/src/valuation/conditionEngine.ts:17`, `packages/shared/src/valuation/conditionEngine.ts:32`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:468` |

## Vehicles → Edit vehicle dialog

### Portfolio (vehicle) <!-- S-VEH-006 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio picker |
| Location | Vehicle page → **Edit** → **Portfolio** |
| Purpose | "Optional — group this vehicle under a portfolio." |
| Default | None (source: `packages/api/src/services/vehicles/vehicles.service.ts:151`) |
| Values | Any of your portfolios, or none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Vehicle.portfolioId` |
| Backend effect | Stored only; no B05 screen filters by it (use by other areas not traced) |
| Who can change | Owner of the vehicle (or manager acting for them) |
| Sources | `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:443`, `packages/api/src/services/vehicles/vehicles.service.ts:188` |

## Real Estate → List

### Grid / Map (Real Estate) <!-- S-REST-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Asset Classes → Real Estate**, above the cards |
| Purpose | Cards or map of properties |
| Default | `grid` (source: `apps/web/src/components/property/useListView.ts:9`) |
| Values | **Grid**: cards · **Map**: pins with preview cards |
| Depends on | — |
| Persists | This device only (silently not remembered when storage is blocked) |
| Stored in | localStorage key `everypaisa.listView.real-estate` |
| Backend effect | Map view calls `GET /api/property-locations` which may look up up to 3 addresses per call |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/components/property/useListView.ts:5`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:839` |

## Real Estate → Property form

### Status <!-- S-REST-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add property** / **Edit property** → Identity → **Status** |
| Purpose | How the property is used |
| Default | `SELF_OCCUPIED` (sources: `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:71`, `packages/api/prisma/schema.prisma:3272`) |
| Values | Self-occupied, Second home, Vacant, Rented out, Under construction (also shows the Under construction section), Sold (label only — use **Mark sold**) |
| Depends on | **Make rental** sets Rented out; **Remove from rentals** turns Rented out back to Self-occupied; **Mark sold** sets Sold |
| Persists | Yes — server |
| Stored in | `OwnedProperty.status` |
| Backend effect | Sold properties are excluded from value totals and alerts |
| Who can change | Owner |
| Sources | `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:40`, `packages/api/src/services/realEstate/realEstate.service.ts:504`, `packages/api/src/services/realEstate/realEstateAlerts.ts:31` |

### Portfolio (property) <!-- S-REST-003 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio picker |
| Location | Property form → Identity → **Portfolio** |
| Purpose | Group the property under a portfolio |
| Default | None |
| Values | Any of your portfolios or none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `OwnedProperty.portfolioId` |
| Backend effect | Copied to the rental record by **Make rental**; alerts carry the portfolio id |
| Who can change | Owner |
| Sources | `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:282`, `packages/api/src/services/realEstate/realEstate.service.ts:214` |

### Tax due month <!-- S-REST-004 -->
| Attribute | Value |
|---|---|
| Control type | Select (January–December or "—") |
| Location | Property form → Property tax & society → **Tax due month** |
| Purpose | When property tax is due each year |
| Default | None ("—") |
| Values | Month 1–12: property-tax alerts 30/15/7/1 days before the 1st of that month · none: no property-tax alerts |
| Depends on | Property active and not Sold |
| Persists | Yes — server |
| Stored in | `OwnedProperty.propertyTaxDueMonth` |
| Backend effect | Drives property-tax alerts in the daily alert scan |
| Who can change | Owner |
| Sources | `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:455`, `packages/api/src/services/realEstate/realEstateAlerts.ts:66` |

## Real Estate / Rental → Location card

### Hand-placed pin <!-- S-REST-005 -->
| Attribute | Value |
|---|---|
| Control type | Map pin (drag/click) with **Place pin**/**Adjust pin**/**Done** and **Use the address** |
| Location | Property page → **Location** |
| Purpose | Fix a wrong or missing address lookup |
| Default | Off — pin comes from the address lookup |
| Values | Hand-placed ("Pinned by you"): kept until reset · reset (**Use the address**): address looked up again |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `latitude`, `longitude`, `locationSource` = "manual" on the property |
| Backend effect | A hand-placed pin is never overwritten by address lookups |
| Who can change | Owner |
| Sources | `apps/web/src/components/property/PropertyLocationCard.tsx:41`, `packages/api/src/services/realEstate/propertyLocation.service.ts:159` |

## Rental → List

### Grid / Map (Rental) <!-- S-RENT-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Asset Classes → Rental → Properties**, above the cards |
| Purpose | Cards or map |
| Default | `grid` (source: `apps/web/src/components/property/useListView.ts:9`) |
| Values | **Grid** · **Map** |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `everypaisa.listView.rental` |
| Backend effect | As S-REST-001 for rental properties |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/rental/RentalListPage.tsx:684`, `apps/web/src/components/property/useListView.ts:26` |

## Rental → Tenancy

### Rent credited to <!-- S-RENT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add tenancy** dialog; tenant khata page |
| Purpose | Which bank account the rent lands in |
| Default | "Not tracked" (null) |
| Values | One of your non-closed bank accounts · **Not tracked** |
| Depends on | Bank accounts exist |
| Persists | Yes — server |
| Stored in | `Tenancy.bankAccountId` |
| Backend effect | Later rent/deposit cash flows carry this account (shown in Cash Activity and Tally export); refused for another user's account |
| Who can change | Owner |
| Sources | `apps/web/src/components/rental/RentAccountPicker.tsx:12`, `packages/api/src/services/rental/rental.service.ts:379`, `packages/api/src/services/rental/rentalLedger.service.ts:373` |

### Due day of month <!-- S-RENT-004 -->
| Attribute | Value |
|---|---|
| Control type | Number (1–31) |
| Location | **Add tenancy** dialog |
| Purpose | Day rent is due each month |
| Default | 1 (sources: `apps/web/src/pages/rental/RentalDetailPage.tsx:639`, `packages/api/prisma/schema.prisma:2171`) |
| Values | 1–31; clamped to the last day of shorter months |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Tenancy.rentDueDay` |
| Backend effect | Sets each receipt's due date, which drives Overdue (due + 7 days), reminders and auto-match windows |
| Who can change | Owner; set once at creation in the web app |
| Sources | `packages/api/src/services/rental/rental.service.ts:178`, `packages/api/src/services/rental/rental.service.ts:408` |

## Rental → Pending tenant reminders

### Send via Email / SMS <!-- S-RENT-003 -->
| Attribute | Value |
|---|---|
| Control type | Two toggle chips |
| Location | **Rental → Properties** → Pending tenant reminders → **Send via** |
| Purpose | Channels for the next **Approve & send** |
| Default | Both on (source: `apps/web/src/pages/rental/RentalRemindersPanel.tsx:526`); a chip is off and disabled when the tenant lacks that contact |
| Values | Email on/off · SMS on/off; both off disables **Approve & send** |
| Depends on | Tenant email / phone; Gmail connection; operator SMS provider |
| Persists | No — one-shot override for this send; the stored per-reminder channels are unchanged |
| Stored in | Request body `channels` |
| Backend effect | Only enabled channels are attempted |
| Who can change | Owner |
| Sources | `apps/web/src/pages/rental/RentalRemindersPanel.tsx:703`, `packages/api/src/services/rental/rental.reminders.service.ts:541` |

## Rental → Tenant khata

### Apply to month <!-- S-RENT-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Khata → **You got**/**You gave** dialog → "Apply to month — leave blank to settle oldest first" |
| Purpose | Pin a credit to a month |
| Default | "Settle oldest first" (blank) |
| Values | Blank: fills the oldest open charge first · a month: fills that month first, remainder spills to oldest |
| Depends on | Tenancy has rent months |
| Persists | Yes — on the entry |
| Stored in | `RentLedgerEntry.forMonth` |
| Backend effect | Changes allocation and therefore month statuses |
| Who can change | Owner |
| Sources | `apps/web/src/pages/rental/TenantKhataPage.tsx:177`, `packages/api/src/services/rental/rentalLedgerMath.ts:1` |

## Insurance → Add a policy / Edit policy

### Type <!-- S-INS-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Kind of cover: Term life, Whole life, ULIP, Endowment, Health, Motor, Home, Travel, Personal accident |
| Default | Term life (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:52`) |
| Values | Life types count in **Life cover**, the nominee warning and section 123; Health in **Health cover**, section 126 and TPA fields; whole life/endowment/ULIP get **Surrender value**; life, health and personal accident allow critical illness; claim guides follow the type; default grace is 30/15 days only for life and health |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.type |
| Backend effect | Recomputes the premium schedule and next due date when changed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:34`, `packages/shared/src/insurance/premiumSchedule.ts:45` |

### Paid (premium frequency) <!-- S-INS-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | How often the premium is paid |
| Default | Yearly (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:57`) |
| Values | Monthly, Quarterly, Half-yearly, Yearly: due every 1/3/6/12 months from the start date; **Single premium**: no schedule, no grace, ₹0 in **Premiums a year**, hides **Next premium due** and **Grace period (days)** |
| Depends on | Start date |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumFrequency |
| Backend effect | Schedule and reminders |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/shared/src/insurance/premiumSchedule.ts:18` |

### Next premium due <!-- S-INS-003 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Insurance → Add policy / Edit** |
| Purpose | The first premium you want tracked; earlier premiums count as paid |
| Default | Blank → today on the server (source: `packages/api/src/services/insurance/insurance.service.ts:494`) |
| Values | A date: unpaid premiums before it become "untracked" |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumsTrackedFrom (and nextPremiumDue recomputed) |
| Backend effect | Moves the next due date and reminders; on edit sent only when changed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/components/insurance/PolicyFormDialog.tsx:358` |

### Grace period (days) <!-- S-INS-004 -->
| Attribute | Value |
|---|---|
| Control type | Number text |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Days to pay a missed premium before the policy lapses |
| Default | Blank = usual: 30 days (life/health, non-monthly), 15 days (monthly), none otherwise (source: `packages/shared/src/insurance/premiumSchedule.ts:89`) |
| Values | 0–90 days |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.gracePeriodDays |
| Backend effect | Decides "In grace" vs "May have lapsed" and grace reminders |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/controllers/insurance.controller.ts:80` |

### Critical illness cover <!-- S-INS-005 -->
| Attribute | Value |
|---|---|
| Control type | Select + optional amount |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Records whether the policy pays on a listed illness |
| Default | Not recorded (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:62`) |
| Values | Not recorded / "Yes — included or added as a rider" (optional amount) / No |
| Depends on | Only life, health and personal-accident types |
| Persists | Yes — server |
| Stored in | InsurancePolicy.criticalIllnessCover, criticalIllnessSumAssured |
| Backend effect | Shown on card and policy page; cleared for other types |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:340` |

## Insurance → Gmail cards

### Find my insurance documents in Gmail (Turn on / Turn off) <!-- S-INS-006 -->
| Attribute | Value |
|---|---|
| Control type | Toggle button per Gmail account |
| Location | **Insurance → Find my insurance documents in Gmail** |
| Purpose | Permission to search that inbox for insurance PDFs |
| Default | Off (source: `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:4`) |
| Values | On: first search looks back 3 years, then a nightly search at 05:30 IST, plus **Scan now**; Off: cancels running searches |
| Depends on | A connected Gmail account |
| Persists | Yes — server |
| Stored in | MailboxAccount.insuranceFetchEnabled, insuranceFetchConsentAt |
| Backend effect | Starts INSURANCE Gmail scan jobs; document reading uses the AI model and the monthly reading budget; every change audit-logged |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:58`, `packages/api/src/jobs/insuranceJobs.ts:18` |

### Remember it (encrypted) for future PDFs <!-- S-INS-007 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Insurance → Insurance documents from Gmail → Password protected** |
| Purpose | Save the PDF password so later PDFs open on their own |
| Default | On (source: `apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:59`) |
| Values | On: stored encrypted; Off: used once |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | The user's encrypted document-password store |
| Backend effect | Tries the password on every other locked document |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `packages/api/src/controllers/insurance.controller.ts:285` |

## Insurance → Tax on your premiums

### Who the policy covers <!-- S-INS-008 -->
| Attribute | Value |
|---|---|
| Control type | Select per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Which section 126 limit the premium counts towards |
| Default | Not set (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:298`) |
| Values | Not set (not counted), You, spouse and children, Your parents |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.taxBucket |
| Backend effect | Tax summary limits |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:319` |

### Senior citizen (60+) <!-- S-INS-009 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Raise the limit to ₹50,000 for that bucket |
| Default | Unticked (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:305`) |
| Values | On: ₹50,000 limit for the bucket; Off: ₹25,000 |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.seniorCitizen |
| Backend effect | Tax summary |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/shared/src/insurance/tax.ts:53` |

### Tax summary open state and financial year <!-- S-INS-010 -->
| Attribute | Value |
|---|---|
| Control type | Fold toggle + select |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Show or fold the card; pick the year |
| Default | Folded; current financial year (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:45`) |
| Values | Open/folded; current FY and the two before |
| Depends on | — |
| Persists | Open state: this device only; year: no |
| Stored in | localStorage `insurance.taxSummary.open` |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/components/insurance/TaxSummaryCard.tsx:43` |

## Insurance → Coverage check

### Coverage assumptions <!-- S-INS-011 -->
| Attribute | Value |
|---|---|
| Control type | Money fields, years field, checkboxes, Yes/No/Not sure |
| Location | **Insurance → Coverage check** |
| Purpose | Figures behind the life and health verdicts |
| Default | Seeded from your data: income × 12, expenses × 12, support 20 years, loans, child-education goals ticked, savings and investments counted, health benchmark ₹10,00,000, parents "Not sure" (source: `packages/shared/src/insurance/coverage.ts:293`) |
| Values | Change any; verdicts recompute instantly |
| Depends on | — |
| Persists | No — lost when you leave; **Use my recorded figures** resets |
| Stored in | Page state only |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/pages/insurance/CoveragePage.tsx:43` |

## Insurance → Nominees

### Under 18 <!-- S-INS-012 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per nominee |
| Location | **Insurance → policy → Nominees → Add/Edit** |
| Purpose | Marks a minor nominee who needs an appointee |
| Default | Unticked (source: `apps/web/src/components/insurance/NomineesCard.tsx:163`) |
| Values | On: **Appointee** required, **Appointee's relation** optional; Off: appointee cleared |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.nominees[].isMinor |
| Backend effect | Server requires an appointee |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:264` |

## PPF & EPF → Entry forms and auto-fetch

### Entry Type (EPF) <!-- S-PF-001 -->
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → EPF entry** |
| Purpose | Kind of EPF entry |
| Default | Contribution (monthly) (source: `apps/web/src/pages/assetClasses/EPFFormDialog.tsx:154`) |
| Values | Contribution (monthly) and Opening / current balance add to the holding; Withdrawal / settlement reduces it; Annual interest credit is recorded but not added |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/assetClasses/EPFFormDialog.tsx:40` |

### Entry Type (PPF) <!-- S-PF-002 -->
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → PPF entry** |
| Purpose | Kind of PPF entry |
| Default | Annual / partial deposit (source: `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:259`) |
| Values | Deposit and Opening balance add; Withdrawal and Account matured reduce; Yearly interest recorded but not added; deposits show **Account Maturity Date** |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:196` |

### Save credentials (encrypted) <!-- S-PF-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **PPF & EPF → Refresh** |
| Purpose | Store the portal UAN and password on the account |
| Default | Off (source: `apps/web/src/pages/pf/PfRefreshDialog.tsx:36`) |
| Values | On: saved encrypted and used by the worker; Off: passed only to this job |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | ProvidentFundAccount.storedCredentials (encrypted blob) |
| Backend effect | The worker prefers the saved blob when no inline credentials are passed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/controllers/pf.controller.ts:152` |

### Snooze 30d <!-- S-PF-004 -->
| Attribute | Value |
|---|---|
| Control type | Button |
| Location | **PPF & EPF → Auto-fetch accounts**, refresh banner |
| Purpose | Silence the refresh reminder for an account |
| Default | Not snoozed (source: `packages/api/prisma/schema.prisma:3464`) |
| Values | Snoozed for 30 days from the click |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.nudgeSnoozedUntil |
| Backend effect | Dismisses unread refresh alerts; daily job skips the account until the date |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:60` |

### Account type and bank (Link PF Account) <!-- S-PF-005 -->
| Attribute | Value |
|---|---|
| Control type | Toggle + select |
| Location | **PPF & EPF → Link account** |
| Purpose | Which portal the passbook is fetched from |
| Default | EPF; PPF bank SBI (source: `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:261`) |
| Values | EPF (EPFO), PPF at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank, Bank of Baroda |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.type, institution |
| Backend effect | Chooses the scraper adapter |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/controllers/pf.controller.ts:79` |

## Forex → Cash and LRS

### Currency (balance) <!-- S-FX-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → Cash → Add balance / Edit** |
| Purpose | Currency of the balance |
| Default | USD (source: `apps/web/src/pages/forex/ForexCashTab.tsx:263`) |
| Values | USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ForexBalance.currency |
| Backend effect | INR equivalent uses that currency's latest rate |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/forex/constants.ts:3` |

### Purpose (LRS) <!-- S-FX-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Reason for the remittance |
| Default | INVESTMENT (source: `apps/web/src/pages/forex/LrsTab.tsx:291`) |
| Values | INVESTMENT, EDUCATION, TRAVEL, GIFT, MAINTENANCE, MEDICAL, OTHER (stored only; no calculation differs) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | LrsRemittance.purpose |
| Backend effect | None beyond storage |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/forex/forex.service.ts:38` |

### Currency (remittance) <!-- S-FX-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Currency sent |
| Default | USD (same line as S-FX-002) |
| Values | The 11 supported currencies |
| Depends on | FX rate box (blank = latest stored rate for that currency) |
| Persists | Yes — server |
| Stored in | LrsRemittance.currency |
| Backend effect | INR equivalent = amount × rate |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/forex/forex.service.ts:284` |

## Goals → Create goal / Edit goal

### Category <!-- S-GOAL-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Kind of goal |
| Default | Custom (source: `apps/web/src/pages/goals/GoalDialog.tsx:79`) |
| Values | Retirement, Child education, Home purchase, Emergency fund (counts only cash, FDs, RDs and post-office savings/RD/TD), FIRE corpus, Vehicle, Travel, Wealth building, Custom |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.category |
| Backend effect | Emergency fund restricts counted holdings; Child education goals are ticked by default in Coverage check |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goalMath.ts:63` |

### Priority <!-- S-GOAL-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Label only |
| Default | Medium (source: `apps/web/src/pages/goals/GoalDialog.tsx:80`) |
| Values | High, Medium, Low (badge colour only) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.priority |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/goals/GoalsPage.tsx:37` |

### Status <!-- S-GOAL-003 -->
| Attribute | Value |
|---|---|
| Control type | Select (edit only) |
| Location | **Goals → Edit** |
| Purpose | Which section the goal is in |
| Default | Active (source: `apps/web/src/pages/goals/GoalDialog.tsx:81`) |
| Values | Active, Achieved (stamps the achieved date), Paused, Abandoned |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.status, achievedAt |
| Backend effect | Achieved date set or cleared on each save |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:115` |

### Inflation rate (decimal) <!-- S-GOAL-004 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | Expected inflation for the target |
| Default | 0.06 (source: `apps/web/src/pages/goals/GoalDialog.tsx:84`) |
| Values | Fraction below 10; blank = none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.inflationRate |
| Backend effect | Computes an inflation-adjusted target that no screen shows; the needed return ignores it |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:210` |

### Expected return (decimal) <!-- S-GOAL-005 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | The return you expect, to judge on/off track |
| Default | 0.12 (source: `apps/web/src/pages/goals/GoalDialog.tsx:85`) |
| Values | Fraction below 10; blank = no on/off-track verdict |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.expectedReturn |
| Backend effect | **Off-track** when needed return > this |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:246` |

### Linked portfolios <!-- S-GOAL-006 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Goals → New goal / Edit** |
| Purpose | Portfolios whose value counts toward the goal |
| Default | None (source: `apps/web/src/pages/goals/GoalDialog.tsx:89`) |
| Values | Any of your portfolios |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.portfolioIds |
| Backend effect | Current value = initial amount + linked holdings' value |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:180` |

## Income → Add income / Edit income

### Income type <!-- S-INC-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Income → Add income / Edit** |
| Purpose | Kind of income; changes the source label and suggestions |
| Default | Salary (source: `apps/web/src/pages/income/IncomeDialog.tsx:33`) |
| Values | Salary, Business, Trading, Freelance, Rental, Interest / Dividend, Capital Gains, Other; Rental, Interest / Dividend and Trading show suggestions |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Income.type |
| Backend effect | None beyond storage (all types count in the total) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/income/incomeTypeMeta.ts:3` |

### Currently active <!-- S-INC-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Income → Add income / Edit** |
| Purpose | Whether the income counts now |
| Default | On (source: `apps/web/src/pages/income/IncomeDialog.tsx:37`) |
| Values | On: in **Active** and the total, Health Score and Coverage check; Off: **Inactive**, not counted |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Income.isActive |
| Backend effect | `activeMonthlyIncomeTotal` counts only active entries |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/income/income.service.ts:113` |

## Cash Activity → List

### Direction tab (All / Inflows / Outflows) <!-- S-CASH-001 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Cash Activity** |
| Purpose | Filter entries by direction |
| Default | All (source: `apps/web/src/pages/cashflows/CashFlowsPage.tsx:17`) |
| Values | All, Inflows, Outflows (resets to page 1) |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` query parameter |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/pages/cashflows/CashFlowsPage.tsx:57` |

## Accounting → Chart of Accounts and Vouchers

### Type (account) <!-- S-ACCT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Account nature |
| Default | ASSET (source: `apps/web/src/pages/accounting/AccountingPage.tsx:93`) |
| Values | ASSET and EXPENSE: debits raise the balance; LIABILITY, EQUITY, INCOME: credits raise it; INCOME/EXPENSE feed the P&L |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.type |
| Backend effect | Balance sign and statement placement |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/accounting/accounting.service.ts:460` |

### Parent Account <!-- S-ACCT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Where the account sits in the tree |
| Default | None (top-level), or the row's account when added with **+** (source: `apps/web/src/pages/accounting/AccountingPage.tsx:181`) |
| Values | Any of your accounts |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.parentId |
| Backend effect | Tree display; an account with sub-accounts can't be deleted |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/accounting/accounting.service.ts:258` |

### Opening Balance (₹) <!-- S-ACCT-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Balance brought forward |
| Default | 0 (source: `apps/web/src/pages/accounting/AccountingPage.tsx:93`) |
| Values | Positive decimal on the account's normal side |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.openingBalance |
| Backend effect | Ledger opening, trial balance, balance-sheet difference line |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/schemas/accounting.schema.ts:43` |

### Voucher type <!-- S-ACCT-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Vouchers → New Voucher** |
| Purpose | Kind of voucher; sets the number prefix |
| Default | JOURNAL (source: `apps/web/src/pages/accounting/AccountingPage.tsx:218`) |
| Values | JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES; PAYMENT and RECEIPT are included in receipt bundles |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Voucher.type |
| Backend effect | Number uniqueness per type; bundle selection |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/schemas/accounting.schema.ts:20` |

### Voucher type filter <!-- S-ACCT-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Vouchers** |
| Purpose | Narrow the list and the receipt bundles |
| Default | All types (source: `apps/web/src/pages/accounting/AccountingPage.tsx:431`) |
| Values | All types or one type |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` parameter for list and bundles |
| Who can change | R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/accounting/AccountingPage.tsx:389` |

## Reports → Filter card

### Portfolio <!-- S-REPORT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports**, filter card |
| Purpose | Which book the on-screen tabs, tab downloads and statements cover |
| Default | **All portfolios** (`all`) (source: `apps/web/src/pages/reports/ReportsPage.tsx:197`) |
| Values | `all`: every portfolio you own · a portfolio id: that portfolio only |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `portfolioId` query parameter; server checks you own it (403 otherwise) |
| Who can change | Everyone who can open Reports |
| Sources | `apps/web/src/pages/reports/ReportsPage.tsx:304`, `packages/api/src/controllers/reports.controller.ts:93` |

### Report for <!-- S-REPORT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports** filter card; **Tax & MIS downloads** input card; **Download Report** dialog |
| Purpose | Whose figures a download covers |
| Default | **Me** (`self`) (source: `apps/web/src/components/reports/useReportSubject.ts:102`) |
| Values | **Me** · **Whole family (one section per member)** · a member's name. Options other than Me appear only when viewing a family whose view is not capped |
| Depends on | Family view (D-REPORT-007) |
| Persists | No (resets to Me when the selection is no longer offered) |
| Stored in | Hook state; sent as `subject` and `familyId` query parameters |
| Backend effect | Server authorises the subject against your family scope; capped members are refused; Tally export, holdings/dashboard exports and FY bundle refuse **Whole family** |
| Who can change | R-FAMOWNER; R-FAMCONTRIB / R-FAMVIEWER with an uncapped view |
| Sources | `apps/web/src/components/reports/useReportSubject.ts:90`, `apps/web/src/components/reports/useReportSubject.ts:117`, `packages/api/src/services/reports/reportSubjects.ts:94` |

### Financial Year (Reports) <!-- S-REPORT-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports**, filter card (Intraday, STCG, LTCG, Schedule 112A, Income tabs) |
| Purpose | Year for FY-based tabs, their downloads and the FY-based statements |
| Default | Current Indian FY (source: `apps/web/src/pages/reports/ReportsPage.tsx:198`) |
| Values | Current FY and the 7 before it |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` query parameter, validated as consecutive years |
| Who can change | Everyone who can open Reports |
| Sources | `apps/web/src/pages/reports/ReportsPage.tsx:139`, `apps/web/src/pages/reports/ReportsPage.tsx:338` |

## Reports → Tax & MIS downloads

### Financial year (Tax & MIS) <!-- S-REPORT-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Year for catalog reports that use "FY" |
| Default | The page's FY when the tab opens (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:531`) |
| Values | Current FY and 7 before |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` parameter on reports that use it |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:607` |

### As-of date <!-- S-REPORT-005 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Valuation/closing date for "As of" reports |
| Default | Today (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:532`) |
| Values | Any date; blank = report default |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `asOf` parameter; invalid → "Invalid `asOf` date" |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:617` |

### From <!-- S-REPORT-006 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | Start of the period for date-range reports |
| Default | Empty (report's default range) (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:533`) |
| Values | Any date ≤ **To** |
| Depends on | S-REPORT-007 |
| Persists | No |
| Stored in | Component state |
| Backend effect | `from`; "`from` date is after `to` date" if reversed |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:621`, `packages/api/src/controllers/reports.controller.ts:1222` |

### To <!-- S-REPORT-007 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Tools → Reports → Tax & MIS downloads** |
| Purpose | End of the period for date-range reports |
| Default | Today (source: `apps/web/src/pages/reports/TaxMisDownloads.tsx:534`) |
| Values | Any date ≥ **From** |
| Depends on | S-REPORT-006 |
| Persists | No |
| Stored in | Component state |
| Backend effect | `to` parameter |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/reports/TaxMisDownloads.tsx:625` |

### Report theme <!-- S-REPORT-011 -->
| Attribute | Value |
|---|---|
| Control type | Implicit (follows the app theme); toggle **Appearance** in the Download Report dialog |
| Location | All report downloads; **Download Report** dialog |
| Purpose | Light or dark colours in PDF/Excel files |
| Default | The app's current theme (source: `apps/web/src/lib/reportTheme.ts:13`) |
| Values | `light` ("Light (print)") · `dark` |
| Depends on | App theme (B10) |
| Persists | Follows the app theme setting; the dialog override is per download |
| Stored in | Theme store; `theme` query parameter |
| Backend effect | Colours of the generated file |
| Who can change | Everyone |
| Sources | `apps/web/src/lib/reportTheme.ts:13`, `apps/web/src/components/reports/DownloadReportButton.tsx:46` |

## Reports → Inbox imports

### Status filter <!-- S-REPORT-008 -->
| Attribute | Value |
|---|---|
| Control type | Chips |
| Location | **Tools → Reports → Inbox imports** |
| Purpose | Which documents are listed |
| Default | **Pending review** (source: `apps/web/src/pages/reports/InboxImportsTab.tsx:28`) |
| Values | Pending review · Approved · Imported · Parse failed · All |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `status` parameter (omitted for All) |
| Who can change | Everyone with Gmail connected |
| Sources | `apps/web/src/pages/reports/InboxImportsTab.tsx:122` |

### Sender filter <!-- S-REPORT-009 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports → Inbox imports** |
| Purpose | Limit to one sender address |
| Default | **All senders** (source: `apps/web/src/pages/reports/InboxImportsTab.tsx:29`) |
| Values | All senders or one address from your discovered senders |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fromAddress` parameter |
| Who can change | Everyone with Gmail connected |
| Sources | `apps/web/src/pages/reports/InboxImportsTab.tsx:165` |

### Doc type filter <!-- S-REPORT-010 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Reports → Inbox imports** |
| Purpose | Limit to one document type |
| Default | **All doc types** (source: `apps/web/src/pages/reports/InboxImportsTab.tsx:30`) |
| Values | Every inbox document type except "NOT FINANCIAL" |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `docType` parameter |
| Who can change | Everyone with Gmail connected |
| Sources | `apps/web/src/pages/reports/InboxImportsTab.tsx:175` |

## Tax Planning → Top card

### Financial Year (Tax) <!-- S-TAX-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Tax Planning** |
| Purpose | Year for all tabs and downloads |
| Default | Latest FY with activity, else current FY (source: `apps/web/src/pages/tax/TaxPage.tsx:146`) |
| Values | FYs with capital gains or transactions, newest first |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` parameter (required by summary, schedule-43, CSVs, PDF) |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:269`, `packages/api/src/services/tax/tax.service.ts:104` |

### Download reports for <!-- S-TAX-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Tax Planning** |
| Purpose | Whose CA Tax Report / CSV is downloaded |
| Default | **Me** |
| Values | Me or one member (no "Whole family") |
| Depends on | Family view; same rules as S-REPORT-002 |
| Persists | No |
| Stored in | Hook state |
| Backend effect | `subject`/`familyId` on downloads. The two CSV buttons call an endpoint that ignores it (see DOCUMENTATION_GAPS.md) |
| Who can change | As S-REPORT-002 |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:286`, `apps/web/src/pages/tax/TaxPage.tsx:293`, `packages/api/src/controllers/fmv.controller.ts:117` |

## Tax Planning → Grandfathering (112A FMV)

### FMV / unit override <!-- S-TAX-003 -->
| Attribute | Value |
|---|---|
| Control type | Number per row (per ISIN) |
| Location | **Planning → Tax Planning → Grandfathering (112A FMV)** |
| Purpose | Your 31-Jan-2018 price per unit for an ISIN, replacing the seed value |
| Default | Seed value where one exists, else empty ("Enter FMV") |
| Values | Number ≥ 0 · revert = delete override |
| Depends on | Row must have an ISIN |
| Persists | Yes — server, your account |
| Stored in | User FMV override record (per user + ISIN) |
| Backend effect | Invalidates your FMV cache and starts a background capital-gains recompute; changes Schedule 112A, the summary and CSV FMV column |
| Who can change | The account owner; R-MANAGER for the managed person |
| Sources | `apps/web/src/pages/tax/TaxPage.tsx:1083`, `packages/api/src/controllers/fmv.controller.ts:99`, `packages/api/src/controllers/fmv.controller.ts:108` |

## Analytics → Header

### Portfolio (Analytics) <!-- S-ANLYT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Analytics**, header |
| Purpose | Scope of all cards except what-if and rule-based insights |
| Default | **All portfolios (N)** (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:50`) |
| Values | ALL or a portfolio id |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `portfolioId` on snapshot, risk, insights; ownership checked |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/AnalyticsPage.tsx:123`, `packages/api/src/controllers/analytics.controller.ts:59` |

### Period <!-- S-ANLYT-002 -->
| Attribute | Value |
|---|---|
| Control type | Pills |
| Location | **Overview → Analytics**, header |
| Purpose | Window for value chart, income chart, money in/out, risk, AI insights |
| Default | **1Y** (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:51`) |
| Values | 1M (30 days), 3M (90), 6M (180), 1Y (365), 3Y (1095), 5Y (1825), All |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `period` parameter |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/AnalyticsPage.tsx:27`, `packages/api/src/services/analytics/analytics.service.ts:43` |

### View <!-- S-ANLYT-003 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Overview → Analytics** |
| Purpose | Overview or Detail cards |
| Default | Overview (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:57`) |
| Values | Overview · Detail (`?view=detail`) |
| Depends on | — |
| Persists | In the URL only |
| Stored in | URL search parameter `view` |
| Backend effect | Detail also fetches `/api/analytics/risk` |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/AnalyticsPage.tsx:58`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:85` |

### Tax financial year (Analytics) <!-- S-ANLYT-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Analytics → Tax** |
| Purpose | Year for "What you'll owe" and whether the harvest card shows |
| Default | Current FY (source: `apps/web/src/pages/analytics/AnalyticsPage.tsx:55`) |
| Values | Current FY plus years with activity |
| Depends on | — |
| Persists | No |
| Stored in | Component state |
| Backend effect | `fy` on `/api/tax/advance` |
| Who can change | Everyone |
| Sources | `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:23`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:199` |

### AI Insights panel folded <!-- S-ANLYT-005 -->
| Attribute | Value |
|---|---|
| Control type | Collapsible header |
| Location | **Overview → Analytics → AI Portfolio Insights** |
| Purpose | Keep the panel folded across visits |
| Default | Open (source: `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:136`) |
| Values | Open · Folded (no insight requests are made while folded) |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `analytics_insights_collapsed` (`1` when folded) |
| Backend effect | None; folded panel does not fetch |
| Who can change | Everyone who sees the panel |
| Sources | `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:107`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:118` |

## Advisor → Risk questionnaire

### Age <!-- S-ADV-001 -->
| Attribute | Value |
|---|---|
| Control type | Number field ("How old are you?") |
| Location | **Overview → Advisor → Tell us how you invest / Retake your risk assessment** |
| Purpose | Applies the age guardrail |
| Default | Blank; on a retake the last answer (`apps/web/src/pages/advisor/RiskQuestionnaire.tsx:159`) |
| Values | Web accepts 18–100; server accepts 1–120 (and null). Age 55 or more caps an Aggressive score at Growth |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers` (new row per submission) |
| Backend effect | Override `AGE_CAP` recorded in `overrides` |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `packages/api/src/services/analytics/riskProfileMath.ts:85`, `packages/api/src/services/advisor/riskProfile.service.ts:166` |

### Investment horizon <!-- S-ADV-002 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("When will you need most of this money?") |
| Location | **Overview → Advisor →** questionnaire Q2 |
| Purpose | Weight 20 in the risk score |
| Default | None (must choose) |
| Values | Under 3 years (0), 3 to 7 years (0.4), 7 to 15 years (0.75), More than 15 years (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.horizon` |
| Backend effect | Changes score → category → model portfolio |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:29`, `packages/api/src/services/analytics/riskProfileMath.ts:60` |

### Drawdown reaction <!-- S-ADV-003 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Your portfolio drops 20% in three months. What do you actually do?") |
| Location | Questionnaire Q3 |
| Purpose | Weight 25 (largest) in the risk score |
| Default | None |
| Values | Sell everything (0), Sell some of it (0.35), Hold and do nothing (0.8), Buy more (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.drawdownReaction` |
| Backend effect | Changes score and category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:36`, `packages/api/src/services/analytics/riskProfileMath.ts:61` |

### Investable share of income <!-- S-ADV-004 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Roughly what share of your take-home income do you invest each month?") |
| Location | Questionnaire Q4 |
| Purpose | Weight 15 in the risk score |
| Default | None |
| Values | Under 10% (0), 10–20% (0.4), 20–35% (0.75), Over 35% (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.investableShareOfIncome` |
| Backend effect | Changes score and category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:43`, `packages/api/src/services/analytics/riskProfileMath.ts:62` |

### Objective <!-- S-ADV-005 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("What is this portfolio mainly for?") |
| Location | Questionnaire Q5 |
| Purpose | Weight 20 in the risk score |
| Default | None |
| Values | Protect what I have (0), Generate regular income (0.35), Grow steadily with some safety (0.7), Grow as fast as possible (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.objective` |
| Backend effect | Changes score and category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:50`, `packages/api/src/services/analytics/riskProfileMath.ts:63` |

### Emergency fund <!-- S-ADV-006 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Do you have an emergency fund you could live on for six months?") |
| Location | Questionnaire Q6 |
| Purpose | Guardrail — not scored |
| Default | None |
| Values | Yes: no change · No, not yet: Aggressive → Growth and Growth → Balanced (recorded as `NO_EMERGENCY_FUND`) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.hasEmergencyFund` |
| Backend effect | Lowers category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:64`, `packages/api/src/services/analytics/riskProfileMath.ts:120` |

### Tax slab <!-- S-ADV-007 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Which income-tax slab are you in?") |
| Location | Questionnaire Q7 |
| Purpose | Tax rate used in advice text (for example tax-loss harvesting) |
| Default | None |
| Values | 5% → 5 · 20% → 20 · 30% → 30 · Not sure → unknown (shown "Not sure") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.taxSlabPct` |
| Backend effect | Shown on the profile; engine facts |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:57`, `packages/api/src/services/analytics/riskProfileMath.ts:65` |

## Advisor → Recommendations

### Recommendation status tab <!-- S-ADV-008 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Overview → Advisor → What to do next** |
| Purpose | Filter the feed |
| Default | `Open` (`apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:33`) |
| Values | Open, Accepted, Snoozed, Done, Dismissed |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `status` query parameter |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:15` |

## Advisor → Override list

### Bucket (override list) <!-- S-ADV-009 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Advisor → Override list** |
| Purpose | The bucket an approved product is attached to |
| Default | Equity — Domestic (first bucket) (`apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:34`) |
| Values | Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives |
| Depends on | A risk profile (model portfolio) |
| Persists | The selection no; the added product yes |
| Stored in | `AdvisorApprovedProduct.bucket` |
| Backend effect | Non-empty bucket → engine names your products for that bucket first |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:164`, `packages/api/src/services/advisor/productResolution.ts:11` |

## Client books → Chart of accounts

### Account type <!-- S-CA-001 -->
| Attribute | Value |
|---|---|
| Control type | Select (new account only) |
| Location | **Client books → client → Chart of accounts → New account** |
| Purpose | Which statement side the balance falls on |
| Default | Asset (`apps/web/src/components/ca/AccountFormDialog.tsx:45`) |
| Values | Asset, Liability, Income, Expense, Equity |
| Depends on | Client's books right |
| Persists | Yes — server (client's books) |
| Stored in | Client's `Account.type` |
| Backend effect | Cannot be changed later from the page |
| Who can change | R-PROF / R-PRO with books right |
| Sources | `apps/web/src/api/ca.api.ts:419`, `packages/api/src/schemas/accounting.schema.ts:41` |

## Client books → Vouchers

### Voucher type <!-- S-CA-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Client books → client → Vouchers → Post voucher** |
| Purpose | Kind of voucher; also selects the next number series |
| Default | Journal (`apps/web/src/components/ca/VoucherFormDialog.tsx:51`) |
| Values | Journal, Payment, Receipt, Contra, Purchase, Sales |
| Depends on | Books right |
| Persists | Yes — server |
| Stored in | Client's `Voucher.type` |
| Backend effect | Next number fetched per (client, type) |
| Who can change | R-PROF / R-PRO with books right |
| Sources | `apps/web/src/api/ca.api.ts:420`, `packages/api/src/schemas/accounting.schema.ts:56` |

## Client books → Transactions

### Transaction type and asset class <!-- S-CA-003 -->
| Attribute | Value |
|---|---|
| Control type | Two selects |
| Location | **Client books → client → Transactions → Add transaction** |
| Purpose | Kind of trade and asset class; asset class decides which name fields show |
| Default | Buy / Equity (`apps/web/src/components/ca/AddTransactionDialog.tsx:41`) |
| Values | Types: Buy, Sell, SIP, Switch in, Switch out, Dividend payout, Dividend reinvest, Bonus, Split, Redemption · Asset classes: 26 (Equity, Mutual fund, ETF, bonds, deposits, NPS/PPF/EPF, gold/silver, crypto, REIT/InvIT, PMS/AIF/ULIP, foreign equity, real estate, art, cash, other) |
| Depends on | Transactions right |
| Persists | Yes — server |
| Stored in | Client's `Transaction` |
| Backend effect | Mutual fund → scheme fields; Equity/ETF/Foreign equity → symbol fields; others → asset name |
| Who can change | R-PROF / R-PRO with transactions right |
| Sources | `apps/web/src/api/ca.api.ts:394`, `apps/web/src/api/ca.api.ts:406`, `apps/web/src/components/ca/AddTransactionDialog.tsx:72` |

## Client books → Reports

### Report period filters <!-- S-CA-004 -->
| Attribute | Value |
|---|---|
| Control type | Select + three date fields |
| Location | **Client books → client → Reports** |
| Purpose | Parameters for each report (each uses what it needs) |
| Default | Current FY (April–March); As-of and To = today; From blank (`apps/web/src/components/ca/ClientReportsTab.tsx:37`) |
| Values | Financial year: current and 5 previous · dates YYYY-MM-DD |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | Sent as `fy`, `asOf`, `from`, `to` |
| Who can change | R-PROF, R-PRO |
| Sources | `apps/web/src/components/ca/ClientReportsTab.tsx:81` |

## Split Expenses → New group / group settings

### Group type <!-- S-SPLIT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Split Expenses → New group** |
| Purpose | Label for the group |
| Default | Trip in the dialog; Other on the server when omitted (`packages/api/src/services/split/groups.service.ts:138`) |
| Values | Trip, Home, Couple, Other (1:1 ledgers are "DIRECT", created by the app) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `SplitGroup.type` |
| Backend effect | DIRECT groups can't change type or members |
| Who can change | Group creator at creation (type change is API-only) |
| Sources | `apps/web/src/pages/split/NewGroupDialog.tsx:15` |

### Group currency <!-- S-SPLIT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **New group → Currency** |
| Purpose | The group's base currency for balances |
| Default | INR (`packages/api/prisma/schema.prisma:5247`) |
| Values | INR, USD, EUR, GBP, AED, SGD, THB, JPY, AUD, CAD |
| Depends on | — |
| Persists | Yes — fixed after creation |
| Stored in | `SplitGroup.baseCurrency` |
| Backend effect | Non-INR groups can't use UPI pay/request links |
| Who can change | At creation only |
| Sources | `apps/web/src/pages/split/NewGroupDialog.tsx:21`, `packages/api/src/services/split/settings.service.ts:66` |

### Simplify debts <!-- S-SPLIT-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox ("Simplify debts (fewest payments to settle)") |
| Location | Group → **Settings** |
| Purpose | How suggested payments are computed |
| Default | On (`packages/api/prisma/schema.prisma:5248`) |
| Values | On: fewest payments (largest creditor vs largest debtor) · Off: person-to-person debts from each expense |
| Depends on | Not on 1:1 groups |
| Persists | Yes — server, saved immediately |
| Stored in | `SplitGroup.simplifyDebts` |
| Backend effect | Changes Balances list, friend totals, UPI amounts and reminders |
| Who can change | Any active member |
| Sources | `apps/web/src/pages/split/GroupPage.tsx:174`, `packages/api/src/services/split/settings.service.ts:52` |

### Archive group <!-- S-SPLIT-004 -->
| Attribute | Value |
|---|---|
| Control type | Button (**Archive group** / **Unarchive group**) |
| Location | Group → **Settings** |
| Purpose | Hide a finished group from the home list |
| Default | Not archived |
| Values | Archived: listed under **Show archived** · Unarchived: normal |
| Depends on | Confirmation when balances are unsettled |
| Persists | Yes — server |
| Stored in | `SplitGroup.archivedAt` |
| Backend effect | Archived groups still count in friend balances |
| Who can change | Any active member |
| Sources | `apps/web/src/pages/split/GroupPage.tsx:206`, `packages/api/src/services/split/groups.service.ts:177` |

## Split Expenses → Add / edit expense

### Split mode <!-- S-SPLIT-005 -->
| Attribute | Value |
|---|---|
| Control type | Tabs (**Equally**, **Exact**, **Percent**, **Shares**) |
| Location | **Add expense** dialog → **Split** |
| Purpose | How the amount is divided |
| Default | Equally |
| Values | Equally: ticked people share equally · Exact: amounts must sum to total · Percent: must total 100 · Shares: proportional weights (start at 1) |
| Depends on | — |
| Persists | Yes — per expense |
| Stored in | `SplitExpense.splitMode`, share `rawInput` |
| Backend effect | Allocation in whole paise; leftover paise by member id order |
| Who can change | Group members |
| Sources | `apps/web/src/pages/split/AddExpenseDialog.tsx:18`, `packages/api/src/services/split/allocate.ts:51` |

### Expense currency and exchange rate <!-- S-SPLIT-006 -->
| Attribute | Value |
|---|---|
| Control type | Select + number ("1 <ccy> in <group ccy>") |
| Location | **Add expense** dialog |
| Purpose | Record a bill in another currency |
| Default | Group currency; rate blank = latest stored rate |
| Values | Group currency + 10 listed currencies |
| Depends on | A stored rate when the rate is left blank |
| Persists | Yes — per expense (`fxRate`, `baseAmount`) |
| Stored in | `SplitExpense.currency`, `fxRate` |
| Backend effect | Base amount = amount × rate, rounded half-even to 2 places |
| Who can change | Group members |
| Sources | `apps/web/src/pages/split/AddExpenseDialog.tsx:114`, `packages/api/src/services/split/fx.ts:22` |

## Split Expenses → Split settings

### UPI ID <!-- S-SPLIT-007 -->
| Attribute | Value |
|---|---|
| Control type | Text |
| Location | **Split settings → Payments** |
| Purpose | Where friends pay you; used in your request links |
| Default | Empty (`packages/api/src/services/split/settings.service.ts:12`) |
| Values | name@bank format, or empty to remove |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `SplitSettings.upiId` |
| Backend effect | Shown to members who owe you (after you have taken part in the group) |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:65`, `packages/api/src/services/split/settings.service.ts:26` |

### Home currency <!-- S-SPLIT-008 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Split settings → Defaults** |
| Purpose | Currency of totals and friend balances |
| Default | INR (`packages/api/prisma/schema.prisma:5435`) |
| Values | 10 listed currencies |
| Depends on | Stored exchange rates for conversions |
| Persists | Yes — server |
| Stored in | `SplitSettings.homeCurrency` |
| Backend effect | Friend balances converted at the latest rate ("≈") |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:71`, `packages/api/src/services/split/ledger.service.ts:33` |

### Default portfolio <!-- S-SPLIT-009 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio select ("None") |
| Location | **Split settings → Defaults** |
| Purpose | Portfolio used when you switch on "Add my share to Cash Activity" |
| Default | None |
| Values | One of your portfolios, or None (then you are asked each time) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `SplitSettings.defaultPortfolioId` |
| Backend effect | Must be your own portfolio |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:77`, `apps/web/src/pages/split/ExpenseExtras.tsx:284` |

### Email about activity <!-- S-SPLIT-010 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox ("Email me about activity in my groups (at most hourly)") |
| Location | **Split settings → Emails** |
| Purpose | Hourly digest of others' changes |
| Default | On (`packages/api/prisma/schema.prisma:5441`) |
| Values | On: digest at :05 each hour when there is news · Off: none |
| Depends on | Server email |
| Persists | Yes — server |
| Stored in | `SplitSettings.emailOnActivity` |
| Backend effect | Activity digest job |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:85`, `packages/api/src/jobs/splitDigestJobs.ts:33` |

### Weekly balance summary <!-- S-SPLIT-011 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox ("Weekly balance summary (Mondays)") |
| Location | **Split settings → Emails** |
| Purpose | Monday 09:00 IST summary of who owes whom |
| Default | Off (`packages/api/prisma/schema.prisma:5442`) |
| Values | On / Off |
| Depends on | Server email |
| Persists | Yes — server |
| Stored in | `SplitSettings.weeklyDigest` |
| Backend effect | Weekly digest job |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:89`, `packages/api/src/jobs/splitDigestJobs.ts:34` |

## Split Expenses → Expense page

### Add my share to Cash Activity <!-- S-SPLIT-012 -->
| Attribute | Value |
|---|---|
| Control type | Switch |
| Location | Expense page → **Cash Activity** |
| Purpose | Mirror your share as an outflow in Cash Activity |
| Default | Off |
| Values | On: outflow created and kept in sync · Off: outflow deleted |
| Depends on | S-SPLIT-009 or a portfolio picked on the spot; a non-zero share |
| Persists | Yes — server |
| Stored in | `SplitShareLink` + `CashFlow` |
| Backend effect | Re-synced on expense edits and nightly at 02:30 IST |
| Who can change | Each member for their own share |
| Sources | `apps/web/src/pages/split/ExpenseExtras.tsx:302`, `packages/api/src/services/split/shareLink.service.ts:155` |

## Split Expenses → Settle up

### Payment method <!-- S-SPLIT-013 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Settle up** dialog → **Method** |
| Purpose | Records how a repayment was made |
| Default | Cash (`apps/web/src/pages/split/SettleUpDialog.tsx:96`); Pay via UPI records UPI |
| Values | Cash, UPI, Other |
| Depends on | — |
| Persists | Yes — per payment |
| Stored in | `SplitSettlement.method` |
| Backend effect | None beyond the record |
| Who can change | Group members |
| Sources | `packages/api/src/controllers/split.controller.ts:64` |

## Family → Add member / Edit managed member

### Their place in the family <!-- S-FAM-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Family → Members & sharing → Add member → Add them now / Add several** |
| Purpose | Role of a managed member: describes how they are counted; grants nothing because they never sign in |
| Default | `CONTRIBUTOR` (source: `apps/web/src/pages/family/FamilyPage.tsx:971`; server default `packages/api/src/services/family/family.service.ts:1028`) |
| Values | **Contributor — counted in the household** · **Viewer — listed, but kept to the side** (bulk form: plural labels). Owner is not offered and is refused by the server |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `FamilyMember.role` |
| Backend effect | None on access (the profile cannot sign in); shown on the tree (eye icon for Viewer) |
| Who can change | R-FAMOWNER (on add); later only via F-FAM-014 for signed-in members — no role control exists for managed members after adding |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1088`, `apps/web/src/pages/family/FamilyPage.tsx:1365`, `packages/api/src/routes/families.routes.ts:138` |

### Who keeps their books <!-- S-FAM-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add them now**, **Add several**, and **Edit <managed member>** |
| Purpose | Chooses the one member allowed to open the managed member's account |
| Default | You (`apps/web/src/pages/family/FamilyPage.tsx:968`); server default caller (`packages/api/src/services/family/family.service.ts:1033`) |
| Values | Any ACTIVE member with a login; managed members are listed but disabled ("<name> — no login yet") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `User.managedById` of the managed profile |
| Backend effect | Decides who passes the `X-Act-As` check; changing it ends the old keeper's access on their next request; appears in the keeper's "Accounts you manage" |
| Who can change | R-FAMOWNER; the current keeper via API |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1097`, `apps/web/src/pages/family/FamilyPage.tsx:1609`, `packages/api/src/services/family/family.service.ts:998`, `packages/api/src/services/family/managedProfile.service.ts:76` |

### Related to / As their <!-- S-FAM-009 -->
| Attribute | Value |
|---|---|
| Control type | Select + chip group (with **Other…** free text, placeholder "e.g. Uncle, Guardian") |
| Location | Add member (all modes), Edit member, Edit managed member |
| Purpose | Records how the person is related and places them on the tree |
| Default | **Related to**: you, or the person whose card opened the dialog; relation: none (`apps/web/src/pages/family/FamilyPage.tsx:845`) |
| Values | Father, Mother, Father-in-law, Mother-in-law, Grandfather, Grandmother (above); Spouse, Wife, Husband (partner); Brother, Sister (beside); Son, Daughter, Son-in-law, Daughter-in-law, Grandson, Granddaughter (below); any typed relation goes below |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `FamilyMember.relation`, `FamilyMember.relatedToId`; tree in `Family.treeLayout` |
| Backend effect | Re-places the person on the tree; refused if it makes a loop; also feeds Will Maker family suggestions |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/components/family/RelationPicker.tsx:20`, `packages/shared/src/familyRelations.ts:34`, `packages/api/src/services/family/family.service.ts:949` |

## Family → Invite by email / Edit member

### What they can do <!-- S-FAM-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Invite by email** and **Edit <member>** |
| Purpose | The member's family role |
| Default | `CONTRIBUTOR` (`apps/web/src/pages/family/FamilyPage.tsx:1409`; server `packages/api/src/services/family/family.service.ts:575`) |
| Values | **Owner — sees everything, can manage the family** · **Contributor — filtered view, can add to the family** · **Viewer — filtered view, read-only** |
| Depends on | Owner disables S-FAM-004/S-FAM-005 |
| Persists | Yes — server |
| Stored in | `FamilyInvitation.role` → `FamilyMember.role` |
| Backend effect | Owner: no caps, can manage members, write family portfolios. Contributor: caps apply, can write family-shared portfolios. Viewer: caps apply, no family writes. The last owner can't be demoted |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1505`, `packages/api/src/services/family/familyScope.service.ts:182`, `packages/api/src/services/family/family.service.ts:237` |

### Asset classes (visibility) <!-- S-FAM-004 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox list with **All** / **None** |
| Location | **Invite by email** and **Edit <member>** → "Asset classes (n/N)" |
| Purpose | Which asset classes of the other members a contributor or viewer may see |
| Default | Empty list (`apps/web/src/pages/family/FamilyPage.tsx:1412`; schema `packages/api/prisma/schema.prisma:3813`) |
| Values | Ticked classes are visible. **Empty = nothing visible** (server). The UI hint says "Empty = no restriction" — this is wrong |
| Depends on | Ignored when role is Owner |
| Persists | Yes — server |
| Stored in | `FamilyMember.visibleAssetClasses` |
| Backend effect | Filters holdings, transactions and wealth of other members in family view, family dashboard and member pages; never filters the member's own data |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1860`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/familyScope.service.ts:208` |

### Non-portfolio categories (visibility) <!-- S-FAM-005 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox list with **All** / **None** |
| Location | **Invite by email** and **Edit <member>** → "Non-portfolio categories (n/N)" |
| Purpose | Which non-portfolio categories of other members a contributor or viewer may see |
| Default | Empty list (`packages/api/prisma/schema.prisma:3812`) |
| Values | Vehicle, Rental, Insurance, Loan, Credit card, Bank account, Owned property, Goal. **Empty = nothing visible** (server); UI hint says "Empty = no restriction (member sees vehicles, insurance, loans, etc.)" — wrong |
| Depends on | Ignored when role is Owner |
| Persists | Yes — server |
| Stored in | `FamilyMember.visibleCategories` |
| Backend effect | Gates other members' vehicles, rentals, insurance, loans, cards, bank accounts, property and goals in family view and the family dashboard |
| Who can change | R-FAMOWNER |
| Sources | `apps/web/src/pages/family/FamilyPage.tsx:1905`, `apps/web/src/pages/family/FamilyPage.tsx:1945`, `packages/api/src/services/family/familyScope.service.ts:44`, `packages/api/src/services/family/familyScope.service.ts:265` |

## Header → Switch view; Sidebar; User menu

### Viewing as family <!-- S-FAM-006 -->
| Attribute | Value |
|---|---|
| Control type | Menu selection |
| Location | Header **Switch view**; **View this family across the app**; dashboard strip **Personal view** |
| Purpose | Shows every scope-aware page as the selected family's combined data |
| Default | `null` = Personal view (`apps/web/src/stores/familyScope.store.ts:26`) |
| Values | Personal view · one of your ACTIVE families |
| Depends on | Cleared on sign-out, account switch, and entering/leaving a managed account |
| Persists | This device only (localStorage `everypaisa.familyScope`) |
| Stored in | localStorage `everypaisa.familyScope` |
| Backend effect | Adds `X-Viewing-As-Family` to every API call; server refuses non-members with 403 "You are not an active member of this family." |
| Who can change | R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER |
| Sources | `apps/web/src/components/family/FamilyScopeSwitcher.tsx:57`, `apps/web/src/api/client.ts:42`, `apps/web/src/lib/sessionBoundary.ts:36`, `packages/api/src/lib/familyHeader.ts:16` |

### Managing (acting as) <!-- S-FAM-007 -->
| Attribute | Value |
|---|---|
| Control type | Menu selection / button |
| Location | User menu **Accounts you manage**; tree card **Record something for …**; **Back to my account** |
| Purpose | Makes this tab act for a managed member |
| Default | `null` (your own account) (`apps/web/src/stores/actingAs.store.ts:31`) |
| Values | Your account · one profile you keep |
| Depends on | Left automatically if another account signs in |
| Persists | This tab only (sessionStorage `everypaisa.actingAs`) |
| Stored in | sessionStorage `everypaisa.actingAs` |
| Backend effect | Adds `X-Act-As` to data requests (not account routes); server re-checks each request; audit row on entering |
| Who can change | R-MANAGER |
| Sources | `apps/web/src/stores/actingAs.store.ts:28`, `apps/web/src/api/client.ts:48`, `packages/api/src/middleware/authenticate.ts:40` |

### Sidebar family expansion <!-- S-FAM-008 -->
| Attribute | Value |
|---|---|
| Control type | Chevron toggle per family |
| Location | Sidebar family tree |
| Purpose | Remembers which families are expanded |
| Default | All expanded until first toggle (`apps/web/src/components/layout/FamilyNavTree.tsx:58`) |
| Values | Comma-separated list of expanded family ids |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage `sidebar_families_expanded` |
| Backend effect | Members are fetched only for expanded families |
| Who can change | Any family member |
| Sources | `apps/web/src/components/layout/FamilyNavTree.tsx:28`, `apps/web/src/components/layout/FamilyNavTree.tsx:60` |

## Succession → When to share

### Trigger <!-- S-SUCC-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Planning → Succession → When to share** |
| Purpose | What starts the release |
| Default | `INACTIVITY` (`apps/web/src/pages/legacy/LegacyPage.tsx:43`) |
| Values | **If I'm inactive** (inactivity, then 3 weekly reminders and a 7-day notice) · **On a date** (reminders 30/7/1 days before, release on the date) · **Whichever comes first** (both) |
| Depends on | Date triggers need S-SUCC-003; test mode forces inactivity |
| Persists | Yes — server |
| Stored in | `LegacyPlan.triggerMode` |
| Backend effect | Drives the daily state machine (F-SUCC-006) |
| Who can change | R-PLUS and above, while Off/On/Paused, with step-up |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:126`, `packages/api/src/services/legacy/stateMachine.ts:63` |

### Inactive for (days) <!-- S-SUCC-002 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **When to share** → **Inactive for (days, at least 30)** |
| Purpose | Days without activity before the first reminder |
| Default | 90 (`packages/shared/src/legacy.ts:12`) |
| Values | 30–3,650 |
| Depends on | Hidden for **On a date** and in test mode |
| Persists | Yes — server |
| Stored in | `LegacyPlan.inactivityDays` |
| Backend effect | Changing it on an armed plan restarts the clock from now |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:147`, `packages/api/src/schemas/legacy.schemas.ts:8`, `packages/api/src/services/legacy/plan.service.ts:112` |

### Release date <!-- S-SUCC-003 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **When to share** → **Release date** |
| Purpose | Scheduled release date |
| Default | Empty |
| Values | A date after today (IST) |
| Depends on | Shown for **On a date** / **Whichever comes first** |
| Persists | Yes — server |
| Stored in | `LegacyPlan.scheduledFor` |
| Backend effect | Owner reminders 30, 7 and 1 days before; release on the day with no notice stage; dropped if it passes during a pause or before re-arming |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:155`, `packages/api/src/services/legacy/plan.service.ts:42`, `packages/shared/src/legacy.ts:16` |

### Personal letter <!-- S-SUCC-004 -->
| Attribute | Value |
|---|---|
| Control type | Text area |
| Location | **When to share** → **Personal letter (optional)** |
| Purpose | A note shown to nominees who may see "Personal letter" |
| Default | Empty |
| Values | ≤ 20,000 characters |
| Depends on | Shown only to nominees with the Personal letter category |
| Persists | Yes — server, encrypted |
| Stored in | `LegacyPlan.letterEnc` |
| Backend effect | Included in the nominee view and PDF |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:160`, `packages/api/src/services/legacy/plan.service.ts:111` |

### Test mode: 1 minute (admins only) <!-- S-SUCC-005 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **When to share** (admins only) |
| Purpose | 1-minute inactivity and stages for testing |
| Default | Off (`packages/api/src/schemas/legacy.schemas.ts:14`) |
| Values | On: release in about 5 minutes · Off: normal days |
| Depends on | Requires the inactivity trigger |
| Persists | Yes — server |
| Stored in | `LegacyPlan.testMode` |
| Backend effect | Per-minute cron advances the plan |
| Who can change | R-ADMIN |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:132`, `packages/api/src/services/legacy/plan.service.ts:91` |

## Succession → Status

### Pause until <!-- S-SUCC-006 -->
| Attribute | Value |
|---|---|
| Control type | Date + **Pause** button |
| Location | **Succession** status card |
| Purpose | Stops the countdown until a date |
| Default | Empty |
| Values | After today, ≤ 180 days ahead |
| Depends on | Shown only while counting |
| Persists | Yes — server |
| Stored in | `LegacyPlan.pausedUntil`, `LegacyPlan.status = PAUSED` |
| Backend effect | Daily tick resumes on the date with a fresh clock; pausing during the notice stage emails nominees |
| Who can change | Plan owner on any plan (step-up required) |
| Sources | `apps/web/src/pages/legacy/LegacyPage.tsx:109`, `packages/api/src/services/legacy/plan.service.ts:231` |

## Succession → Nominee dialog

### What they can see <!-- S-SUCC-007 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Add nominee / Edit nominee** |
| Purpose | Categories released to this nominee |
| Default | Insurance + Bank accounts (`apps/web/src/pages/legacy/NomineeDialog.tsx:13`) |
| Values | Investments, Bank accounts, Insurance, Loans & credit cards, Property, Vehicles, Provident fund & NPS, Documents, Personal letter (≥ 1) |
| Depends on | Documents enables S-SUCC-011 |
| Persists | Yes — server |
| Stored in | `LegacyNominee.categories` |
| Backend effect | Only these categories are loaded for the nominee view |
| Who can change | R-PLUS and above |
| Sources | `packages/shared/src/legacy.ts:5`, `packages/api/src/services/legacy/view.service.ts:44` |

### Show amounts <!-- S-SUCC-008 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | Nominee dialog |
| Purpose | Whether balances and values are shown |
| Default | Off (`apps/web/src/pages/legacy/NomineeDialog.tsx:13`) |
| Values | On: amounts and "Total of listed assets" · Off: "they see only what exists and where" |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `LegacyNominee.showAmounts` |
| Backend effect | With off, no figure is sent at all |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:87`, `packages/api/src/services/legacy/view.service.ts:121` |

### Verifier <!-- S-SUCC-009 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | Nominee dialog |
| Purpose | The one nominee asked to confirm during the 7-day notice |
| Default | Off |
| Values | On: gets "Please confirm: is <owner> OK?" — can release now or reset · Off |
| Depends on | Only one per plan (setting it clears the others) |
| Persists | Yes — server |
| Stored in | `LegacyNominee.isVerifier` |
| Backend effect | Verify link valid 14 days, only during the notice stage |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:91`, `packages/api/src/services/legacy/runner.service.ts:65`, `packages/api/src/services/legacy/plan.service.ts:163` |

### Priority <!-- S-SUCC-010 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | Nominee dialog |
| Purpose | Ordering of nominees |
| Default | 1 |
| Values | 1–20 |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `LegacyNominee.priority` |
| Backend effect | Nominees are listed and emailed in ascending priority; no other effect found |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:52`, `packages/api/src/services/legacy/runner.service.ts:22` |

### Documents to share <!-- S-SUCC-011 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | Nominee dialog (when Documents is ticked) |
| Purpose | Vault documents the nominee may download |
| Default | None |
| Values | ≤ 50 of your own documents; replaced wills only shown if already shared |
| Depends on | S-SUCC-007 includes Documents |
| Persists | Yes — server |
| Stored in | `LegacyNominee.documentIds` |
| Backend effect | Unknown or non-owned ids are dropped |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/legacy/NomineeDialog.tsx:67`, `packages/api/src/services/legacy/plan.service.ts:124` |

## Will Maker → Your details

### Country whose law applies <!-- S-WILL-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will wizard step 2 |
| Purpose | Jurisdiction of the will |
| Default | India (`apps/web/src/pages/will/steps/DetailsStep.tsx:57`) |
| Values | India · Another country (blocks generation) |
| Depends on | — |
| Persists | Yes — server, encrypted draft |
| Stored in | Will payload `details.jurisdiction` |
| Backend effect | JURISDICTION_INDIA_ONLY blocker |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/DetailsStep.tsx:56`, `packages/shared/src/will/validation/rules.ts:54` |

### Religion / personal law <!-- S-WILL-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will wizard step 2 |
| Purpose | Decides which succession law applies |
| Default | Not chosen |
| Values | Hindu, Sikh, Jain, Buddhist, Christian, Parsi, Muslim (blocks generation), Other / none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `details.personalLaw` |
| Backend effect | MUSLIM_LAW_UNSUPPORTED blocker |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/DetailsStep.tsx:64`, `packages/shared/src/will/validation/rules.ts:58` |

## Will Maker → People, Estate, Allocate

### If they die before you, their gifts go to <!-- S-WILL-006 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will step 3 person form |
| Purpose | Back-up beneficiary per person |
| Default | "Shared among the others (default)" |
| Values | Default · any other person |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `people[].contingentId` |
| Backend effect | CONTINGENT_IS_SELF blocker |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/PersonForm.tsx:60`, `packages/shared/src/will/validation/rules.ts:122` |

### Ownership <!-- S-WILL-004 -->
| Attribute | Value |
|---|---|
| Control type | Select + percentage |
| Location | Will step 4 item rows |
| Purpose | How you own an item |
| Default | From the data; Joint sets 50%, others 100% |
| Values | **Sole**, **Joint** (your %), **Nominee only** (not counted; can't be gifted), **HUF** (your %) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `estate.items[].ownership` |
| Backend effect | Only your share counts; warnings JOINT_OWNERSHIP_ONLY_SHARE, HUF_COPARCENARY_SHARE |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/EstateStep.tsx:59`, `packages/shared/src/will/validation/rules.ts:175` |

### Include / Exclude <!-- S-WILL-005 -->
| Attribute | Value |
|---|---|
| Control type | Buttons |
| Location | Will step 4 item rows |
| Purpose | Whether an item is part of the will's estate |
| Default | Fetched items start as **Needs review**; manual items **Confirmed** |
| Values | Confirmed · Needs review · Excluded · Not found on refresh |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `estate.items[].review` |
| Backend effect | Excluded items can't receive gifts (blocker) |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/EstateStep.tsx:89`, `packages/shared/src/will/validation/rules.ts:222` |

### How long must someone outlive you to inherit? <!-- S-WILL-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Will step 5 |
| Purpose | Survival period before a beneficiary inherits |
| Default | 30 days (`packages/shared/src/will/schema.ts:131`) |
| Values | No waiting period, 7, 15, 30, 60, 90 days |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Will payload `allocation.survivalDays` |
| Backend effect | Printed in the will |
| Who can change | R-PLUS and above |
| Sources | `apps/web/src/pages/will/steps/AllocationStep.tsx:242`, `packages/shared/src/will/schema.ts:42` |

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
| localStorage or sessionStorage `everypaisa.auth` | Access token, refresh token, access-token expiry (no profile) | Every sign-in and token refresh | Every refresh (2 minutes before expiry) | The profile is not stored; it is re-read from the server on reload |
| localStorage `everypaisa.auth.remember` | Whether the session is remembered | Each sign-in | Each sign-in | No |
| localStorage `everypaisa.onboarding.inProgress.<userId>` | "1" while that account's setup is unfinished | Opening the setup wizard | Removed on finish or skip | Per browser: another device does not know |
| localStorage `onboarding_v2_done` | "1" once this browser has finished setup or seen an account with a portfolio | Finishing setup; dashboard with a portfolio | Never cleared | Shared by every account on the browser |
| React Query cache `['desktop-app','downloads']` | Latest desktop installer links from GitHub | Settings or header first load | After 1 hour | Up to 1 hour |
| localStorage `sidebar_collapsed` | Sidebar folded or not | Collapse/expand clicked | Never | No |
| localStorage `sidebar_planning_open` | Planning group open ("1") or folded ("0") | Planning heading clicked | Never | No |
| localStorage `everypaisa.sidebar.assetSort` | "manual" or "value" | By value / My order clicked | Never | No |
| localStorage `everypaisa.theme` | Dark or light | Theme toggled | Never | No |
| localStorage `everypaisa.privacy` | Hide values on/off | Hide/Show values clicked | Never | No |
| localStorage `assistant_expanded` | Assistant big window ("1") | Expand/shrink clicked | Never | No |
| sessionStorage `everypaisa.ai-teaser-seen.v2` | Teaser dismissed ("1") | Teaser × clicked, or after 6 s on phones | Cleared when the tab closes | No |
| localStorage `everypaisa.dismissedUpgradeBanner.<userId>` | Free banner dismissed ("1") | Banner × clicked | Never | Yes — stays after upgrading and downgrading again |
| In-memory query cache | Server data (portfolios, dashboard, holdings, transactions, alerts) | On each fetch | Considered fresh for 30 s; refetched on page visit after that; alerts badge every 5 min; FX strip every 30 s; Gmail scan every 3 s while running | Yes — some screens are not refreshed after a transaction is saved (see DOCUMENTATION_GAPS.md) |
| localStorage `gmail-auto-connect-dismissed` | `1` when the Gmail banner was dismissed | On dismiss | Never cleared by the app | Yes — stays dismissed on this browser even after disconnecting Gmail |
| React Query `imports` (memory) | Import history | On page load; every 2 s while a job is Pending/Processing; after upload, delete, reprocess, scan | **Refresh** button | Yes — no polling once all jobs are final |
| React Query `mailboxes` (memory) | Connected email accounts (shared by ingestion page, banner, scan shortcut; banner keeps it 60 s) | On load | After Gmail callback; **Refresh** | Yes — not refreshed after **Disconnect** |
| React Query `monitored-senders`, `canonical-events` (memory) | Senders and events | On load | After approve/reject/enable/remove; **Refresh** | Yes — new polled events appear only after a refresh or remount |
| React Query `doc-sorter/tree` (memory) | Documents folder tree | On load | Every 3 s while a file is being read; after each change | Briefly |
| Documents progress list (component state) | Last 12 uploads and their status | On upload | — | Lost when leaving the page |
| React Query cache `mf-analytics` keys (in memory, not persisted) | Portfolio analysis, fund analytics, findings, verdicts, methodology | On page load | Analysis/fund data on focus/remount; methodology after 1 hour; whole namespace after **Refresh analysis** | Yes — methodology up to 1 hour; cache entries are separated per family view |
| React Query cache `portfolio-holdings`, `transactions`, `imports` (in memory) | Holdings and imports on the Mutual Funds page | On page load | After imports finish, deletes, AMFI sync | Finvu import does not refresh these keys (page reload needed) |
| everypaisa.goldTicker.karat | Gold purity chosen in the Gold & Silver rate bar | Purity picked | Never (until changed) | No — preference only; ignored if not a valid option |
| everypaisa.goldTicker.silverPurity | Silver purity chosen in the rate bar | Purity picked | Never (until changed) | No — preference only |
| Detail-page navigation state (Gold, Crypto, Post Office, FD) | The holding row handed from the list to its detail page (in browser history, not storage) | Clicking a list row | Not refreshed | Yes — Gold, Crypto and Post Office detail figures stay as they were when opened until you reopen from the list; a refresh or direct link loses it (FD looks the holding up instead) |
| Page address `/emi?v=1&tab=…&s=…&c=…` | Entire EMI Calculator state (Calculate and Compare inputs, current tab), base64url JSON | 0.4 s after each change (replaces the history entry) | On every change | No — it is the state; an old or edited link falls back to defaults with a message |
| React Query cache `loans`, `loan`, `loan-summary`, `loan-amortization`, `loan-market-check`, `loans-given` (in memory) | Loans, summaries, schedules, market checks | On page load | After saves on these pages; otherwise after 30 s when a page remounts | Yes — up to 30 s (for example a card edit on the list does not refresh an open loan page's cache) |
| React Query cache `credit-cards`, `credit-card`, `credit-card-summary` (in memory) | Cards and statements | On page load | Statement changes refresh only the card page caches | Yes — the Credit Cards list can show old outstanding/due figures for up to 30 s after a statement change |
| React Query cache `loan-rates` (in memory) | Live rates per loan type | On tab load | After 10 minutes | Yes — up to 10 minutes |
| Revealed card number (component state only) | Full card number after **Show card number** | On reveal | Cleared when the card changes or the page unmounts | No — never cached or persisted |
| `vehicles_view_mode` (localStorage) | Vehicles list grouping: individual or family | Clicking **Individual**/**Family** | Each click | No server data — per device only |
| `everypaisa.listView.real-estate` (localStorage) | Real Estate list view: grid or map | Clicking **Grid**/**Map** | Each click | Per device only |
| `everypaisa.listView.rental` (localStorage) | Rental list view: grid or map | Clicking **Grid**/**Map** | Each click | Per device only |
| localStorage `insurance.taxSummary.open` | Whether **Tax on your premiums** is open ("1"/"0") | On fold/unfold | — | No — it is a preference; missing storage means folded |
| React Query cache `insurance-policies`, `insurance-policy`, `insurance-documents`, `insurance-gmail-fetch`, `insurance-tax-summary` (memory) | Policies, documents, Gmail status, tax summary | On page load | After saves in these pages; Gmail status every 5 s while a search runs; otherwise after 30 s on remount | Yes — up to 30 s |
| React Query cache `forex ticker` (memory) | FX rates | On load | Every 30 s | Up to 30 s |
| React Query cache `voucher-next-no` (memory) | Suggested voucher number | When **New Voucher** first renders for a type | Not after a save (defect) | Yes — repeats the same number |
| React Query cache `pf-accounts`, `goals`, `income`, `cashflows`, accounting keys (memory) | Lists | On load | After saves; otherwise 30 s | Up to 30 s |
| Revealed policy number (component state) | Full policy number | On reveal | Cleared when the policy changes or the page unmounts | No |
| localStorage `analytics_insights_collapsed` | `1` while the AI Insights panel is folded | On fold/unfold | — | No (absent = open; storage errors fall back to open) |
| React Query cache `report-*` keys (memory) | Reports tab data per portfolio/FY | On tab open | On remount/focus; all `report-*` keys after **Fix now** | Yes until refetch |
| React Query cache `report-data-quality` (memory) | Data checks result | On page open | After 60 seconds | Up to 60 seconds |
| React Query cache `analytics` keys (memory) | Snapshot (5 min), risk (15 min), insights (~23 h), deterministic insights (5 min), spend (60 s) | On page open | After those times | Yes, for those times |
| React Query cache `tax-*` keys (memory) | Tax page data; available FYs 60 s (Tax page) / 1 h (Analytics) | On tab open | FMV save invalidates grandfathering, summary, 112A | FMV revert does not refresh the Schedule 112A tab |
| React Query cache `intelligence/health-score` (memory) | Health score | On page open | After **Recalculate** | Server-side snapshot reused for 24 h |
| React Query cache `['advisor','llm-status']` | Whether AI narration is available | Advisor page load | After 5 minutes | Yes, up to 5 minutes after the operator changes the switch |
| React Query cache `['ca','clients']`, `['ca','clients','count']` | Professional's client list / count (sidebar) | Client books / any page with the sidebar | Every 5 s (workspace pages) / 30 s (sidebar) while visible, and on focus | Briefly; access changes made by a client appear within those intervals |
| UPI pay link (`['split','upi-link',…]`) | Payee's UPI link | Pay dialog open | Never cached (cache time 0) | No |
| localStorage `everypaisa.familyScope` | Selected family view id and name | Switch view, **View this family across the app**, accept invitation (cleared) | On every change; cleared on sign-out/account switch/entering or leaving a managed account | Yes — a removed member keeps the stale id until switching to Personal view (server then refuses with 403) |
| sessionStorage `everypaisa.actingAs` | Managed profile id, name and the manager's id | Entering a managed account | Cleared by **Back to my account**, tab close, or another account signing in | Yes — if keeper access ends, data requests fail with "You cannot act for this profile." |
| localStorage `sidebar_families_expanded` | Expanded family ids in the sidebar | Chevron toggle | On toggle | No |
| sessionStorage `legacy.session.<first 12 chars of link>` | Nominee view session token | After a correct one-time code | Session expires after 30 minutes server-side | Yes — expired sessions are dropped on the next load |
| In-memory Succession step-up grant | 15-minute grant (14 minutes client-side) | After **Confirm** | Lost on reload | No |

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
| JWT_SECRET | Signs access tokens; keys signup, reset, deletion and backup-code hashes | Server refuses to start (minimum 32 characters) |
| JWT_ACCESS_EXPIRY | Access-token lifetime | Defaults to 15m |
| JWT_REFRESH_EXPIRY | Refresh-token lifetime | Defaults to 30d |
| GOOGLE_OAUTH_CLIENT_ID | Server-side check of Google sign-in tokens | Google sign-in answers "Google sign-in is not configured. Set GOOGLE_OAUTH_CLIENT_ID on the server." |
| VITE_GOOGLE_CLIENT_ID | Web build: renders the Google button | Button replaced by "Google sign-in unavailable (admin: set VITE_GOOGLE_CLIENT_ID)." |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE | Mail for signup, reset, deletion codes, 2FA and security notices, professional invitation emails | Production signup/deletion code requests fail with "We could not send…"; in development the code is written to the server log |
| RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET | Plan checkout | Upgrade shows "Payments are coming soon. No checkout session was created." |
| MCP_ENABLED, API_PUBLIC_URL | Turns on /mcp, /oauth, /.well-known and /api/connect | All of them answer 404 "Not found"; the AI connectors page cannot load connections |
| MCP_REDIRECT_URI_ALLOWLIST | Chatbot callback URLs allowed to register | Defaults to the ChatGPT and Claude callbacks |
| VITE_API_PUBLIC_URL | Web build: connector address shown on AI connectors | Falls back to the web page's own origin |
| FRONTEND_URL | Links in emails, OAuth redirect to /connect/authorize | Defaults to localhost |
| ENABLE_FAMILY | Mounts /api/me/professional-access and /api/ca | Account Access cannot load or invite |
| FINFACTOR_API_TOKEN, FINFACTOR_DEMO_MODE | Account Aggregator consent | Card shows "Token missing" and the connect button is disabled |
| FINFACTOR_WEBHOOK_SECRET | Verifies Finvu webhooks | Webhooks rejected outside development |
| ENABLE_ACCOUNT_PURGE_CRON | Daily 03:30 IST purge of accounts past their deletion date | Set to "false" disables the purge |
| ENABLE_SECURITY_SCAN, SECURITY_ALERT_EMAIL | 15-minute scan for credential stuffing and export/PII spikes; where to email findings | "false" disables the scan; without the email address findings are only logged and audited |
| APP_ENCRYPTION_KEY, APP_ENCRYPTION_KEY_PREVIOUS | Column encryption of PAN and other identifiers; boot-time key rotation while the previous key is set | Rotation does not run |
| SECRETS_KEY, SECRETS_KEY_PREVIOUS, ENABLE_SECRET_ROTATION | Encryption of 2FA secrets, broker credentials, invitation tokens; boot-time re-encryption | Rotation does not run |
| ENABLE_PII_BACKFILL, PII_BACKFILL_CLEAR_PLAINTEXT | Boot-time encryption of old plaintext identifiers | "false" disables it |
| ENABLE_STARTUP_SYNC | Boot-time refresh of shared price data | "false" disables it |
| REDIS_URL | Shared rate-limit counters | Limits count per server process |
| NODE_ENV | In non-production, unsent verification/reset/deletion codes are logged instead of failing | — |
| `ENABLE_PRICE_CRONS` | Set to `false` to stop all scheduled price feeds (F-PORT-008) and the corporate-action application (F-PORT-009) | Feeds run |
| `ENABLE_COST_SIZE_REFRESH` | Set to `false` to stop the daily AMFI expense-ratio and fund-size refresh | Runs (default `true`) |
| `ENABLE_ALERT_CRONS` | Set to `false` to stop the daily 20:45 IST alert scan (F-ALERT-005) | Scan runs |
| `ENABLE_NET_WORTH_SNAPSHOT_CRON` | Set to `false` to stop the daily 23:45 IST net-worth snapshot (F-DASH-018) | Snapshot runs |
| `ANTHROPIC_API_KEY` | Purpose: credential for the AI Assistant's model provider | Every `/api/assistant` endpoint answers 404 `ai_assistant_disabled` |
| `ENABLE_LLM_INSIGHTS` | Must be `true` (with the key) to turn the AI Assistant on | Defaults to `false` — assistant disabled |
| `LLM_ASSISTANT_MODEL` | Model name for the assistant; the database setting `llm.assistant_model` overrides it | Built-in default model name |
| `APP_ENCRYPTION_KEY` | Purpose: key used to encrypt full bank account numbers (also `APP_ENCRYPTION_KEY_PREVIOUS` during rotation) | Encryption/decryption of account numbers fails |
| `MAX_UPLOAD_SIZE_MB` | Upload size limit for imports (Documents uses the lower of this and 25) | 50 MB |
| `UPLOAD_DIR` | Where uploaded and emailed files are written before processing | `./uploads` |
| `REDIS_URL` | Bull queues `imports`, `gmail-scan`, `doc-sort` | Jobs cannot be queued; imports stay Pending until restart |
| `ENABLE_IMPORT_WORKER` | `false` disables the import worker | Enabled |
| `ENABLE_MAILBOX_POLLER` | `false` stops all mailbox polling (Gmail events, Gmail attachments, IMAP) | Enabled (`true`) |
| `MAILBOX_POLL_INTERVAL_MIN` | Minutes between polls | 3 (the ingestion page text says 10) |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URL` | Purpose: Google sign-in for Gmail (secret is a credential) | Gmail connect fails; banner hidden |
| `ENABLE_LLM_PARSER` | Must be `true` in production for any AI parsing call | Default `false`: AI gate closed in production |
| `LLM_MODEL` | Model for email parsing | `claude-haiku-4-5-20251001` |
| `ANTHROPIC_ZERO_RETENTION_CONFIRMED` | Advisory flag logged at start | `false` |
| `GEMINI_API_KEY` | Purpose: credential for the Gemini AI fallback of the CAMS/KFintech CAS parser | Fallback skipped |
| `ENABLE_DATA_INTEGRITY_CRON` | `false` disables the 02:15 IST job that also runs ingestion recovery | Enabled |
| `NODE_ENV` | `production` hides unmapped error text ("Internal server error") and requires `ENABLE_LLM_PARSER` | — |
| AppSetting `llm.monthly_warn_inr`, `llm.monthly_cap_inr` (+ `.user.<id>` overrides), `llm.usd_inr_fx` | Monthly AI budget per user and FX rate | ₹500 warn, ₹1,000 cap, ₹90/USD |
| `CASPARSER_API_KEY` | Purpose: credential for casparser.in (KFintech mailback, CDSL OTP, credits) | Requests fail; users see "Internal server error" in production |
| `CASPARSER_BASE_URL` | casparser.in API base | Defaults to the public casparser.in API |
| `CAMS_MAILBACK_URL` / `KFIN_MAILBACK_URL` | Portal form URLs for the CAMS / KFintech mailback | Defaults to the public portal pages |
| `MFMAILBACK_FIXTURE_MODE` | `1` runs the portal mailback against fixtures | Real portals used |
| `FINFACTOR_API_TOKEN` | Purpose: Finfactor Wealthscape credential | Finvu card shows **Token missing** and disables buttons (unless demo mode) |
| `FINFACTOR_DEMO_MODE` | `true`/`1`/`yes` returns built-in sample payloads | Real Finfactor calls |
| `FINFACTOR_BASE_URL` | Finfactor API base | Built-in default URL |
| `RIA_VERDICTS_ENABLED` | `true` shows Switch candidate verdicts and named replacements (requires RIA registration settings) | Switch candidates shown as Review with the "Analysis only" note |
| `ENABLE_MF_ANALYSIS_JOB` | `false` disables the analysis queue start | Enabled |
| `ENABLE_MF_METRICS_CRON`, `ENABLE_MF_PEER_RANK_CRON`, `ENABLE_MF_SCORE_CRON`, `ENABLE_MF_METADATA_CRON`, `ENABLE_MF_NAV_HISTORY_CRON`, `ENABLE_MF_RECONCILIATION_CRON`, `ENABLE_MF_OPS_ALERTS_CRON`, `ENABLE_MF_FACTSHEET_CRON`, `ENABLE_MF_PROSE_JOB` | `false` disables that MF job | Enabled |
| `ENABLE_LLM_ADVISOR_PROSE` | `true` (with an Anthropic key) lets the prose job narrate verdicts | No narration; verdicts unaffected |
| ENABLE_FO_EXPIRY_CRON | Turns the 17:30 IST F&O expiry-close job on or off | Job runs; set to `false` to disable |
| ENABLE_PRICE_CRONS | Turns all price jobs (stocks, commodities, crypto, F&O bhavcopy/live) on or off | Jobs run; `false` disables them and values stop updating |
| ENABLE_ALERT_CRONS | Turns the 20:45 IST daily alert scan (deposit, Post Office maturity alerts) on or off | Scan runs; `false` disables it |
| MAX_UPLOAD_SIZE_MB | Maximum size of an entry photo upload | 50 MB |
| `ENABLE_LOAN_RATES_CRON` | `false` disables the 07:30 IST rate refresh and the loan checks that follow it | Enabled |
| `PII_BACKFILL_CLEAR_PLAINTEXT` | `true` clears legacy plaintext loan account numbers during the PII backfill | Legacy plaintext kept |
| `ENABLE_VEHICLE_CRONS` | Turns the daily RC refresh and monthly challan scan on/off | Jobs run (only the value "false" disables) |
| `ENABLE_RENTAL_CRONS` | Turns the 01:00 overdue job and 09:00 reminder scan on/off | Jobs run |
| `ENABLE_CATALOG_CRONS` | Monthly vehicle catalogue crawl (5th, 04:00 IST) | Job runs |
| `ENABLE_PARIVAHAN_PORTAL_ADAPTER` | Allows the Parivahan portal source in production | Portal source disabled in production (always allowed outside production) |
| `USE_PORTAL_BROWSER` | Drive a real headed browser for the portal source | Portal source reads a fixture file |
| `PARIVAHAN_PORTAL_FIXTURE_PATH` | Fixture file for the portal source (development) | Portal source fails with "live driver not yet wired" |
| `ENABLE_CHALLAN_ADAPTER` | Allows the headed-browser challan source in production | Browser challan source skipped in production |
| `USE_CHALLAN_BROWSER` | Drive a real browser for challans | Not used |
| `CHALLAN_FIXTURE_PATH` | Fixture file for challans (development) | Fixture step fails and is skipped |
| `MPARIVAHAN_FIXTURE_PATH` | Fixture file for the mParivahan source | A built-in development fixture path is used if that file exists |
| `VAHAN_DEBUG`, `CARINFO_DEBUG` | Extra debug logging of scraper responses | Off |
| `CARINFO_DEBUG_DUMPS`, `CARINFO_DEBUG_DIR` | Save CarInfo page dumps (contain owner PII) and where | Off |
| `NOMINATIM_USER_AGENT` | Identifying User-Agent for OpenStreetMap address lookups | A built-in EveryPaisa user agent |
| `NOMINATIM_MIN_INTERVAL_MS` | Minimum gap between address lookups | 1100 ms |
| `LANDLORD_BRAND_NAME` | Fallback landlord signature in reminder templates | "Your landlord" |
| `RENT_PAYMENT_INSTRUCTIONS` | Fallback payment instructions in reminder templates | Empty |
| `SMS_PROVIDER` | SMS provider for rent reminders (`twilio` or `none`) | `none` — SMS fails with "sms_not_configured" |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Purpose: Twilio account and sender for SMS | SMS fails with "twilio_credentials_missing" when provider is twilio |
| `ENABLE_INSURANCE_CRONS` | `false` disables the 05:30 IST insurance Gmail search and the startup policy-number encryption | Enabled |
| `ANTHROPIC_API_KEY`, `ENABLE_LLM_PARSER`, `LLM_MODEL` | Purpose: model access for reading insurance documents | Documents stay "Not read yet." |
| `ENABLE_PF_NUDGE_CRON` | `false` disables the daily PF refresh-due alert | Enabled |
| `ENABLE_PF_WORKER` | `false` disables the PF portal fetch worker | Enabled |
| `ENABLE_STARTUP_SYNC` | Startup refresh of stale feeds including FX older than 6 hours | See B10 |
| `LLM_INSIGHTS_MODEL` | Model for AI Insights (AppSetting `llm.insights_model` overrides) | Default `claude-sonnet-4-6` |
| AppSetting `llm.monthly_warn_inr` / `llm.monthly_cap_inr` (and `.user.<id>` variants) | Monthly AI spend warning and cap per user | ₹500 / ₹1,000 |
| AppSetting `llm.usd_inr_fx` | USD→INR rate for AI cost accounting | 90 |
| ENABLE_LLM_ADVISOR_PROSE | Turns on AI narration of recommendations (also needs ANTHROPIC_API_KEY) | Default `false`: **Explain in plain English** is hidden |
| ANTHROPIC_API_KEY | Credential for the AI model used by narration | Narration disabled |
| LLM_ADVISOR_MODEL | Default model for narration (overridable by app setting `llm.advisor_model`) | Default `claude-sonnet-4-6` |
| RIA_VERDICTS_ENABLED | Allows recommendations to name funds from the signed house methodology; requires RIA_PRINCIPAL_OFFICER and RIA_REGISTRATION_NUMBER | Default `false`: category-level or NAV-ranked products only |
| SMTP_HOST, SMTP_USER, SMTP_PASS | Sending invitation, reminder, invite and digest emails | Invitation **Send email** disabled ("copy the link"); split emails not sent |
| `ENABLE_FAMILY` | Mounts `/api/families` and `/api/managed-profiles` | Default `true`; when `false` the family APIs are absent |
| `ENABLE_LEGACY_CRON` | Starts the Succession jobs (daily 10:00 IST tick, hourly :20 outbox retry, per-minute test tick) | Jobs run unless set to `false` |
| `RAZORPAY_KEY_ID` | Purpose: public key for the extra-seat checkout (with the Razorpay secret configured for billing) | Seat payments refused with "… Payments are not configured on this server." |
| `FRONTEND_URL` | Base of links in Succession and invitation emails | Defaults to `http://localhost:3000` |
