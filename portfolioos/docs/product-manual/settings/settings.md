[Index](../INDEX.md)

# Settings — Settings

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-set-001"></a>
### Two-factor sign-in
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
| Backend effect | Turning on also returns a new session marked "signed in with a second factor", which the professional workspace ([R-PROF](../roles.md#r-prof)) and admin tools ([R-ADMIN](../roles.md#r-admin)) require. Emails "Two-factor sign-in turned on/off" are sent. Audit log rows `two_factor_enabled` / `two_factor_disabled` / `two_factor_codes_regenerated`. |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (own account only) |
| Sources | `apps/web/src/pages/settings/TwoFactorSection.tsx:86`, `packages/api/src/services/auth/twoFactor.service.ts:102`, `packages/api/src/services/auth/twoFactor.service.ts:158`, `packages/api/src/controllers/auth.controller.ts:322` |

<a id="s-set-003"></a>
### Gmail connection for email notifications
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/pages/settings/NotificationsSection.tsx:29`, `packages/api/src/services/notifications/config.service.ts:226` |

<a id="s-set-002"></a>
### Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed profile |
| Sources | `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:53`, `packages/api/src/controllers/alertPrefs.controller.ts:7`, `packages/api/src/services/notifications/alertPrefs.service.ts:14` |

<a id="s-set-004"></a>
### What they can do
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
| Who can change | The account holder ([R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)) only; never the professional |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:42`, `apps/web/src/components/ca/GrantScopePanel.tsx:174`, `packages/api/src/controllers/ca.controller.ts:128` |

<a id="s-set-005"></a>
### Portfolios
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

<a id="s-set-006"></a>
### Categories
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

<a id="s-set-007"></a>
### Asset classes
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

<a id="s-set-008"></a>
### When (From / Until)
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
| Backend effect | Enforced in the database for every professional request (see global roles [R-PROF](../roles.md#r-prof)) |
| Who can change | Account holder |
| Sources | `apps/web/src/components/ca/GrantScopePanel.tsx:300`, `packages/api/src/services/ca/caAccess.service.ts:728` |

<a id="s-set-009"></a>
### Rate override (Set rate)
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
| Who can change | [R-ADMIN](../roles.md#r-admin) |
| Sources | `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:97`, `packages/api/src/controllers/loanRates.controller.ts:20` |
