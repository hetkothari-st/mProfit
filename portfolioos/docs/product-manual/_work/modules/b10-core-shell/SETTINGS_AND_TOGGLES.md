# Settings and Toggles Reference — B10 core shell

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): App layout and navigation, AI Assistant, Dashboard, Portfolios, Transactions, Bank Accounts, Alerts & Reminders (batch B10)

<!-- BEGIN SETTINGS -->
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
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| localStorage `sidebar_collapsed` | Sidebar folded or not | Collapse/expand clicked | Never | No |
| localStorage `sidebar_planning_open` | Planning group open ("1") or folded ("0") | Planning heading clicked | Never | No |
| localStorage `everypaisa.sidebar.assetSort` | "manual" or "value" | By value / My order clicked | Never | No |
| localStorage `everypaisa.theme` | Dark or light | Theme toggled | Never | No |
| localStorage `everypaisa.privacy` | Hide values on/off | Hide/Show values clicked | Never | No |
| localStorage `assistant_expanded` | Assistant big window ("1") | Expand/shrink clicked | Never | No |
| sessionStorage `everypaisa.ai-teaser-seen.v2` | Teaser dismissed ("1") | Teaser × clicked, or after 6 s on phones | Cleared when the tab closes | No |
| localStorage `everypaisa.dismissedUpgradeBanner.<userId>` | Free banner dismissed ("1") | Banner × clicked | Never | Yes — stays after upgrading and downgrading again |
| localStorage `onboarding_v2_done` | This browser finished/does not need setup ("1") | Dashboard loads with at least one portfolio; onboarding completes | Never | Yes — per browser, not per account |
| localStorage `everypaisa.onboarding.inProgress.<userId>` | Account left setup unfinished (read by the Dashboard) | Set by the onboarding wizard | Cleared when setup finishes | Yes — per browser |
| In-memory query cache | Server data (portfolios, dashboard, holdings, transactions, alerts) | On each fetch | Considered fresh for 30 s; refetched on page visit after that; alerts badge every 5 min; FX strip every 30 s; Gmail scan every 3 s while running | Yes — some screens are not refreshed after a transaction is saved (see DOCUMENTATION_GAPS.md) |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `ENABLE_PRICE_CRONS` | Set to `false` to stop all scheduled price feeds (F-PORT-008) and the corporate-action application (F-PORT-009) | Feeds run |
| `ENABLE_COST_SIZE_REFRESH` | Set to `false` to stop the daily AMFI expense-ratio and fund-size refresh | Runs (default `true`) |
| `ENABLE_ALERT_CRONS` | Set to `false` to stop the daily 20:45 IST alert scan (F-ALERT-005) | Scan runs |
| `ENABLE_NET_WORTH_SNAPSHOT_CRON` | Set to `false` to stop the daily 23:45 IST net-worth snapshot (F-DASH-018) | Snapshot runs |
| `ANTHROPIC_API_KEY` | Purpose: credential for the AI Assistant's model provider | Every `/api/assistant` endpoint answers 404 `ai_assistant_disabled` |
| `ENABLE_LLM_INSIGHTS` | Must be `true` (with the key) to turn the AI Assistant on | Defaults to `false` — assistant disabled |
| `LLM_ASSISTANT_MODEL` | Model name for the assistant; the database setting `llm.assistant_model` overrides it | Built-in default model name |
| `APP_ENCRYPTION_KEY` | Purpose: key used to encrypt full bank account numbers (also `APP_ENCRYPTION_KEY_PREVIOUS` during rotation) | Encryption/decryption of account numbers fails |
<!-- END OPERATOR-CONFIG -->
