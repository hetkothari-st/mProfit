# Settings and Toggles Reference — Account & access (B06 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Sign-in & session, First-run setup, Settings & Account Access, Connections, Plans & billing, Legal pages

<!-- BEGIN SETTINGS -->
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
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| localStorage or sessionStorage `everypaisa.auth` | Access token, refresh token, access-token expiry (no profile) | Every sign-in and token refresh | Every refresh (2 minutes before expiry) | The profile is not stored; it is re-read from the server on reload |
| localStorage `everypaisa.auth.remember` | Whether the session is remembered | Each sign-in | Each sign-in | No |
| localStorage `everypaisa.onboarding.inProgress.<userId>` | "1" while that account's setup is unfinished | Opening the setup wizard | Removed on finish or skip | Per browser: another device does not know |
| localStorage `onboarding_v2_done` | "1" once this browser has finished setup or seen an account with a portfolio | Finishing setup; dashboard with a portfolio | Never cleared | Shared by every account on the browser |
| React Query cache `['desktop-app','downloads']` | Latest desktop installer links from GitHub | Settings or header first load | After 1 hour | Up to 1 hour |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
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
<!-- END OPERATOR-CONFIG -->
