# Documentation Gaps

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

## Verification limitations

- The whole manual was produced from source code only; no screen was viewed in a running app.
- Releases after the source commit fixed many of the defects listed below. The manual's "Changed since this manual was written" chapter lists every change by release.

## Unverified claims

### b06-account-access

| F-CONN-006 | Exact data returned by each of the 23 MCP tools | Field lists and masking per tool were not traced one by one; only the tool list, area gating, 10-second timeout, masking layer and audit were read | Size of `packages/api/src/services/mcp/tools/*` and no live chatbot | Review each tool file against the area descriptions in `packages/shared/src/aiConnector.ts:13` |
| F-CONN-009 | Finvu consent round trip | Whether Finvu returns a redirect URL, which statuses its webhook sends, and how expiry is reported | Needs the live Finfactor API | Run one consent in a staging environment and record the statuses |
| F-LEGAL-002 | Where `/privacy` is linked from | Probably the browser-extension store listing; no link exists in the web app | External listing not in the repo | Confirm the store listing points here |

### b10-core-shell

| B10-UI | All B10 screens | Visual layout, wrapping and exact on-screen rendering | Run was code-only by brief | Spot-check the Dashboard, Portfolios, Transactions, Bank Accounts, Alerts and the assistant panel in a browser |
| F-AI-003 | Content and quality of assistant answers | What the model actually says, which cards it emits, tool use in practice | Depends on a live model, `ANTHROPIC_API_KEY` and data | Review sample answers in a configured environment |
| F-DASH-009 | Portfolio chart in family view for another member's personal portfolio | Whether today's point drops to ₹0: the live-value overlay query is not wrapped in the member's data context (`packages/api/src/services/holdings/portfolio.service.ts:875`), unlike the replay above it (`packages/api/src/services/holdings/portfolio.service.ts:680`) | Depends on row-level-security policies at runtime | Test the family Dashboard with a peer's personal portfolio; wrap the overlay in `readCtx` if confirmed |
| F-PORT-008 | External price sources | Availability, rate limits and data quality of AMFI, Yahoo, NSE/BSE, CoinGecko, commodity, FX and fuel sources | External services | Monitor feed canary alerts |
| F-BANK-002 | IFSC lookup | Coverage and accuracy of Razorpay's public IFSC service | External service | None needed unless users report wrong branches |

### b07-data-in

| F-INGEST-008 | Whether email-text parsing runs in production | `ENABLE_LLM_PARSER` and `ANTHROPIC_API_KEY` values on the host; with the default (`false`) every monitored email becomes a hidden failure record and no events appear | Deployment config not readable from the repo | Check the host's environment |
| F-MAIL-006 | Actual poll interval | `MAILBOX_POLL_INTERVAL_MIN` on the host (default 3; page text says 10) | Deployment config | Check env; align the page text |
| F-IMPORT-008 | Whether the AI contract-note parser and the Gemini CAS fallback are active | Depends on `ANTHROPIC_API_KEY`/`ENABLE_LLM_PARSER` and `GEMINI_API_KEY` | Deployment config | Check env |
| F-MAIL-004 | Classifier availability and accuracy | Whether inbox-scan documents are classified or all left for manual review | Needs live AI and Gmail | Run a scan on a test account |
| F-DOCS-002 | OCR and AI-fallback quality | How often real documents are filed correctly vs left for review | Needs real documents and a running worker | Test with sample documents |
| F-MAIL-001 | Gmail "send" permission consent screen | How Google's consent screen presents the two permissions | Needs a live OAuth flow | Review the consent screen |

### b02-mutual-funds

| F-MF-009 | Finvu sandbox behaviour against live Finfactor | Shape of real (non-demo) responses rendered by the views | Needs a live token | Test with a real sandbox token |
| F-MF-010 | Finvu import for a second account using the same identifier | Whether the global `Transaction.sourceHash` unique index makes the second import fail (409 "Duplicate value for unique …") since `findUnique` under RLS cannot see the other user's row | Needs a database run with RLS | Run the import twice from two accounts on a dev DB |
| F-MF-021 | Narrative (prose) on verdicts | Whether narration is enabled in production | Depends on `ENABLE_LLM_ADVISOR_PROSE` and an Anthropic key | Check deployment env |
| F-MF-023 | Research job health | Whether each scheduled MF job runs successfully and covers the full scheme universe in production | Runtime only | Check job logs / ops alert emails |
| F-MF-003 | PDF password auto-try ("We auto-try your PAN, email & phone from Settings") | Which passwords the import pipeline tries | Owned by B07, not traced here | B07 to confirm |

### b01-asset-classes

| F-FNO-006 | Live F&O prices | Whether NSE quote-derivative responds from the production host; the UI text itself suspects IP blocking ("host may be IP-blocked") | Needs a live NSE call from the deployed server | Check API logs for `missedKeys` / `sampleHits` during market hours |
| F-FNO-008 | Broker connect/login | End-to-end OAuth with Kite and Upstox and Angel inline login | Needs real broker developer credentials | Test with a sandbox/developer account |
| F-FNO-009 | Sync Kite | Shape of real Kite `/trades` responses and lot-size resolution | Needs a live Kite session | Test on a trading day |

### b04-loans-cards

| F-EMI-010 | Which lender/loan-type pairs actually produce readings in production | Page readers may fail or be stale; MANUAL sources depend on administrator entries | Runtime and third-party pages only | Check `/settings/loan-rates` and IngestionFailure rows |
| F-EMI-007 | Live rates content | Which lenders appear for each loan type today | Depends on F-EMI-010 output | Same as above |
| F-LOAN-013 | Refinance / benchmark alerts actually fire | Depends on benchmark rows (repo, MCLR) being recorded and on market rates existing | Runtime only | Check job logs `[cron] loan checks done` |
| D-LOAN-006 | Proof & documents vault behaviour on loans given | Upload limits and storage | Owned by the documents component, not traced here | Documents batch to confirm |

### b05-property-vehicles

| F-VEH-003 | CarInfo OTP add flow in production | Whether the server host can run the Playwright browser, whether CarInfo accepts any mobile or only the RC owner's, and whether the in-memory 10-minute session survives multi-instance deploys | Needs a live run; sessions live in process memory (`packages/api/src/lib/playwrightSessions.ts:61`) | Run the flow on production-like infra |
| F-VEH-003 | Error text when **Get OTP** fails | `initiateCarInfoScrape` throws plain errors that the error handler turns into "Internal server error" in production (`packages/api/src/ingestion/vehicle/carinfoPlaywright.ts:110`, `packages/api/src/middleware/errorHandler.ts:114`) | Depends on which statement fails | Wrap in a domain error with a user message |
| F-VEH-008 | RC source chain success rate | Whether CarInfo, mParivahan and Rahastas currently return data | Third-party, runtime only | Monitor the import-failures queue for "vehicle.chain" rows |
| F-VEH-008 | Built-in mParivahan development fixture in production | The adapter returns fixture data for the plates in `fixtures/dev.json` (MH47BT5950, MH47BT5590, KA01AB1234) whenever that file exists at runtime; the build (`tsc`) does not copy JSON, so it probably does not exist in production, but the Docker image was not inspected | `packages/api/src/ingestion/vehicle/mparivahan.ts:29`, `packages/api/src/ingestion/vehicle/mparivahan.ts:363`, `packages/api/package.json:9` | Gate the fixture on NODE_ENV like the portal adapter |
| F-VEH-009 | Stock photo sources | Which image sources the resolver uses and their licence | Resolver internals not traced | Document the photo source |
| F-VEH-010 | Challan sources | Whether CarInfo challan pages and the echallan REST endpoint still answer | Runtime only | Monitor failures |
| F-VEH-012 | Live valuation sources | Whether CarDekho/CarWale/Cars24 scrapes currently work, i.e. how often quotes are "Estimated" | Runtime only | Monitor "valuation.chain" failures |
| F-VEH-014 | Daily RC refresh effect | Whether the job refreshes vehicles successfully in production | Runtime only | Check job logs |
| F-VEH-015 | Monthly challan scan effect | As above | Runtime only | Check job logs |
| F-REST-002 | Map tiles and address lookups | Whether openstreetmap.org tiles and Nominatim are reachable from users' networks and the server; Nominatim usage-policy compliance at scale | External service | Consider a hosted geocoder/tiles at scale |
| F-REST-011 | Same as F-REST-002 for the single-property card | — | External service | — |
| F-RENT-016 | Reminder delivery | Whether Gmail sending and Twilio SMS work in production; SMS defaults to provider "none" | Live credentials | Verify env and a test send |
| D-REST-003 | Documents on property delete | Whether vault documents of a deleted property/rental are removed | Document vault is another batch's component | Owner of the vault to confirm |

### b11-money-misc

| F-INS-018 | Reading of insurance PDFs | Accuracy of the model's readings and which documents land in **Needs your check** on real PDFs | Needs live model credentials and real documents | Test with a sample of insurer PDFs |
| F-PF-006 | Portal refresh | Whether the EPFO and seven bank scrapers work against today's portals; real status strings shown during progress | Needs live portals, credentials and OTPs | Run a refresh per institution on a test account |
| F-PF-009 | Browser extension | The extension's popup labels ("Pair") and what it scrapes | The extension's code is not in this repository | Document from the extension repo |
| F-ACCT-013 | Tally export contents | Exact ledgers/groups and the README text inside the ZIP; which data issues block the export | Book-building rules (tallyBook) not traced line by line | Generate an export from a test account and review |

### b08-reports-tax

| F-REPORT-014 | Export to Tally rule checks | Which Tally rules can block the export and their messages | Tally builder (`services/accounting/tally/`) owned by B11 not traced | B11 to list the blocking rules |
| F-REPORT-015 | Inbox approve/reject server behaviour | Exactly what approve imports, and what the auto-approve rule matches | Gmail scan backend is B07's | B07 to confirm |
| F-REPORT-016 | Section exports (vehicles, insurance, loans, credit cards, rental, real estate) | Columns of each section file | Per-section payload builders not read in full | Check `packages/api/src/controllers/reports.controller.ts:594` onward |
| F-ANLYT-004 | AI Insights in production | Whether `ENABLE_LLM_INSIGHTS` and an API key are set on the live deployment | Runtime configuration | Check deployment env |

### b09-advice-pro

| F-ADV-005 | Which products recommendations name in production | Whether the house methodology is enabled/signed/fresh, so whether cards say House methodology, Algorithmically ranked or No product named | Depends on `RIA_VERDICTS_ENABLED`, a signed methodology and nightly snapshots | Check the latest `AdvisorRun.namedFundGate` |
| F-ADV-009 | AI narration availability and quality | Whether the switch is on, the model in use, how often narration is rejected by the consistency check | Operator config + live model | Check `/api/advisor/llm-status` and `advisor.prose.*` logs |
| F-ADV-014 | Fund scoring runs and freshness | Whether snapshots are produced nightly | Runtime job | Check `[fundScoring]` logs |

### b03-family-succession

| F-FAM-003 | Seat line for contributors and viewers | `listMyFamilies` calls `seatUsage` in the caller's own security context; the FamilyMember policy shows a non-owner only their own row, so a contributor/viewer probably sees "1 of 3 seats used — 1 member" and no open invitations | Needs a database run with RLS as a non-owner | Run `GET /api/families` as a contributor; if confirmed, compute seats under `runAsSystem` after the membership check (`packages/api/src/services/family/family.service.ts:103`, `packages/api/src/services/family/family.service.ts:771`, `packages/api/prisma/migrations/20260903090000_fix_familymember_policy_recursion/migration.sql:63`) |
| F-WILL-006 | "From your family on EveryPaisa" quick-pick for non-owners | `listWillPeopleSuggestions` reads `FamilyMember` rows of other users without elevated privileges; under the FamilyMember policy a contributor/viewer sees only their own row, so the list is probably empty for them (works for owners) | Needs a database run with RLS | Test as a contributor; if confirmed, read the roster under a bounded system context (`packages/api/src/services/will/will.service.ts:211`) |
| F-SUCC-006 | Production health of the Succession jobs | Whether the daily tick, outbox retries and emails run and deliver in production | Runtime only | Check job logs (`[legacy.cron]`) and outbox rows with attempts ≥ 5 |

## Implementation ambiguities and possible defects

### b06-account-access

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

### b10-core-shell

| F-DASH-011 | Confirmed defect: **View all** on Top holdings links to `/holdings`, which has no route, so it shows "This page doesn't exist". | `apps/web/src/pages/dashboard/DashboardPage.tsx:1061`, `apps/web/src/App.tsx:282` | Point it at `/portfolios` or build a holdings page? |
| F-DASH-010 | Confirmed defect: the pie hides slices by passing every slice key through the asset-class→sidebar map, so the Vehicles slice follows **Others** and the rental Real Estate slice follows **Real Estate** (not **Vehicles** / **Rental**); the trio cards also use `/real-estate` for the rental card. | `apps/web/src/pages/dashboard/DashboardPage.tsx:251`, `apps/web/src/pages/dashboard/DashboardPage.tsx:505`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1430`, compare `apps/web/src/lib/sidebarClassValues.ts:91` | Use the same category mapping as the sidebar values. |
| F-DASH-010 | Confirmed defect (family view): merging members' allocation slices updates `value` and `percent` but keeps the first member's `numericValue`, which the ring chart draws and filters on — ring sizes are wrong while the legend is right. | `packages/api/src/services/analytics/dashboard.service.ts:677`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1015` | Recompute `numericValue` in the merge. |
| F-DASH-005 | Confirmed defect: **Hide values** does not mask the Net worth over time axis or tooltip (the portfolio chart does), nor the bank balance-history axis. | `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:177`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:196`, `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:326`, compare `apps/web/src/pages/dashboard/DashboardPage.tsx:974` | Apply the same `hideSensitive` check. |
| F-ALERT-004 | Confirmed defect: the "Scan complete — N new alerts" toast adds only the vehicle and rent counts; eight other checks' counts are ignored. | `apps/web/src/pages/alerts/AlertsPage.tsx:355`, `packages/api/src/services/notifications/alerts.service.ts:363` | Sum all returned counts. |
| F-AI-003 | Confirmed defect: the assistant's action card renders a CTA button with no click handler. | `apps/web/src/components/ai/PortfolioDataCard.tsx:149` | Wire it to a route or remove it. |
| F-AI-003 | Confirmed defect: while managing a family member's account, chat requests omit `X-Act-As` (sessions are created with it), so the session check fails ("Chat session not found", returned with HTTP 500). | `apps/web/src/api/aiAssistant.api.ts:118`, `apps/web/src/api/client.ts:47`, `packages/api/src/ai/chatSessions.ts:51`, `packages/api/src/routes/aiAssistant.routes.ts:406` | Add the acting header to `streamChat`, or make the assistant an account route. |
| F-AI-001 | Confirmed: the floating assistant button is always rendered, but every `/api/assistant` endpoint returns 404 unless `ANTHROPIC_API_KEY` is set and `ENABLE_LLM_INSIGHTS=true` (default `false`); users then see "Request failed with status code 404". | `apps/web/src/components/layout/AppShell.tsx:114`, `packages/api/src/routes/aiAssistant.routes.ts:59`, `packages/api/src/config/env.ts:118` | Hide the button when the assistant is disabled? |
| F-DASH-008 | Confirmed: the XIRR in the Total invested hint is the unweighted mean of per-portfolio XIRRs, not a combined XIRR. | `apps/web/src/pages/dashboard/DashboardPage.tsx:476` | Use a combined XIRR (the user-level XIRR endpoint already returns one)? |
| F-TXN-002 | Confirmed defect: Trade date and Price validation errors are never displayed (only Portfolio and Quantity errors render), so an invalid or blank date — the default when opened from Reports — makes **Add transaction** silently do nothing. | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:74`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:215`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:519` | Render `formState.errors.tradeDate` / `price`. |
| F-TXN-003 | Confirmed defect: **Record it anyway** does not work on edits — `allowDuplicate` is only added to create requests, so the 409 repeats. | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:283`, `packages/api/src/services/holdings/transaction.service.ts:461` | Pass `allowDuplicate` on update too. |
| F-TXN-002 | Confirmed: after saving or deleting a transaction the dialog invalidates `portfolio-summary` (no query uses that key) and not `['portfolio', id]` or `['dashboard']`, so the portfolio page's cards and the Dashboard stay stale until refetched. | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:289`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:81`, `apps/web/src/pages/dashboard/DashboardPage.tsx:371` | Invalidate the keys actually used. |
| F-TXN-002 | Confirmed: creating a transaction recalculates holdings but does not rebuild stored capital-gain rows, although the service comment says create/edit/delete all do. Reports compute gains live; only the stored-data integrity check reads stored rows. | `packages/api/src/services/holdings/transaction.service.ts:342`, `packages/api/src/services/tax/capitalGains.service.ts:963`, `packages/api/src/services/integrity/storedDataIntegrity.service.ts:1` | Call `persistCapitalGainsForAsset` on create? |
| F-TXN-002 | Preview vs server: the dialog treats BONUS as an inflow (net = gross − charges) while the server treats BONUS (and RIGHTS ISSUE, OPENING BALANCE, MERGER IN, DEMERGER IN) as buy-type (gross + charges). | `apps/web/src/pages/transactions/TransactionFormDialog.tsx:364`, `packages/api/src/services/holdings/transaction.service.ts:169` | Align the lists. |
| F-DASH-002 | Owned property (Real Estate page) and bank balances are not part of Total Net Worth, though the real-estate service comment says "Net-worth aggregation reads `currentValue` directly". | `packages/api/src/services/analytics/dashboard.service.ts:470`, `packages/api/src/services/realEstate/realEstate.service.ts:11` | Intended? If not, add owned property (and bank balances) to the total. |
| F-PORT-011 | Any signed-in user can trigger global market-data syncs (`/api/assets/sync-*`, `/api/assets/amfi/sync`) and `/api/corporate-actions/sync`; there is no role gate or rate limit. | `packages/api/src/routes/assets.routes.ts:46`, `packages/api/src/routes/assets.routes.ts:50`, `packages/api/src/routes/corporateActions.routes.ts:17` | Restrict to admins or rate-limit? |
| F-DASH-007 | Confirmed: the LTCG-exempt colour checks "≥ 90%" before "≥ 100%", so the red (fully used) state can never show. | `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:138` | Swap the order. |
| F-DASH-007 | The tax PDF download uses `fetch` without family or acting headers, so while managing an account it downloads the manager's report. | `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:66` | Add the headers. |
| F-BANK-002 | Saving the account form always sends `currentBalance`, so every edit resets the balance source to manual and the date to the form's As of — an account updated from e-mail loses its "live" mark. Clearing the balance box clears the balance. | `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:359`, `packages/api/src/services/banking/bankAccounts.service.ts:245` | Send the balance only when changed. |
| F-BANK-007 | Deleting a balance record never recalculates the account's current balance, has no confirmation and no message. | `apps/web/src/pages/bankAccounts/BankAccountDetailPage.tsx:142`, `packages/api/src/services/banking/bankAccounts.service.ts:445` | Recompute from the newest remaining record? |
| F-PORT-007 | Group "Today's change" counts stocks only; a single portfolio also counts funds, crypto and gold. | `packages/api/src/services/holdings/portfolioGroup.service.ts:283`, `packages/api/src/services/holdings/portfolio.service.ts:457` | Reuse the portfolio calculation. |
| F-ALERT-001 | Many alert types cannot be chosen in the type filter (LOAN_EMI_DUE, CREDIT_CARD_DUE, LOAN_GIVEN_DUE, INSURANCE_CLAIM, PROPERTY_*, PF_REFRESH_DUE, FO_*), and vehicle-expiry and rent-overdue alerts are stored as CUSTOM. | `apps/web/src/pages/alerts/AlertsPage.tsx:61`, `packages/api/prisma/schema.prisma:1630`, `packages/api/src/services/notifications/alerts.service.ts:151` | Extend the filter and use specific types. |
| F-ALERT-003 | Alerts page error toasts show axios's generic text ("Request failed with status code …") rather than the server message. | `apps/web/src/pages/alerts/AlertsPage.tsx:284` | Use `apiErrorMessage`. |
| F-SHELL-009 | Stale comments: the sidebar card says admins bypass feature gates; `rateLimit.ts` says the frontend simulates the locked answer — in code, gates never bypass admins and the server writes the locked preview. | `apps/web/src/components/layout/UpgradeSidebarCard.tsx:15`, `packages/api/src/ai/rateLimit.ts:5`, `packages/api/src/routes/aiAssistant.routes.ts:247` | Update comments. |
| F-PORT-001 | In family view the "N of M portfolios used" badge counts every listed portfolio (including other members'), while the server counts only the caller's own; **New portfolio** can be disabled wrongly. | `apps/web/src/pages/portfolios/PortfolioListPage.tsx:47`, `packages/api/src/controllers/portfolio.controller.ts:56` | Count own portfolios only. |
| F-DASH-003 | In family view the merged alert list is concatenated member by member and cut to 10 without re-sorting by urgency. | `packages/api/src/services/analytics/dashboard.service.ts:658` | Re-sort before slicing. |

### b07-data-in

| F-INGEST-006 | Defect: every new monitored sender is created with auto-commit ON (the UI never sends the flag, the service defaults it to true), contradicting the page header "Everything is reviewable before it lands in your records", the threshold help text, and the server guard that refuses enabling auto-commit before N approvals | `packages/api/src/services/gmail/monitoredSenders.service.ts:99`, `apps/web/src/pages/ingestion/SendersPage.tsx:120`, `apps/web/src/pages/ingestion/IngestionPage.tsx:170`, `packages/api/src/controllers/monitoredSenders.controller.ts:54` | Should new senders start in review mode (auto-commit off)? |
| F-INGEST-008 | Defect: senders saved in `@domain` form (offered by the Senders page) are put into the Gmail query but the poller matches From addresses by exact lookup only, so their emails are counted "unmatched" and never parsed | `packages/api/src/ingestion/gmail/poller.ts:165`, `packages/api/src/services/gmail/monitoredSenders.service.ts:47`, `apps/web/src/pages/ingestion/SendersPage.tsx:91` | Match domain senders by suffix (as the attachment sync already does at `packages/api/src/ingestion/gmail/gmail.connector.ts:96`)? |
| F-IMPORT-004 | Defect: a wrong password on the Import page closes the unlock dialog with "Password accepted — reprocessing"; the reprocess endpoint returns 200 with the job still NEEDS_PASSWORD, so the dialog's "That password didn't unlock the file" path never runs | `packages/api/src/controllers/imports.controller.ts:234`, `apps/web/src/pages/imports/ImportPage.tsx:49`, `apps/web/src/hooks/useUploadWithPasswordRetry.ts:126` | Return FILE_LOCKED when the job is still locked? |
| F-IMPORT-003 | Defect: jobs failed by the worker or the orphan sweep store `errorLog.workerError` (e.g. "Import was interrupted. Please upload the file again."), but the **Errors** button only appears for failed rows/warnings and the dialog never renders `workerError`, so these jobs show **Failed** with no reason | `packages/api/src/jobs/importWorker.ts:61`, `packages/api/src/jobs/importWorker.ts:144`, `apps/web/src/pages/imports/ImportPage.tsx:307`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:24` | Show workerError in the dialog? |
| F-MAIL-001 | Mismatch: Gmail connection requests `gmail.send` as well as `gmail.readonly`, while the ingestion page says the scan is "(read-only)" | `packages/api/src/ingestion/gmail/gmail.connector.ts:26`, `apps/web/src/pages/ingestion/IngestionPage.tsx:385` | Update the copy, or request send only when rent reminders are enabled? |
| F-MAIL-002 | Defect: the access-lost message tells users to "Click Reconnect on the Mailboxes page", but `/mailboxes` redirects to `/ingestion` and there is no Reconnect button | `packages/api/src/ingestion/gmail/gmail.connector.ts:247`, `apps/web/src/App.tsx:268` | Reword to "Add another" on Connect your Gmail? |
| F-MAIL-002 | Defect: **Disconnect** does not invalidate the `mailboxes` cache, so the account stays listed until **Refresh** | `apps/web/src/pages/ingestion/IngestionPage.tsx:356` | Invalidate after success? |
| F-INGEST-004 | Mismatch: empty-state text says "poller runs every 10 minutes"; the default interval is 3 minutes | `apps/web/src/pages/ingestion/IngestionPage.tsx:967`, `packages/api/src/config/env.ts:91` | Make the text match or omit the number |
| F-IMPORT-001 | Defect: a file with an unsupported extension dropped on the Import box (the drop zone does not filter like the picker) is rejected by multer with a plain `Error`, which the error handler maps to 500 "Internal server error" in production; same for the Documents sorter | `packages/api/src/middleware/upload.ts:61`, `packages/api/src/middleware/documentUpload.ts:56`, `packages/api/src/middleware/errorHandler.ts:111`, `apps/web/src/pages/imports/ImportDropzone.tsx:20` | Throw a BadRequestError with the "Unsupported file type" text? |
| F-MAIL-001 | Defect: "Google did not return a refresh token …" is a plain `Error`, so users see "Internal server error" in production instead of the actionable message | `packages/api/src/ingestion/gmail/gmail.connector.ts:162`, `packages/api/src/middleware/errorHandler.ts:111` | Map to a 400 with the message? |
| F-CAS-001 | Stale copy: **Next steps** mention an IMAP mailbox and "Imports → CAS PDF", neither of which exists in the app; the controller comment also says the poller picks CAS up "once an IMAP account is set" | `packages/api/src/controllers/cas.controller.ts:109`, `packages/api/src/controllers/cas.controller.ts:110`, `packages/api/src/controllers/cas.controller.ts:11` | Point to Gmail connection and Tools → Import |
| F-IMPORT-002 | Every uploaded PDF is typed CONTRACT_NOTE_PDF (and spreadsheets GENERIC_EXCEL) from the extension, so a CAS upload shows **CONTRACT NOTE PDF** in **Type** | `packages/api/src/controllers/imports.controller.ts:48` | Show the parser used instead? |
| F-MAIL-003 | Mismatch: scan setup says "Both dates inclusive" and allows from = until, but the server rejects it with "lookbackTo must be after lookbackFrom" | `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:88`, `packages/api/src/services/gmail/gmailScanJobs.service.ts:16` | Allow a one-day scan (`<` instead of `<=`)? |
| F-INGEST-009 | Approved SIP_INSTALLMENT, FD_CREATION/FD_MATURITY, RENT_*, VEHICLE_CHALLAN and VALUATION_SNAPSHOT events are marked PROJECTED with no record written, though they leave the review queue as if committed | `packages/api/src/ingestion/projection.ts:537` | Warn on approval, or project SIPs as transactions? |
| F-INGEST-006 | Defect: the add-sender form sends `displayLabel: ''` when left blank; the server keeps `''` (only null triggers the seed label) and lists show `displayLabel ?? address`, i.e. an empty name | `apps/web/src/pages/ingestion/SendersPage.tsx:22`, `packages/api/src/services/gmail/monitoredSenders.service.ts:90`, `apps/web/src/pages/ingestion/SendersPage.tsx:212` | Send null for blank labels? |
| F-MAIL-005 | Copy promises "You approve each new sender once", but attachment sync imports from any sender whose attachment name matches the statement patterns, and senders start with auto-commit on | `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:75`, `packages/api/src/ingestion/gmail/gmail.connector.ts:443` | Reword the banner |
| F-INGEST-002 | Card says "scoring is done locally from subject keywords"; scoring runs on the server and also uses message snippets | `apps/web/src/pages/ingestion/IngestionPage.tsx:660`, `packages/api/src/ingestion/gmail/keywords.ts:156` | Reword |
| F-INGEST-007 | The **Auto-committed** tab lists every PROJECTED event, including ones approved by hand | `apps/web/src/pages/ingestion/ReviewPage.tsx:37` | Rename the tab to "Committed"? |
| F-INGEST-004 | **View original in Gmail** always opens Gmail account `/u/0`, which may be a different Google account than the connected one | `apps/web/src/pages/ingestion/IngestionPage.tsx:1128` | Use the authuser parameter with the connected address? |
| F-MAIL-007 | **Scan inbox** runs only the attachment sync, not the monitored-sender email reader, so email-text events still wait for the next poll | `apps/web/src/context/ScanContext.tsx:35`, `packages/api/src/controllers/mailboxes.controller.ts:128` | Run both? |

### b02-mutual-funds

| F-MF-005 | Defect: the CASParser dialog collects **Portfolio** and **Nickname** but never sends them; the request body is only PAN, email and dates | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:85`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:200`, `packages/api/src/controllers/mfCasparser.controller.ts:34` | Remove the fields or wire them through? |
| F-MF-004 | Defect: **Sync AMFI NAV** loads NAVs but does not reprice holding projections, so the holdings table is unchanged until the 22:00 IST job (which calls `refreshAllHoldingPrices` after the load) | `packages/api/src/controllers/assets.controller.ts:93`, `packages/api/src/priceFeeds/amfi.service.ts:295`, `packages/api/src/jobs/priceJobs.ts:97` | Should the button also reprice the caller's holdings? |
| F-MF-021 | Defect: analysis triggers on holdings change and on new scores (`onMfHoldingsChanged`, `onMfSchemeScoresUpdated`) have no callers, so findings/verdicts only update on manual **Refresh analysis** | `packages/api/src/jobs/mfAnalysisJob.ts:187`, `packages/api/src/jobs/mfAnalysisJob.ts:209` | Wire the triggers into the projection path and the score job? |
| F-MF-010 | Defect (security): any PLUS user can fetch and import Finfactor data for an arbitrary **Unique identifier**; nothing ties the identifier to the caller's consent | `packages/api/src/routes/finfactor.routes.ts:45`, `packages/api/src/ingestion/finfactor/sync.service.ts:135`, `packages/api/src/ingestion/finfactor/mf.service.ts:45` | Restrict to identifiers from the caller's own consent records? |
| F-MF-010 | Defect: the Finvu import upserts the shared `MutualFundMaster` table from upstream payloads (overwriting scheme name, AMC, category for every user; scheme code falls back to the ISIN) | `packages/api/src/ingestion/finfactor/sync.service.ts:171`, `packages/api/src/ingestion/finfactor/sync.service.ts:202` | Should user imports be allowed to rewrite global reference data? |
| F-MF-010 | Defect: after **Import to portfolio** the card invalidates `holdings` and `mutual-funds` cache keys, which the Mutual Funds page does not use (`portfolio-holdings`), so the page does not refresh | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:145`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:65` | Invalidate `portfolio-holdings`? |
| F-MF-010 | Finvu source hash is not user-scoped (`finvu:<txnId>`) while `Transaction.sourceHash` is globally unique | `packages/api/src/ingestion/finfactor/sync.service.ts:224`, `packages/api/prisma/schema.prisma:1116` | Prefix with user id? |
| F-MF-009 | Operator sandbox shown on an end-user page to every plan; exposes env var names and the Finfactor base URL when unconfigured | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:542`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:203` | Hide behind ADMIN or a flag? |
| F-MF-005 | The CASParser credits line shows the operator's shared CASParser account balance/plan to every user | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:145`, `packages/api/src/controllers/mfCasparser.controller.ts:66` | Intended? |
| F-MF-006 | Portal mailback request records store **Portfolio** / **Nickname**, but nothing reads them; the eventual import is decided by the Gmail pipeline. Unlike CASParser, this flow does not add CAS senders to Gmail monitoring | `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:68`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:365` | Should mailback also add senders and honour the portfolio? |
| F-MF-006 | Managing mode: PAN reveal/save hit the account route (manager's PAN) while the mailback runs as the managed person (managed person's PAN used as PDF password) | `apps/web/src/api/client.ts:48`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:96`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:171` | Block the dialog while managing, or reveal the managed PAN? |
| F-MF-002 | The page fetches 200 MF transactions (server cap 200) with no paging; older rows silently missing | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:72`, `packages/api/src/services/holdings/transaction.service.ts:659` | Add paging or a link to the full list? |
| F-MF-008 | Overlap card includes ETFs and values unpriced holdings at cost, while the page tiles exclude ETFs — "MF value" can differ from **Current value** | `packages/api/src/services/mf/mfOverlap.service.ts:92`, `packages/api/src/services/mf/mfOverlap.service.ts:124`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:173` | Align the two? |
| F-MF-019 | Alternative-fund links use a plain `href`, causing a full page reload instead of in-app navigation | `apps/web/src/pages/mf/components/PlainOverview.tsx:1303` | Use router Link? |
| F-MF-005 | The dialog's "Submitting request to KFintech..." step is never shown: the `submitting` phase is never set | `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:246` | Cosmetic |
| F-MF-021 | Break-even on switch cost is always unavailable because `REPLACEMENT_EXPECTED_EDGE` is null, so verdict row 3 (rating-driven Switch candidate) can never fire | `packages/api/src/services/mf/mfAnalytics/constants.ts:121`, `packages/api/src/services/mf/mfAnalytics/mfVerdict.ts:441` | By design until the backtest lands? |
| F-MF-022 | Code comment calls the methodology page "public", but the route sits inside the signed-in shell and the API requires authentication | `packages/api/src/routes/mfPortfolio.routes.ts:56`, `apps/web/src/App.tsx:196` | Make it public? |
| F-MF-010 | Auto-created "Finvu Imports" portfolio is created without the plan's portfolio-cap check | `packages/api/src/ingestion/finfactor/sync.service.ts:117` | Apply the cap? |

### b01-asset-classes

| F-GOLD-001 | Server values Gold ETF units at the 24K per-gram gold price (an ETF unit is roughly 1/100 g), and values physical gold at 24K whatever the carat and silver at 999 whatever the grade. Dashboard, reports and net worth use these server values; the Gold page uses its own live calculation, and falls back to the server value when an ETF name has no recognised ticker. | `packages/api/src/priceFeeds/router.service.ts:65`, `packages/api/src/services/holdings/holdingsProjection.ts:478`, `apps/web/src/pages/assetClasses/GoldPage.tsx:59`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:176` | Should the server apply carat/purity and ETF NAVs? |
| F-BOND-001 | Simple asset pages add Current value only over holdings that have one but Invested over all, so Bonds, NPS and Others (no price source) always show Current ₹0 and P&L = −Invested (−100%). The Stocks page uses the "carry unpriced at cost" rule instead. | `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:192`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:196`, `apps/web/src/lib/holdingsSummary.ts:33`, `packages/api/src/priceFeeds/router.service.ts:94` | Use `summariseHoldings` on these pages too? |
| F-FD-003 | Amount-only forms save quantity 1, and Withdrawal/Maturity/Redemption remove units first-in-first-out, so any withdrawal or maturity entry deletes one whole earlier entry regardless of amount. An RD "Maturity payout" removes one installment and the RD stays on the page; PO Savings and SCSS withdrawals behave the same. | `apps/web/src/pages/assetClasses/FDFormDialog.tsx:178`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:301`, `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:123`, `packages/api/src/services/holdings/holdingsProjection.ts:198`, `packages/api/src/services/holdings/holdingsProjection.ts:291` | Should amount-based classes reduce by amount? |
| F-FD-001 | The FD page and both detail pages ask for 500 transactions but the server caps every list at 200; all asset pages therefore see only the newest 200 entries per class, which undercounts RD installments and hides older entries. | `packages/api/src/services/holdings/transaction.service.ts:660`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:561`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:392`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:327` | Raise the cap or page through? |
| F-FD-001 | Three different maturity formulas: FD card (simple interest for "At maturity" payout, else compounding by payout frequency on exact months), RD card (monthly compounding although it prints "Interest compounded quarterly" and ignores the chosen compounding), detail page and server (compounding by frequency with At maturity = yearly, on 365.25-day years). | `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:89`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:109`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:457`, `apps/web/src/lib/depositMath.ts:63`, `packages/api/src/services/holdings/holdingsProjection.ts:47` | Which formula is authoritative? |
| F-FD-003 | **Tenure (months)** in the RD form is never sent to the server; only the maturity date it fills is saved. | `apps/web/src/pages/assetClasses/FDFormDialog.tsx:171` | Intended? |
| F-FD-004 | When no entry matches by account number or name, FD and Post Office detail pages show every entry of that class in the portfolio, so another deposit's entries can appear and "Edit" can open the wrong deposit. | `apps/web/src/pages/assetClasses/FdDetailPage.tsx:448`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:375` | — |
| F-FNO-009 | Only **Sync Kite** exists; the server accepts Upstox and Angel One, and the UI can connect them, but nothing in the app calls sync for them. | `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343`, `packages/api/src/controllers/fo.controller.ts:205` | Add per-broker sync buttons? |
| F-FNO-009 | "Synced — N new trades" counts trades already stored: a duplicate returns the existing row and is still counted. | `packages/api/src/services/fo/foBrokerSync.service.ts:56`, `packages/api/src/services/fo/foBrokerSync.service.ts:97` | — |
| F-FNO-005 | Rejecting an expiry close only marks the job REJECTED; the position stays PENDING_EXPIRY_APPROVAL ("EXPIRY ?") and the job never re-scans it (it only scans OPEN positions expiring today). There is no field to enter a missing settlement price. | `packages/api/src/controllers/fo.controller.ts:268`, `packages/api/src/services/fo/foExpiry.service.ts:37`, `packages/api/src/services/fo/foExpiry.service.ts:101` | — |
| F-STOCK-003 | **Refresh prices** fetches prices for stocks held by all users and re-prices/recomputes every holding in the system on one user's click; `/api/assets/sync-*` endpoints likewise need only sign-in. | `packages/api/src/controllers/assets.controller.ts:88`, `packages/api/src/controllers/assets.controller.ts:89`, `packages/api/src/routes/assets.routes.ts:50` | Restrict to admins or to the caller's holdings? |
| F-FNO-008 | The broker callback page posts its result with target origin `*` and the F&O page accepts `broker_oauth_result` messages without checking the sender's origin. | `packages/api/src/controllers/brokerOauth.controller.ts:160`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1786` | Restrict origins? |
| F-STOCK-001 | Stocks **Download** passes only EQUITY, so ETFs shown on the page are left out of the report. Rows are merged by symbol only, across exchanges. | `apps/web/src/pages/assetClasses/StocksPage.tsx:216`, `apps/web/src/pages/assetClasses/StocksPage.tsx:125` | — |
| F-GOLD-003 | Photo upload failures after saving are swallowed (no message); the 5-photo limit is enforced only in the form (server limits 5 files per request, not per entry). Photo size fallback in code (20 MB) differs from the env default (50 MB). | `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:283`, `packages/api/src/controllers/transactionPhotos.controller.ts:57`, `packages/api/src/controllers/transactionPhotos.controller.ts:15`, `packages/api/src/config/env.ts:58` | — |
| F-GOLD-004 | Gold, Crypto and Post Office detail pages need navigation state; a refresh or shared link redirects to the list (the FD page looks the holding up instead). | `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:321`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:47`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:322`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:370` | — |
| F-CRYPTO-003 | Coin detail lists the coin's transactions from all portfolios while its figures are one portfolio's holding. | `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:70` | — |
| F-BOND-002 | Asset-class dialogs show the server's 409 duplicate message but, unlike the Transactions form, offer no "record anyway" (allowDuplicate) path. | `packages/api/src/services/holdings/transaction.service.ts:289`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:37`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:143` | — |
| F-OTHER-002 | Other Assets page includes REAL_ESTATE holdings but the form's Asset Type list has no Real Estate option. | `apps/web/src/pages/assetClasses/OtherAssetsPage.tsx:14`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:26` | — |
| F-FNO-010 | `defaultEquityTaxTreatment` is written by the settings endpoint but never read. | `packages/api/src/controllers/fo.controller.ts:283` | Remove or wire up? |
| F-PO-006 | Post Office maturity alerts are per entry (one per RD/SSY installment carrying the maturity date) and still fire after a maturity payout is recorded. | `packages/api/src/services/notifications/alerts.service.ts:279` | Group by account like deposit reminders? |
| F-NPS-001 | Page description promises "PRAN and scheme allocations" but there is no allocation or NAV tracking. | `apps/web/src/pages/assetClasses/NpsPage.tsx:9` | — |

### b04-loans-cards

| F-CARD-006 | Defect: a card's `outstandingBalance` is only ever overwritten with the amount of the latest non-paid statement added; marking a statement paid or deleting it never reduces it, and the web form has no outstanding field. Utilisation, the summary strip, dashboard card liability and the AI connector therefore stay high after payment | `packages/api/src/services/banking/creditCards.service.ts:308`, `packages/api/src/services/banking/creditCards.service.ts:346`, `packages/api/src/services/banking/creditCards.service.ts:364` | Should outstanding be derived from unpaid statements (statement − paid)? |
| F-LOAN-001 | Inconsistency: the dashboard/sidebar/will estate use `loanPosition` (opening balance of the earliest unpaid row, past rows included) while the Loans page uses `computeLoanSummary` (first unpaid row dated today or later). A loan added mid-tenure with earlier EMIs unmarked shows near-full principal on the dashboard but the scheduled balance on the Loans page | `packages/api/src/services/loans/loans.service.ts:427`, `packages/api/src/services/loans/loans.service.ts:493`, `packages/api/src/services/analytics/dashboard.service.ts:272` | Which definition is intended? |
| F-LOAN-009 | The loan tax panel always uses 30% with no 4% cess and ignores regime and the 80E 8-year limit; the EMI Calculator for the same loan uses slab × 1.04, regime and 8 years — two different "tax saved" figures for one loan | `packages/api/src/services/loans/loans.service.ts:607`, `packages/shared/src/loans/emiTax.ts:21` | Align the panel with the calculator's tax engine? |
| F-LOAN-002 | Loans with status **Default** are listed under "Closed / Foreclosed", counted as "Closed" in the overview, shown with their original amount, and excluded from dashboard liabilities (ACTIVE-only filter) — a defaulted debt disappears from net worth | `apps/web/src/pages/loans/LoanListPage.tsx:650`, `apps/web/src/pages/loans/LoanListPage.tsx:827`, `packages/api/src/services/analytics/dashboard.service.ts:240` | Should a defaulted loan stay a liability? |
| F-LOAN-012 | EMI and card reminder descriptions format money with Western 3-digit grouping and ISO dates ("₹1,234,567.00 due on 2026-11-05"), unlike the rest of the app (Indian grouping, dd/mm/yyyy); loan-given reminders use dd/mm/yyyy but the same Western grouping | `packages/api/src/services/loans/loans.service.ts:994`, `packages/api/src/services/banking/creditCards.service.ts:486`, `packages/api/src/services/loans/loansGiven.service.ts:717` | Use the shared Indian formatter? |
| F-LOAN-011 | `vehicleId` / `rentalPropertyId` are accepted by the loans API and rendered as linked cards, but no web form sets them | `packages/api/src/controllers/loans.controller.ts:44`, `apps/web/src/pages/loans/LoanDetailPage.tsx:1221` | Add a link picker or drop the cards? |
| F-LOAN-003 | Loan forms show the server's rejection only as the axios text ("Request failed with status code 422") because they read `error.message` instead of `apiErrorMessage`; the Zod message (for example "Expected positive decimal string") never reaches the user | `apps/web/src/pages/loans/LoanListPage.tsx:587`, `apps/web/src/pages/loans/LoanDetailPage.tsx:231`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:172` | Switch to `apiErrorMessage`? |
| F-LOAN-019 | **Remove entry** on a loan given deletes immediately with no confirmation, unlike every other delete in the module | `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:622` | Add a confirm step? |
| F-LOAN-021 | **Mark settled** neither checks nor zeroes the balance, so a settled flexible loan keeps showing "Still owed" on its card | `packages/api/src/services/loans/loansGiven.service.ts:630` | Intended? |
| F-CARD-006 | Statement changes on the card page invalidate only the card-page caches, not `credit-cards`, so the list shows old figures for up to the 30 s stale time | `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:117`, `apps/web/src/main.tsx:44` | Also invalidate the list key? |
| F-CARD-002 | A saved full card number cannot be removed from the UI (an empty field means "keep"); the API supports clearing with null/blank | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:405`, `packages/api/src/services/banking/creditCards.service.ts:198` | Add a "remove saved number" control? |
| F-CARD-005 | **Next due** on the card page ignores Overdue statements (Pending/Partial only, due ≥ today) while the list's **Payment due** includes them | `packages/api/src/services/banking/creditCards.service.ts:400`, `apps/web/src/lib/creditCardDue.ts:28` | Should overdue bills show as next due? |
| F-LOAN-006 | The detail-page Edit dialog omits borrower, account number, dates and prepayment option, so those can only be changed from the list page | `apps/web/src/pages/loans/LoanDetailPage.tsx:263` | Intended? |
| — | Role/access: R-MANAGER reveals are audited under the managed person's id, not the acting manager | `packages/api/src/services/banking/creditCards.service.ts:270`, `packages/api/src/controllers/loans.controller.ts:166` | Should audit rows carry the actor? |
| — | Module distinction not covered by global roles: none found (no plan or role gate in these modules) | `packages/api/src/routes/loans.routes.ts:21` | — |

### b05-property-vehicles

| F-RENT-010 | Defect (data loss): **Undo** on an auto-matched rent month deletes the bank credit's own cash-flow entry. The projection passes its newly created cash flow into the auto-match, the ledger entry stores that id, and undo deletes every cash flow referenced by the month's auto-matched entries — the imported UPI/NEFT credit vanishes from Cash Activity while its event stays PROJECTED pointing at a deleted row | `packages/api/src/ingestion/projection.ts:326`, `packages/api/src/ingestion/projection.ts:286`, `packages/api/src/services/rental/rental.service.ts:1112`, `packages/api/src/services/rental/rental.service.ts:1201` | Should undo only unlink (not delete) a cash flow it did not create? |
| F-RENT-016 | Defect: rejecting a reminder does not stick. REJECTED is in REVIVABLE_STATUSES, so the next scan that selects the same (month, lead day) puts it back in the queue — for overdue months that is every daily 09:00 scan. The code comment says the opposite ("a future scan won't re-create it") | `packages/api/src/services/rental/rental.reminders.service.ts:154`, `packages/api/src/services/rental/rental.reminders.service.ts:163`, `packages/api/src/services/rental/rental.reminders.service.ts:164` | Remove REJECTED from the revivable set? |
| F-REST-009 | Defect: **Remove from rentals** on a rental with tenancies/expenses throws a plain `Error`, which production answers as 500 "Internal server error"; the intended message ("Cannot unlink rental — tenancies or expenses already exist. Delete those first.") never reaches the user, and tenancies cannot be deleted in the web app anyway | `packages/api/src/services/realEstate/realEstate.service.ts:433`, `packages/api/src/middleware/errorHandler.ts:114` | Throw BadRequestError; offer a path to remove tenancies? |
| F-RENT-003 | Defect: deleting a rental property (or tenancy via API) leaves its rent/deposit cash-flow rows behind — `RentLedgerEntry.cashFlowId` is a plain column and the delete does not clean them, so "Rent received — …" inflows stay in Cash Activity | `packages/api/src/services/rental/rental.service.ts:327`, `packages/api/src/services/rental/rental.service.ts:636`, `packages/api/prisma/schema.prisma:2239` | Delete linked cash flows on cascade? |
| F-RENT-003 | Deleting a rental property linked from Real Estate clears the link (default SetNull) but leaves the owned property's status "Rented out" | `packages/api/prisma/schema.prisma:3304`, `packages/api/src/services/rental/rental.service.ts:327` | Reset status like unlink does? |
| F-VEH-013 | Defect: after **Use my car**, the cascade-reset effects run on the newly set category/make/model and blank the Model, Year and Trim selects (the quote itself is kept) | `apps/web/src/pages/vehicles/VehicleValuePage.tsx:97`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:100`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:145` | Skip the resets when values come from auto-valuation |
| F-VEH-007 | Defect: the edit form drops empty strings before PATCH, so a field cannot be cleared (e.g. a wrong PUC date) | `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:122` | Send null for cleared fields |
| F-VEH-006 | Defect: the detail page renders "Loading…" whenever the vehicle is absent, including after a 404/403, so a bad link never shows an error | `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:226` | Add a not-found state |
| F-VEH-003 | The add wizard has no manual-entry path: the "details" step is reachable only in edit mode, so a vehicle can be added only via CarInfo OTP or SMS paste (or onboarding quick-add) | `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:73`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:221` | Intended? |
| F-REST-005 | For a sold property the tile "Realised gain (raw)" is current value − cost, not sale proceeds − cost | `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:119`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:248` | Use sale price when sold |
| F-REST-007 | Changing Status away from Sold in the edit form leaves `isActive` false and keeps sale fields, so the property stays out of alerts | `packages/api/src/services/realEstate/realEstate.service.ts:213`, `packages/api/src/services/realEstate/realEstate.service.ts:323` | Provide an explicit "undo sale"? |
| F-REST-001 | Summary tiles and card gains ignore **My share (%)** (full value and full cost), while capital gain applies the share | `apps/web/src/pages/realEstate/RealEstateListPage.tsx:778`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:99` | Should net worth use the owner's share? |
| F-RENT-002 | Rental dialogs (property, tenancy, expense, khata, contact save, reminders) show `err.message`, i.e. "Request failed with status code 4xx", not the server's reason | `apps/web/src/pages/rental/RentalListPage.tsx:311`, `apps/web/src/pages/rental/RentalDetailPage.tsx:784`, `apps/web/src/pages/rental/RentalDetailPage.tsx:899`, `apps/web/src/pages/rental/TenantKhataPage.tsx:109` | Use apiErrorMessage like Real Estate does |
| F-RENT-009 | Skip / Undo skip / Undo received / Undo auto-match have no onError or success feedback; refusals are silent | `apps/web/src/pages/rental/RentalDetailPage.tsx:231`, `apps/web/src/pages/rental/RentalDetailPage.tsx:243` | Add toasts |
| F-RENT-011 | Expense delete is one click with no confirmation and no undo | `apps/web/src/pages/rental/RentalDetailPage.tsx:1141` | Add confirm like the khata |
| F-RENT-006 | A tenancy without an end date gets only 12 months of receipts; nothing extends the schedule later (receipt generation runs only on create and on end-date extension) | `packages/api/src/services/rental/rental.service.ts:193`, `packages/api/src/services/rental/rental.service.ts:439`, `packages/api/src/services/rental/rental.service.ts:529` | Add a rolling extension job? |
| F-RENT-016 | Only PENDING_APPROVAL reminders are listed; sent/failed history and per-channel errors are stored but never shown | `apps/web/src/pages/rental/RentalRemindersPanel.tsx:937`, `packages/api/src/services/rental/rental.reminders.service.ts:431` | Show history? |
| F-VEH-016 | Expiry alerts fire only when the daily scan lands exactly on day 30/15/7/1; vehicle alerts compute "today" at server-local midnight while real-estate alerts use UTC midnight | `packages/api/src/services/notifications/alerts.service.ts:121`, `packages/api/src/services/notifications/alerts.service.ts:147`, `packages/api/src/services/realEstate/realEstateAlerts.ts:25` | Use "≤ threshold and not yet sent" semantics; one clock |
| F-VEH-010 | Challan totals are summed with JS numbers in the browser (money rule violation), and challans removed at source are never removed | `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:117`, `packages/api/src/services/vehicles/challans.service.ts:158` | Use Decimal; reconcile removals |
| F-VEH-002 | The "Family" toggle groups by RC owner-name text, not by the Family feature's members — users may expect family members' vehicles | `apps/web/src/pages/vehicles/VehicleListPage.tsx:50` | Rename to "By owner"? |
| F-RENT-015 | **Remind** opens WhatsApp with `window.open` after an awaited request; popup blockers may block it | `apps/web/src/pages/rental/RentalListPage.tsx:577`, `apps/web/src/pages/rental/TenantKhataPage.tsx:327` | Open the window first, then set its URL |

### b11-money-misc

| F-FX-007 | Defect: the LRS form won't submit while **FX rate (optional)** or **TCS deducted** is empty. An empty text box is registered as "" and fails the optional regex; the form shows no message for these fields. | `apps/web/src/pages/forex/LrsTab.tsx:30`, `apps/web/src/pages/forex/LrsTab.tsx:34`, `apps/web/node_modules/react-hook-form/dist/index.esm.mjs:2336` | Treat "" as undefined (preprocess) and show field errors? |
| F-FX-002 | Defect: editing a forex balance clears the saved account number. The label says "(leave blank to keep existing)" but a blank box is sent as `null`, which the server treats as "clear". | `apps/web/src/pages/forex/ForexCashTab.tsx:305`, `apps/web/src/pages/forex/ForexCashTab.tsx:91`, `packages/api/src/services/forex/forex.service.ts:156` | Omit the field when blank on edit? |
| F-PF-006 | Defect: fetched and uploaded passbooks never reach the balance or holdings. Rows are stored as CONFIRMED canonical events; the projection marks PF events as no-op "updated by the PF service", but no code writes `ProvidentFundAccount.currentBalance`, and the holding recompute replays transactions only. | `packages/api/src/ingestion/projection.ts:559`, `packages/api/src/controllers/pf.controller.ts:497`, `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:172` | Write the balance from the latest passbook row and/or create holdings? |
| F-PF-005 | Defect (data exposure): `GET /api/epfppf/accounts` returns raw rows, including `identifierCipher`, `storedCredentials` (encrypted blob) and `credentialsKeyId`; the PF statement report explicitly avoids these columns. | `packages/api/src/services/pf/pfAccounts.service.ts:118`, `packages/api/src/controllers/pf.controller.ts:125`, `packages/api/src/services/reportBuilder/statement/providentFund.ts:59` | Select a safe DTO? |
| F-PF-008 | Defect: EPFO password reset never runs from the web app. The dialog sends no `source`, the server defaults to `EXTENSION` and enqueues only for `SERVER_HEADLESS`; no extension route picks up pending sessions. | `apps/web/src/pages/pf/PfPasswordResetDialog.tsx:77`, `packages/api/src/controllers/pf.controller.ts:229`, `packages/api/src/controllers/pf.controller.ts:254` | Send `SERVER_HEADLESS`, or add an extension pickup route? |
| F-PF-010 | PF nudge cron runs at 03:30 IST; comments say 09:00 IST ("09:00 IST = 03:30 UTC") but the schedule passes timezone Asia/Kolkata. | `packages/api/src/jobs/pfNudgeJob.ts:44` | Intended 09:00 IST? |
| F-PF-007 | The passbook upload always uses the EPFO passbook parser, even for PPF accounts. | `packages/api/src/controllers/pf.controller.ts:426` | Route PPF uploads to the bank parsers? |
| F-PF-006 | Saved portal credentials can't be removed in the app (no caller of the forget-credentials route), and the refresh dialog always re-asks for them. | `packages/api/src/routes/pf.routes.ts:77` | Add a "Forget saved login" control? |
| F-INS-001 | Policy status (Active/Lapsed/Surrendered/Matured/Claimed) can't be set from any screen; the API accepts it. Matured/lapsed policies keep generating reminders. | `packages/api/src/controllers/insurance.controller.ts:84`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:186` | Add a status control? |
| F-INS-008 | Health-cover details (members, room rent, co-pay, sub-limits) and the vehicle link have no input in this module; the Health cover panel and coverage health facts depend on them. | `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:154` | Add inputs? |
| F-INS-019 | Coverage check next steps that name a policy type open an empty **Add a policy** form (the step is ignored). | `apps/web/src/pages/insurance/CoveragePage.tsx:53` | Pre-fill the type? |
| F-INS-002 | Catalogue search says "24+" products; the catalogue has 23. | `apps/web/src/components/insurance/InsuranceCatalogPicker.tsx:93` | Update copy or catalogue? |
| F-INS-023 | Auto-matched premiums are dated the processing day, not the email/payment date. | `packages/api/src/services/insurance/insurance.service.ts:1054` | Use the event date? |
| F-ACCT-001 | Accounting mutations show `e.message` (axios "Request failed with status code …") instead of the server's error text, including the documented 404 "No receipts in that range." | `apps/web/src/pages/accounting/AccountingPage.tsx:105`, `apps/web/src/pages/accounting/AccountingPage.tsx:392` | Use `apiErrorMessage` / `decodeBlobError`? |
| F-ACCT-005 | Second voucher in a row reuses the suggested number: `voucher-next-no` isn't invalidated after a create and the dialog state isn't reset. | `apps/web/src/pages/accounting/AccountingPage.tsx:227`, `apps/web/src/pages/accounting/AccountingPage.tsx:237` | Invalidate and reset on success? |
| F-ACCT-005 | Next voucher number is derived from the digits of the alphabetically-last voucher of the type; with only `AUTO-…` vouchers it takes the digits inside a cuid, and after 9999 string ordering stops it increasing. | `packages/api/src/services/accounting/accounting.service.ts:437`, `packages/api/src/services/accounting/accounting.service.ts:441` | Exclude AUTO vouchers and order numerically? |
| F-ACCT-006 | Deleting an auto voucher is undone by the next statement read (projectBeforeRead regenerates it). | `packages/api/src/controllers/accounting.controller.ts:142`, `packages/api/src/services/accounting/accounting.service.ts:1089` | Hide delete on auto vouchers? |
| F-ACCT-007 | "Generate" toast reports only created vouchers ("No new vouchers…" even when some were updated or removed). | `apps/web/src/pages/accounting/AccountingPage.tsx:412` | Report updated/removed? |
| F-ACCT-013 | Tally export ignores manual vouchers and the user's chart of accounts (built from source records). | `packages/api/src/services/accounting/tally/tallySources.ts:283` | Intended? |
| F-FX-004 | Pair P&L buckets by financial year of each trade, so cross-year positions realise nothing; average-price math though the comment says FIFO. | `packages/api/src/services/forex/forex.service.ts:420`, `packages/api/src/services/forex/forex.service.ts:446` | Match across years? |
| F-FX-006 | LRS usage converts INR to USD at today's rate (fallback ₹83 hard-coded), not the remittance-date rate. | `packages/api/src/services/forex/forex.service.ts:238` | Use stored per-remittance rates? |
| F-FX-007 | Remittance linked to a TCS credit increments `usedAmount` by id without checking the credit belongs to the caller (RLS may block); not reachable from the UI. | `packages/api/src/services/forex/forex.service.ts:329` | Add an ownership check? |
| F-FX-001 | Rates from exchangerate-api are labelled FRANKFURTER; any user can trigger the global sync. | `packages/api/src/priceFeeds/fx.service.ts:233` | Separate label; rate-limit refresh? |
| F-GOAL-001 | Inflation rate is stored and an inflation-adjusted target computed, but neither the needed return nor any screen uses it. | `packages/api/src/services/goals/goals.service.ts:215` | Use the adjusted target? |
| F-CASH-002 | Cash flows from split settlements may be in a foreign currency; the list drops `currency` and formats every amount as ₹. | `packages/api/src/services/split/shareLink.service.ts:77`, `packages/api/src/controllers/cashflows.controller.ts:63` | Show currency / INR equivalent? |
| F-CASH-001 | Forecast counts only the next premium per policy within 12 months, FD/RD maturities at invested amount, and full rent for partial months. | `packages/api/src/services/analytics/cashflowForecast.service.ts:136`, `packages/api/src/services/analytics/cashflowForecast.service.ts:170` | Project recurring premiums and maturity values? |
| F-INC-003 | Income delete has no confirmation (other modules confirm). | `apps/web/src/pages/income/IncomePage.tsx:94` | Add a confirm? |

### b08-reports-tax

| F-TAX-004 | Confirmed defect: the Tax page's **ITR-portal CSV** and **Schedule 112A CSV (with FMV)** buttons call `/api/tax/grandfathering.csv`, which uses `req.user!.id` and ignores `subject`. With **Download reports for** set to a member, the file contains the caller's own data but is named after the member. `/api/tax/schedule-112a.csv` (which honours the subject) is unused. | `apps/web/src/pages/tax/TaxPage.tsx:215`, `apps/web/src/pages/tax/TaxPage.tsx:222`, `packages/api/src/controllers/fmv.controller.ts:117`, `packages/api/src/controllers/tax.controller.ts:119` | Point the buttons at `/api/tax/schedule-112a.csv` or make the grandfathering endpoints subject-aware? |
| F-REPORT-001 | Confirmed defect: in a family view the Reports and Analytics portfolio selectors list portfolios of other members (list follows family scope), but report/analytics endpoints reject any portfolio the caller does not own with 403; the page then shows an empty tab with no message. | `packages/api/src/services/holdings/portfolio.service.ts:51`, `packages/api/src/controllers/reports.controller.ts:93`, `packages/api/src/controllers/analytics.controller.ts:67`, `apps/web/src/pages/reports/ReportsPage.tsx:311` | Filter the selectors to own portfolios, or make the endpoints family-aware? |
| F-REPORT-016 | Confirmed defect: Download Report dialog (holdings) with **All portfolios** sends every id in the portfolio list. In a family view, or with a member chosen in **Report for**, those ids are not all owned by the subject and the export fails with "Forbidden". | `apps/web/src/components/reports/DownloadReportButton.tsx:98`, `packages/api/src/controllers/reports.controller.ts:411` | Send `all` (supported by the server) instead of the list? |
| F-REPORT-011 | Confirmed defect: Statements tab with a single **Portfolio** and **Report for** = a member sends the caller's portfolio id for the member's statement → 403 "Forbidden". | `apps/web/src/pages/reports/ReportsPage.tsx:1025`, `packages/api/src/controllers/reports.controller.ts:912` | Send `all` when the subject is not self? |
| F-TAX-007 | Confirmed defect: the F&O tab is shown on every plan; below Pro/Advisor the API returns 403 and the page shows a blank tab with no lock card. | `apps/web/src/pages/tax/TaxPage.tsx:44`, `apps/web/src/pages/tax/TaxPage.tsx:762`, `packages/api/src/routes/tax.routes.ts:39` | Wrap in `LockedFeature` or hide? |
| F-TAX-002 | Summary footnote says estimates exclude "any FMV adjustment for pre-31-Jan-2018 equity (grandfathering)", but the 112A computation uses `taxableGain`, which carries grandfathering. | `apps/web/src/pages/tax/TaxPage.tsx:617`, `packages/api/src/services/tax/taxComputation.ts:17` | Update the footnote? |
| F-TAX-002 | Tax summary computes and shows F&O net P&L/tax for every plan although the F&O schedule is a Pro/Advisor feature. | `packages/api/src/services/tax/tax.service.ts:270`, `packages/api/src/routes/tax.routes.ts:39` | Intended? |
| F-TAX-009 | Harvest footnote says classification "uses the oldest BUY in the lot", but the server classifies by remaining FIFO lots; "Days to LTCG" uses fixed 365/730/1095 days in the browser, not the rules table (24 months for non-equity funds after 23-Jul-2024). The code comment says ≤7 days is "red" but it is styled with the positive (green) colour. | `apps/web/src/pages/tax/TaxPage.tsx:1048`, `apps/web/src/pages/tax/TaxPage.tsx:119`, `apps/web/src/pages/tax/TaxPage.tsx:1018`, `packages/api/src/services/tax/tax.service.ts:568` | Align text and thresholds with the server? |
| F-TAX-010 | FMV save/delete have no error handling: a failed save throws an unhandled rejection with no message; delete does not refresh the Schedule 112A tab. Invalid input is silently ignored. | `apps/web/src/pages/tax/TaxPage.tsx:1082`, `apps/web/src/pages/tax/TaxPage.tsx:1093` | Add error toast and invalidate `tax-112a` on delete? |
| F-ANLYT-008 | With one portfolio selected, the harvest card filters only the candidate list; totals and estimated saving are for all portfolios. | `packages/api/src/services/analytics/analytics.service.ts:847`, `packages/api/src/services/analytics/analytics.service.ts:852` | Scope totals to the portfolio? |
| F-ANLYT-005 | Concentration info text says holdings "above 60% is flagged", but the card renders no flag. | `apps/web/src/pages/analytics/infoCopy.ts:115`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:100` | Add the flag or change the text? |
| F-ANLYT-006 | Best/worst re-ranks by rupees only the top 10 by percentage from the API, so a large-rupee loser outside those can be missed. | `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:44`, `packages/api/src/services/analytics/analytics.service.ts:342` | Rank by rupees on the server? |
| F-ANLYT-004 | Budget-capped message says "until the cap is raised in settings", but the cap is an operator AppSetting with no user setting. Operator messages ("set ENABLE_LLM_INSIGHTS=true", "ANTHROPIC_API_KEY is not set") are shown to users. Insight cache ignores the period. | `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:256`, `packages/api/src/services/analytics/analytics.insights.ts:185`, `packages/api/src/services/analytics/analytics.insights.ts:293` | Reword user-facing messages? |
| F-INTEL-001 | Page says "Recalculated automatically every 24 hours"; no scheduled job computes it — the stored score is reused for 24 h and recomputed on the next visit. **Recalculate** has no error handling. | `apps/web/src/pages/intelligence/HealthScorePage.tsx:128`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:118`, `packages/api/src/services/analytics/healthScore.service.ts:15` | Reword to "refreshed when older than 24 hours"? |
| F-REPORT-010 | All Reports/Tax download errors are shown with `alert()` containing the raw server response body (JSON). | `apps/web/src/pages/reports/ReportsPage.tsx:286`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:577`, `apps/web/src/hooks/useDownloadReport.ts:43` | Parse and show the message? |
| F-REPORT-015 | `STATUS_OPTIONS` (incl. Rejected, Not financial, Already imported) is defined but unused; only five chips are rendered. | `apps/web/src/pages/reports/InboxImportsTab.tsx:15`, `apps/web/src/pages/reports/InboxImportsTab.tsx:122` | Dead code or missing chips? |
| F-REPORT-013 | Catalog Schedule 112A download accepts **Whole family** (one section per member), while the Tax page refuses a combined Schedule 112A as "not a valid filing". | `packages/api/src/controllers/reports.controller.ts:1185`, `packages/api/src/services/reports/reportSubjects.ts:432` | Apply `requireSingleSubject` to the catalog Schedule 112A? |
| — | Family roles: capped vs uncapped contributors/viewers behave differently for report subjects; the global roles do not split them. | `apps/web/src/components/reports/useReportSubject.ts:90` | None — documented as a condition |

### b09-advice-pro

| F-ADV-004 | Defect: the allocation card takes targets from the newest-created *active* model portfolio, not the one tied to the user's current assessment. All four model portfolios are created active in order Conservative → Aggressive, so the card normally shows Aggressive targets; the engine (rebalance rule) uses the assessment's portfolio — the page and the advice disagree for anyone not Aggressive | `packages/api/src/controllers/advisor.controller.ts:203`, `packages/api/src/services/advisor/riskProfile.service.ts:100`, `packages/api/src/services/advisor/advisorFacts.builder.ts:208` | Read the target from the current assessment's `modelPortfolioId`? |
| F-ADV-007 | Defect: urgency badge thresholds (≤1 "Do first", ≤3 "Soon") never match engine priorities (minimum 5 = tax harvest base 5 + offset 0), so every card reads "When convenient" | `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:70`, `packages/api/src/services/advisor/constants.ts:80` | Rescale the badge to the 1–60 bands? |
| F-ADV-006 | Snoozed recommendations never return to Open: the page always filters by status, and the server's snooze-expiry rule applies only without a status filter; re-runs keep SNOOZED rows SNOOZED | `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:36`, `packages/api/src/services/advisor/advisorRecommendations.service.ts:165`, `packages/api/src/services/advisor/advisorEngine.service.ts:67` | Flip expired snoozes back to OPEN? |
| F-ADV-005 | Live recommendations that no rule re-emits stay OPEN indefinitely (no stale-close step) | `packages/api/src/services/advisor/advisorEngine.service.ts:236` | Close or supersede advice no longer produced? |
| F-ADV-002 | Age rules differ: web 18–100, server schema 0–120 and service rejects ≤0 or >120 | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `packages/api/src/controllers/advisor.controller.ts:64`, `packages/api/src/services/advisor/riskProfile.service.ts:167` | Align? |
| F-ADV-014 | Job comment says 22:30 IST; cron is 22:45 IST | `packages/api/src/jobs/fundScoring.job.ts:117` | Doc follows the cron |
| F-CA-002 | Defect: **Invite your own clients** and **See advisor plans** link to `/settings/billing`, which is not a route (falls to the not-found page) | `apps/web/src/pages/ca/CaWorkspacePage.tsx:83`, `apps/web/src/pages/ca/AcceptProfessionalInvitePage.tsx:135`, `apps/web/src/App.tsx:280` | Point to `/pricing`? |
| F-CA-015 | Defect: client report downloads are gated on the professional's own plan (TAX_REPORT_CATALOG Plus; ACCOUNTING_MODULE Pro/Advisor), contradicting "acting for a client who invited you is free" | `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:114`, `packages/api/src/middleware/requirePlan.ts:16`, `packages/api/src/routes/ca.routes.ts:78` | Gate client-context downloads on the client grant instead? |
| F-CA-004 | Account holders emailing their own invitation from Account Access (B06) hit the professional two-factor gate, because preview/send live on `/api/ca` behind `requireProfessionalSecondFactor` | `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:98`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:603` | Move the client-side send off the professional gate? |
| F-CA-005 | Accept page copy promises the professional can "keep your books: creating and editing vouchers…", but new grants are view-only (all edit flags default false) | `apps/web/src/pages/ca/AcceptCaInvitationPage.tsx:44`, `packages/api/prisma/schema.prisma:520` | Reword? |
| F-CA-012 | On correction, net amount = gross + charges only for BUY; SIP, SWITCH_IN and DIVIDEND_REINVEST get gross − charges | `packages/api/src/controllers/caAccounting.controller.ts:591` | Treat all purchase-type transactions like BUY? |
| F-CA-003 | Workspace error toasts use `e.message` (axios text) instead of the server message for close and create-invitation | `apps/web/src/pages/ca/CaWorkspacePage.tsx:62`, `apps/web/src/pages/ca/CaWorkspacePage.tsx:323` | Use `apiErrorMessage`? |
| F-CA-008 | Account, voucher and FMV deletes happen on one click with no confirmation | `apps/web/src/pages/ca/ClientBooksPage.tsx:381`, `apps/web/src/pages/ca/ClientBooksPage.tsx:484`, `apps/web/src/pages/ca/ClientBooksPage.tsx:653` | Add confirmation? |
| F-CA-017 | Activity summaries are written in the account holder's voice ("You granted your CA access…") but are also shown to the professional | `packages/api/src/services/ca/caAccess.service.ts:519` | Per-viewer wording? |
| F-SPLIT-001 | Friend totals silently drop a group's balance when no FX rate exists for that currency pair (only the "≈" marker is shown) | `packages/api/src/services/split/ledger.service.ts:58` | Show "rate unavailable"? |
| — | Module distinction not covered by global roles: a professional's four per-grant edit rights act like sub-roles of R-PROF | `packages/api/src/services/ca/caAccess.service.ts:116` | Keep as flags (documented per feature) |

### b03-family-succession

| F-FAM-014 | Defect: the visibility matrix tells owners "Empty = no restriction" and "Leave both lists empty to give a contributor or viewer full visibility", and new invitations default to empty lists; the server treats an empty list as deny-all, so a member invited with defaults sees none of the other members' data | `apps/web/src/pages/family/FamilyPage.tsx:1410`, `apps/web/src/pages/family/FamilyPage.tsx:1516`, `apps/web/src/pages/family/FamilyPage.tsx:1808`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `apps/web/src/pages/family/FamilyPage.tsx:1945`, `packages/api/src/services/family/familyScope.service.ts:208` | Fix the UI copy (and default to all), or change the server semantics? |
| F-FAM-004 | Confirmed (brief item): the family dashboard endpoints require the caller's own FAMILY plan; a FREE/PLUS member of someone else's family gets "This feature requires the FAMILY plan or higher". The UI wraps the Overview tab in a FAMILY lock card, so such a member sees "Family dashboard is locked" for a family they belong to | `packages/api/src/routes/families.routes.ts:463`, `packages/api/src/middleware/requirePlan.ts:18`, `apps/web/src/pages/family/FamilyPage.tsx:360` | Should membership in a FAMILY-plan family unlock the dashboard? |
| F-FAM-021 | Defect: the member page has no plan lock; for a FREE/PLUS member the 403 shows as "Couldn't load this member. You may no longer have permission to see them." | `packages/api/src/routes/families.routes.ts:487`, `apps/web/src/pages/family/FamilyMemberPage.tsx:222` | Show the plan lock card instead? |
| F-FAM-022 | Confirmed (brief item): schema comment says CONTRIBUTOR/VIEWER "never see another member's personal data (rule A locked in Phase 3)"; the code makes every active member readable to every role, filtered by caps. The Shared portfolios empty state also still says "Contributors and viewers can only see own personal + family-shared data (rule A)" and the page header says contributors/viewers see "own personal + family-shared" | `packages/api/prisma/schema.prisma:3752`, `packages/api/src/services/family/familyScope.service.ts:180`, `apps/web/src/pages/family/FamilyPage.tsx:126`, `apps/web/src/pages/family/FamilyPage.tsx:451` | Update the schema comment and UI copy to the current rule |
| F-FAM-023 | Defect: every sidebar family row links to `/family`, and `/family` always selects the first family; with two families, clicking the second family's name opens the first | `apps/web/src/components/layout/FamilyNavTree.tsx:180`, `apps/web/src/pages/family/FamilyPage.tsx:91` | Add the family id to the URL? |
| F-FAM-015 | Mismatch: the API lets a non-owner keeper hand a managed member to another keeper, but the **Edit** button that opens that control is owner-only; the hand-over email send step also requires an owner while the claim invitation itself allows the keeper | `packages/api/src/services/family/family.service.ts:1295`, `apps/web/src/components/family/FamilyTreeBoard.tsx:500`, `packages/api/src/services/family/familyClaim.service.ts:81`, `packages/api/src/services/family/familyInviteEmail.service.ts:119` | Expose keeper actions to keepers? |
| F-FAM-024 | Minor: the web client's account-route list omits `/api/legacy`, so the Succession page sends `X-Act-As` while managing and shows the server's refusal instead of a friendly guard (Will Maker has one) | `apps/web/src/stores/actingAs.store.ts:47`, `packages/api/src/services/family/managedProfile.service.ts:49`, `apps/web/src/pages/legacy/LegacyPage.tsx:80` | Add a WillGate-style guard to Succession? |
| F-FAM-019 | Minor: after accepting an invitation the app navigates to **Settings**, not to the family | `apps/web/src/pages/family/AcceptInvitationPage.tsx:47` | Intended? |
| F-SUCC-004 | Minor: removing the last nominee of a running plan is allowed; the plan keeps counting with nobody to notify | `packages/api/src/services/legacy/plan.service.ts:210` | Block it or turn the plan off? |
| S-SUCC-010 | Nominee **Priority** only orders lists and emails; no behaviour depends on it | `packages/api/src/services/legacy/runner.service.ts:22` | Is a priority-based release planned? |
| F-SUCC-008 | Investments shown to nominees include holdings in family-shared portfolios the owner created | `packages/api/src/services/legacy/view.service.ts:47` | Should shared family pots be excluded? |

## Hidden, partial, backend-only, deprecated features

### b06-account-access

| F-AUTH-009 | Sign out everywhere (`everywhere: true` on logout) — no UI, and cannot work because the route lacks authentication | Backend-only | `packages/api/src/controllers/auth.controller.ts:158` |
| F-SET-015 | Per-user SMTP config (`GET/PUT/DELETE /api/notifications/config`): app password stored encrypted, host derived from the email domain (Gmail, Outlook, Yahoo, iCloud, Zoho only); no web page calls it and the test email refuses SMTP | Backend-only | `packages/api/src/routes/notifications.routes.ts:17`, `packages/api/src/services/notifications/config.service.ts:33`, `packages/api/src/services/notifications/config.service.ts:214` |
| F-CONN-006 | MCP server `/mcp`, OAuth `/oauth/register|authorize|token|revoke`, `/.well-known/oauth-*` — called by ChatGPT/Claude; 404 unless MCP_ENABLED=true and API_PUBLIC_URL set; tokens: access 1 hour, refresh 30 days with reuse detection; 60 calls/minute and 2000/day per connection; daily cleanup 03:40 IST | Backend-only | `packages/api/src/routes/mcpOAuth.routes.ts:9`, `packages/api/src/services/mcp/oauth.service.ts:24`, `packages/api/src/middleware/rateLimit.ts:310`, `packages/api/src/jobs/mcpCleanupJob.ts:11` |
| F-CONN-010 | Finfactor webhooks `/api/integrations/finfactor/webhook/{consent,data,historical,cohort,subscription}` — HMAC-verified; only `consent` changes data (AaConsent status) | Backend-only | `packages/api/src/routes/finfactor.routes.ts:75`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:36` |
| F-LEGAL-002 | Browser extension privacy policy at `/privacy` — public, no link anywhere in the web app | Hidden | `apps/web/src/App.tsx:114` |
| F-SET-009 | Invite a professional — Partial: the invitation is created, but delivering it (email or link) needs a two-factor session | Partial | `packages/api/src/routes/ca.routes.ts:73` |
| F-CONN-008 | Legacy broker connections — labelled "deprecated" in the UI; no way to create new ones | Live (deprecated) | `apps/web/src/pages/connectors/ConnectorsPage.tsx:342` |

### b10-core-shell

| F-SHELL-011 | `PlaceholderPage` ("<title> — coming in a later phase") — imported in the route file but never rendered; dead code | Hidden | `apps/web/src/App.tsx:14`, `apps/web/src/pages/PlaceholderPage.tsx:5` |
| F-PORT-010 | `/api/corporate-actions` — enriched corporate-actions report (GET, filters portfolio/type/status), NSE sync (POST /sync), apply to my holdings (POST /apply); no web caller | Backend-only | `packages/api/src/routes/corporateActions.routes.ts:15`, `packages/api/src/controllers/corporateActions.controller.ts:36` |
| F-PORT-011 | `/api/assets/sync-all`, `/sync-prices`, `/sync-universe`, `/sync-corp-actions`, `/sync-commodities`, `/sync-crypto`, `/sync-fx`, `/amfi/refresh-holdings` — manual market-data syncs with no web caller (only `/amfi/sync` is used, from Mutual Funds) | Backend-only | `packages/api/src/routes/assets.routes.ts:46`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:76` |
| F-DASH-018 | `POST /api/intelligence/net-worth/snapshot` — take today's snapshot on demand; no web caller (the nightly job is live) | Backend-only endpoint of a Live feature | `packages/api/src/routes/intelligence.routes.ts:17` |
| F-SHELL-001 | LLM spend gauge ("LLM spend (mo)") in the sidebar footer — commented out | Hidden | `apps/web/src/components/layout/SidebarNav.tsx:190`, `apps/web/src/components/layout/BudgetGauge.tsx:11` |

### b07-data-in

| F-IMPORT-011 | Ingestion failures page `/import/failures` (also `/ops/ingestion-failures`): unresolved/resolved/all filters, adapter filter, cursor paging (50), detail with stack and raw payload, **Retry parse** for gmail.*/email.* adapters, **Mark as resolved** (Entered manually, Retried successfully, Ignored, Fixed externally, Data corrected & re-uploaded) | Hidden — nav item and Import page link commented out | `apps/web/src/components/layout/navItems.tsx:122`, `apps/web/src/pages/imports/ImportPage.tsx:137`, `apps/web/src/App.tsx:262`, `apps/web/src/pages/imports/FailuresPage.tsx:127` |
| F-IMPORT-012 | "Market data & scoring failures" card (global feed runs with FAILED/REFUSED status) | Hidden (only on the hidden page) | `apps/web/src/pages/imports/FailuresPage.tsx:455` |
| F-IMPORT-013 | GET one import job | Backend-only (`importsApi.get` has no caller) | `packages/api/src/routes/imports.routes.ts:26` |
| F-INGEST-010 | Edit/read one event (`PATCH`/`GET /api/canonical-events/:id`) — type, date, amount, quantity, price, counterparty, instrument, portfolio | Backend-only | `packages/api/src/controllers/canonicalEvents.controller.ts:35` |
| F-INGEST-011 | LLM spend gauge in the sidebar and `GET /api/ingestion/budget` | Hidden (component commented out) | `apps/web/src/components/layout/SidebarNav.tsx:190` |
| F-INGEST-012 | Auto-discovery after connect (`/ingestion?auto-discover=1` auto-runs the scan and preselects seed matches and scores ≥ 4) | Hidden — nothing links with this parameter (the callback goes to `/gmail/scan-setup`) | `apps/web/src/pages/ingestion/IngestionPage.tsx:60`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:55` |
| F-MAIL-008 | `MailboxesPage` ("Email Inbox Gateway": IMAP accounts, test, sync) — imported in App.tsx but never routed; `/mailboxes` redirects. IMAP create/test/update/delete endpoints have no live caller; existing IMAP rows are still polled | Hidden (dead page) | `apps/web/src/App.tsx:37`, `apps/web/src/App.tsx:268`, `apps/web/src/pages/mailboxes/MailboxesPage.tsx:123`, `packages/api/src/jobs/mailboxPoller.ts:228` |
| F-MAIL-009 | `POST /api/gmail/:id/sync` (used only by the dead page) | Backend-only | `packages/api/src/routes/gmail.routes.ts:19` |
| F-MAIL-010 | Inbox scan cancel/resume, auto-approve rule list/create/delete endpoints | Backend-only (rules are created only via approve-with-rule from Reports) | `packages/api/src/routes/gmailScan.routes.ts:31`, `packages/api/src/routes/gmailScan.routes.ts:44` |

### b02-mutual-funds

| F-MF-009 | Finvu sandbox explorer — operator tool on a user page, demo payloads | Partial | `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:1` |
| F-MF-010 | Finvu import — no consent ownership check, see ambiguities | Partial | `packages/api/src/ingestion/finfactor/sync.service.ts:135` |
| F-MF-024 | MF qualitative facts admin page (`/admin/mf-qualitative-facts`): no navigation link; ADMIN only, no two-factor. Form: **Fact type** (Regulatory action against the AMC, Front-running finding against the AMC, Strategy capacity cap, AUM shock), **Applies to** (Specific scheme codes / Every ACTIVE scheme of an AMC), **Valid from**, **Valid to (optional)**, **Source (required)** (min 8 characters), **Details (JSON)**, **Record fact**; list with **Scheme code** / **AMC code** filters, **Include expired**, delete with confirm. Entries change every user's scores | Hidden | `apps/web/src/App.tsx:203`, `apps/web/src/pages/mf/QualitativeFactsAdminPage.tsx:204`, `packages/api/src/routes/mfQualitativeFacts.routes.ts:48`, `packages/api/src/controllers/mfQualitativeFacts.controller.ts:135` |
| F-MF-025 | MF Central OTP sync: `MFCentralSyncDialog` is never imported; backend routes remain | Hidden | `apps/web/src/pages/mutualFunds/MFCentralSyncDialog.tsx:52`, `packages/api/src/routes/mfCentral.routes.ts:14` |
| F-MF-026 | CDSL CAS via CASParser OTP: client methods exist but no component calls them | Backend-only | `packages/api/src/routes/mfCasparser.routes.ts:15`, `apps/web/src/api/mf/mfCasparser.api.ts:55` |
| F-MF-027 | CAS mailback job list/detail: no UI | Backend-only | `packages/api/src/routes/mfCasMailback.routes.ts:16` |
| F-MF-028 | Per-scheme reference reads (meta, metrics, score, peers, holdings): client methods unused by pages | Backend-only | `packages/api/src/routes/mfAnalytics.routes.ts:65` |
| F-MF-029 | Qualitative fact PATCH: no edit UI (the page only creates and deletes) | Backend-only | `packages/api/src/routes/mfQualitativeFacts.routes.ts:64` |
| F-MF-030 | Finvu holding by ISIN endpoint: no web caller | Backend-only | `packages/api/src/routes/finfactor.routes.ts:51` |

### b01-asset-classes

| F-FNO-009 | Broker sync for Upstox / Angel One | Partial (backend only; UI syncs Zerodha only) | `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343` |
| F-FNO-010 | F&O portfolio settings (auto-approve expiry close, default equity tax treatment) | Backend-only | `packages/api/src/routes/fo.routes.ts:54` |
| F-FNO-011 | Option chain and margin endpoints | Backend-only (foApi.optionChain / foApi.margin have no caller) | `packages/api/src/routes/fo.routes.ts:45`, `apps/web/src/api/fo.api.ts:93` |
| F-FNO-012 | Underlying Activity panel | Hidden (component defined, never rendered) | `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:844` |
| F-ASSET-001 | /api/assets sync and lookup endpoints | Backend-only (no B01 caller; `amfi/sync` is used by B02, `funds/:id/nav` by onboarding, portfolio refresh by B10) | `packages/api/src/routes/assets.routes.ts:46` |
| F-ASSET-002 | GoldAssetDetailSheet | Hidden (exported, never imported) | `apps/web/src/pages/assetClasses/GoldAssetDetailSheet.tsx:92` |

### b04-loans-cards

| F-LOAN-011 | Linked vehicle / property cards | Partial — rendering exists, no UI sets the link | `apps/web/src/pages/loans/LoanDetailPage.tsx:1221` |
| F-LOAN-014 | Loan account number reveal (`POST /api/loans/:id/reveal-account`) | Backend-only — no web caller | `packages/api/src/routes/loans.routes.ts:44` |
| F-LOAN-015 | Compute EMI (`GET /api/loans/compute-emi`) | Backend-only — the web computes EMI locally | `packages/api/src/routes/loans.routes.ts:24` |
| — | Card `outstandingBalance` field on create/update | Backend-only input — accepted by the API, never sent by the web | `packages/api/src/controllers/creditCards.controller.ts:33` |
| — | Statement `paidAmount` / `paidOn` / `status` / `canonicalEventId` on create, loan payment `canonicalEventId`, loan `closedDate` / `lenderMatchKey` | Backend-only inputs — no web form sends them | `packages/api/src/controllers/creditCards.controller.ts:48`, `packages/api/src/controllers/loans.controller.ts:49` |

### b05-property-vehicles

| F-VEH-017 | Linked insurance policies are returned with a vehicle (insurer, type, plan, last 4, next premium, status) but never rendered on the vehicle page | Hidden | `packages/api/src/services/vehicles/vehicles.service.ts:129`, `apps/web/src/api/vehicles.api.ts:62` |
| F-VEH-018 | Vehicle fields the API accepts but no form sets: model, fuel type, owner name, purchase date, purchase price, current value (except via valuation save), current-value source, permit expiry, registration number change | Backend-only | `packages/api/src/controllers/vehicles.controller.ts:32`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:374` |
| F-VEH-019 | Parivahan portal OTP adapter (headed browser): disabled in production unless `ENABLE_PARIVAHAN_PORTAL_ADAPTER=true`; without `USE_PORTAL_BROWSER=true` it reads a fixture file; never used by the daily job | Hidden | `packages/api/src/ingestion/vehicle/portal.ts:35`, `packages/api/src/ingestion/vehicle/portal.ts:219`, `packages/api/src/ingestion/vehicle/portal.ts:278` |
| F-REST-013 | Linked loan / insurance on a property: shown when present, but no UI sets them (only the rental link via **Make rental**) | Partial | `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:387`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:103` |
| F-REST-014 | `GET /api/real-estate/summary` — used only by the sidebar value (B10), not by B05 pages | Backend-only | `packages/api/src/routes/realEstate.routes.ts:22`, `apps/web/src/hooks/useSidebarClassValues.ts:29` |
| F-RENT-020 | Edit tenancy terms (rent, end date, due day, notes, active), end a tenancy, delete a tenancy: API exists (`PATCH`/`DELETE /api/rental/tenancies/:id`), web client has `deleteTenancy` but no page calls it; the web only patches contact and bank account | Backend-only | `packages/api/src/routes/rental.routes.ts:57`, `packages/api/src/services/rental/rental.service.ts:463`, `packages/api/src/services/rental/rental.service.ts:634`, `apps/web/src/api/rental/rental.api.ts:278` |
| F-RENT-021 | Landlord name and payment instructions per rental property, and per-account payment instructions, feed reminder text but have no UI | Backend-only | `packages/api/src/controllers/rental.controller.ts:40`, `packages/api/src/services/rental/rental.reminders.service.ts:189`, `packages/api/src/services/notifications/config.service.ts:190` |
| F-RENT-022 | `GET /api/rental/receipts`, `GET /api/rental/expenses`, `POST /api/rental/receipts/mark-overdue`, `PATCH /api/rental/entries/:id` — client methods exist, no page calls them | Backend-only | `packages/api/src/routes/rental.routes.ts:61`, `packages/api/src/routes/rental.routes.ts:67`, `packages/api/src/routes/rental.routes.ts:70`, `packages/api/src/routes/rental.routes.ts:54` |

### b11-money-misc

| F-INS-024 | Account Aggregator (Finvu) insurance card and views — not imported by any page | Hidden | `apps/web/src/pages/insurance/FinvuInsuranceCard.tsx:35` |
| F-INS-025 | Insurance alerts trigger route; policy status, health-cover details, vehicle and portfolio fields settable only via API | Backend-only | `packages/api/src/routes/insurance.routes.ts:82` |
| F-PF-011 | UAN lookup (5/day), forget saved credentials, extension-facing routes (pair-complete, me, raw-payload, revoke) | Backend-only | `packages/api/src/routes/pf.routes.ts:85` |
| F-FX-009 | TCS credit create/delete, balance account-number reveal (not rate-limited or audited), currencies list, `?fy=` filters | Backend-only | `packages/api/src/routes/forex.routes.ts:49` |
| F-GOAL-004 | Read one goal (`GET /api/goals/:id`) | Backend-only | `packages/api/src/routes/goals.routes.ts:13` |
| F-INC-004 | Read one income entry (`GET /api/income/:id`) | Backend-only | `packages/api/src/routes/income.routes.ts:14` |
| F-ACCT-014 | Edit account, read/edit voucher, suggest voucher from a transaction | Backend-only | `packages/api/src/routes/accounting.routes.ts:52` |
| F-PF-006 | Portal refresh — imports rows but doesn't update balance or holdings | Partial | `packages/api/src/ingestion/projection.ts:549` |
| F-PF-007 | Passbook upload — same limitation | Partial | `packages/api/src/controllers/pf.controller.ts:360` |
| F-PF-008 | EPFO password reset — never starts from the web app | Partial | `packages/api/src/controllers/pf.controller.ts:244` |
| F-FX-008 | TCS credits — list only, no way to add | Partial | `apps/web/src/pages/forex/LrsTab.tsx:217` |

### b08-reports-tax

| F-REPORT-018 | `POST /api/reports/rebuild-capital-gains`, JSON `/api/reports/grandfathering`, `/demat-holdings`, `/m2m`, and `/statement/provident-fund`, `/fy-bundle` (called only from the CA workspace, D-REPORT-006) | Backend-only (in this scope) | `packages/api/src/routes/reports.routes.ts:97`, `packages/api/src/routes/reports.routes.ts:114`, `packages/api/src/routes/reports.routes.ts:117` |
| F-TAX-011 | `GET /api/tax/schedule-112a.csv` (subject-aware; the URL helper exists but no button uses it) and `GET /api/tax/fmv-overrides` | Backend-only | `packages/api/src/routes/tax.routes.ts:42`, `apps/web/src/api/tax.api.ts:270` |
| F-ANLYT-014 | `GET /api/analytics/benchmark` (NIFTY 50 + Sensex rebased to 100) — the web client has no caller | Backend-only | `packages/api/src/routes/analytics.routes.ts:25` |
| — | `GET /api/reports/xirr/user` is used by the dashboard (B10), not by these pages | Out of scope | `apps/web/src/pages/dashboard/DashboardPage.tsx:414` |

### b09-advice-pro

| F-ADV-011 | Reorder override list (`PUT /api/advisor/approved-products/order`) | Backend-only — client helper exists, no caller | `packages/api/src/routes/advisor.routes.ts:58` |
| F-ADV-012 | Model portfolios list / edit target weights | Backend-only — no page edits targets | `packages/api/src/routes/advisor.routes.ts:65` |
| F-ADV-013 | Engine run history (`GET /api/advisor/runs`) | Backend-only | `packages/api/src/routes/advisor.routes.ts:39` |
| F-CA-018 | Records for clients without a login (SHADOW) | Deprecated — creation always refused; existing rows stay readable; CA may reinstate a revoked SHADOW record via API | `packages/api/src/services/ca/caAccess.service.ts:322`, `packages/api/src/routes/ca.routes.ts:103` |
| F-CA-019 | Ledger, P&L, balance sheet, voucher detail/edit, accounts tree | Backend-only for the workspace (reports cover P&L/balance sheet as downloads) | `packages/api/src/routes/ca.routes.ts:164` |
| F-SPLIT-020 | Contact edit/delete, contact UPI ID, settlement edit, group-type change, deleted-expense listing, label delete | Backend-only | `packages/api/src/routes/split.routes.ts:16`, `packages/api/src/routes/split.routes.ts:40` |
| — | `SplitSettings.detectEmail/detectPaste/detectReceipt/detectSms` columns | Hidden — schema only, no API or UI | `packages/api/prisma/schema.prisma:5437` |
| — | Advisor risk-assessment history (returned with the profile) | Hidden — not rendered | `packages/api/src/controllers/advisor.controller.ts:171` |

### b03-family-succession

| F-FAM-025 | Rename / re-describe a family (`PATCH /api/families/:familyId`) | Backend-only — client method exists, no caller | `packages/api/src/routes/families.routes.ts:187`, `apps/web/src/api/family/families.api.ts:170` |
| F-FAM-026 | Leave a family (`POST /api/families/:familyId/leave`) | Backend-only — no caller; removing yourself in the UI is refused with "Use \"leave family\" to revoke your own access." | `packages/api/src/routes/families.routes.ts:228`, `apps/web/src/api/family/families.api.ts:204` |
| F-FAM-027 | Unshare a family portfolio (`POST …/portfolios/:portfolioId/unshare`) | Backend-only — no caller | `packages/api/src/routes/families.routes.ts:402`, `apps/web/src/api/family/families.api.ts:327` |

## UI / API permission mismatches

### b06-account-access

| F-SET-009 | Account Access is open to every plan without two-factor | Its email step requires the professional two-factor session | `packages/api/src/routes/ca.routes.ts:73` |
| F-CONN-009 | Finvu card buttons enabled for Free | Consent endpoints require PLUS | `packages/api/src/routes/finfactor.routes.ts:42` |
| F-CONN-006 | After a lapse the AI connectors page locks connect and hides Edit sharing | `/mcp` keeps serving the lapsed user's chatbot | `packages/api/src/routes/mcp.routes.ts:48` |
| F-SET-014 | Loan rates card shown by a browser role check | Server: ADMIN + two-factor; non-admin gets 401 not 403 | `apps/web/src/pages/settings/SettingsPage.tsx:176`, `packages/api/src/middleware/authenticate.ts:95` |
| F-PLAN-002 | Lower-tier "Upgrade to …" buttons enabled for paid users | Server accepts any tier | `apps/web/src/pages/pricing/PricingPage.tsx:217` |

### b10-core-shell

| F-BANK-002 | Customer ID is required ("Required") | Optional (`customerId` nullable) | `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:327`, `packages/api/src/controllers/bankAccounts.controller.ts:34` |
| F-TXN-001 | Family view lists other members' transactions and opens them for editing | Edits and deletes are refused unless you created the portfolio ("Forbidden") | `apps/web/src/pages/transactions/TransactionsPage.tsx:163`, `packages/api/src/services/holdings/transaction.service.ts:107` |
| F-TXN-002 | Global roles describe contributors/owners as able to write family-shared portfolios | Transaction writes require the portfolio's creator | `packages/api/src/services/holdings/transaction.service.ts:107`, `packages/api/src/services/holdings/portfolio.service.ts:226` |
| F-PORT-005 | **Refresh prices** is shown on any portfolio you can open, including family members' | Refused with "Portfolio not found" unless you created it | `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:125`, `packages/api/src/controllers/assets.controller.ts:80` |
| F-AI-003 | Panel works for a managing user (sessions created as the managed person) | Chat runs as the manager and rejects the session | `apps/web/src/api/aiAssistant.api.ts:118`, `packages/api/src/ai/chatSessions.ts:51` |

### b07-data-in

| F-INGEST-001 | While managing a family member, the ingestion page still shows Connect Gmail, discovery and the sender/event lists | `/api/gmail` and `/api/mailboxes` refuse ("Switch back to your own account to do this."), but `/api/monitored-senders` and `/api/canonical-events` accept and act on the managed person, who has no Gmail | `packages/api/src/services/family/managedProfile.service.ts:45` |
| F-INGEST-006 | Senders page help says auto-commit is offered after N approvals | API creates senders with auto-commit already on, bypassing its own threshold guard | `packages/api/src/services/gmail/monitoredSenders.service.ts:99` |
| F-IMPORT-012 | (Hidden page) card says these failures "affect every account" | Endpoint returns global rows to any signed-in user by design | `packages/api/src/controllers/ingestionFailures.controller.ts:51` |

### b02-mutual-funds

| F-MF-009 | Finvu card and buttons shown to Free users | 403 "This feature requires the PLUS plan or higher" | `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:542`, `packages/api/src/routes/finfactor.routes.ts:42` |
| F-MF-024 | Non-admin sees "This page is restricted to administrators." | 401 "Insufficient role" (not 403); admins need no two-factor here unlike other admin tools | `apps/web/src/pages/mf/QualitativeFactsAdminPage.tsx:204`, `packages/api/src/routes/mfQualitativeFacts.routes.ts:48` |
| F-MF-006 | Managing mode dialog shows the manager's PAN | Mailback uses the managed person's PAN | `packages/api/src/services/family/managedProfile.service.ts:37` |

### b01-asset-classes

| F-FD-003 | In family view the portfolio pickers list family portfolios | Saving to a portfolio not owned by the caller returns "Forbidden", including family-shared portfolios a contributor is said to be able to write | `packages/api/src/services/holdings/transaction.service.ts:107` |
| F-FNO-001 | F&O page uses the same family header as other pages | F&O endpoints filter by the caller's own user id; family view shows only your own F&O | `packages/api/src/controllers/fo.controller.ts:30` |
| F-STOCK-003 | Button reads as refreshing your prices | Endpoint refreshes every user's holdings | `packages/api/src/controllers/assets.controller.ts:89` |

### b04-loans-cards

| F-CARD-002 | Status offers Active / Blocked / Closed | API also accepts `INACTIVE`, which the list treats as not active | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/services/banking/creditCards.service.ts:26` |

### b05-property-vehicles

| F-RENT-020 | No way to change rent, end or delete a tenancy | Owner may do all of these via the API | `packages/api/src/routes/rental.routes.ts:57`, `packages/api/src/routes/rental.routes.ts:58` |
| F-REST-004 | Not-yours owned property → "Property not found" | Owned property routes answer 404, while vehicle/rental routes answer 403 Forbidden for another user's record | `packages/api/src/services/realEstate/realEstate.service.ts:136`, `packages/api/src/services/vehicles/vehicles.service.ts:135` |
| F-RENT-016 | Managing a family member: the panel lets you approve email reminders | Email sends through the managed person's Gmail connection, which cannot be set while managing (`/api/gmail` is an account route) — sends fail "gmail_not_connected" unless that person connected Gmail themselves | `packages/api/src/services/rental/rental.reminders.service.ts:584`, `packages/api/src/middleware/authenticate.ts:47` |

### b11-money-misc

| F-GOAL-002 | **New goal** button is outside the plan lock; Free users can open the form | `POST /api/goals` refuses below Plus | `apps/web/src/pages/goals/GoalsPage.tsx:82`, `packages/api/src/routes/goals.routes.ts:9` |
| F-ACCT-001 | Locked Accounting content is rendered (blurred) and still requests data | Every `/api/accounting` call returns 403 below Pro/Advisor | `apps/web/src/components/common/LockedFeature.tsx:99` |

### b08-reports-tax

| F-TAX-007 | F&O tab visible on all plans | 403 below PRO_ADVISOR; blank tab | `packages/api/src/routes/tax.routes.ts:39` |
| F-ANLYT-004 | Insights panel rendered (blurred) for Free | 403 on insights endpoints | `apps/web/src/components/common/LockedFeature.tsx:99`, `packages/api/src/routes/analytics.routes.ts:32` |
| F-REPORT-001 | Family-view portfolio list offers other members' portfolios | 403 for portfolios not owned by caller | `packages/api/src/controllers/reports.controller.ts:93` |

### b09-advice-pro

| F-CA-015 | Reports tab offered to every professional | Downloads refused below Plus (catalogue) / Pro/Advisor (accounting) | `apps/web/src/components/ca/ClientReportsTab.tsx:81`, `packages/api/src/routes/reports.routes.ts:85` |
| F-CA-004 | Account Access offers **Send email** to every account holder (B06) | Send/preview require professional two-factor | `packages/api/src/routes/ca.routes.ts:73` |
| F-CA-001 | Sidebar comment says the entry shows for "someone who… pays for the advisor plan" | Entry shows only when client rows exist | `apps/web/src/components/layout/SidebarNav.tsx:157`, `apps/web/src/components/layout/SidebarNav.tsx:170` |

### b03-family-succession

| F-FAM-014 | "Empty = no restriction" | Empty = deny-all | `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/familyScope.service.ts:208` |
| F-FAM-015 | Keeper change only via owner-only **Edit** | Current keeper allowed | `apps/web/src/components/family/FamilyTreeBoard.tsx:500`, `packages/api/src/services/family/family.service.ts:1295` |
| F-FAM-021 | Member page not plan-locked | Requires caller's FAMILY plan | `apps/web/src/pages/family/FamilyMemberPage.tsx:222`, `packages/api/src/routes/families.routes.ts:487` |

## Choices made without asking

### b06-account-access

| Documented the code at 9d9025c4 even where a fix PR is in flight | Wait for the fix | The brief says to document this commit |
| Put Account Access under the SET prefix as its own chapter | A separate prefix | The brief lists only AUTH, ONB, SET, PLAN, LEGAL, CONN for B06 |
| Put the not-found page under AUTH (F-AUTH-010) | LEGAL or a new prefix | It belongs to the signed-in routing; no NOTFOUND prefix exists |
| Documented the header Sign out and desktop-app link here | Leave to B10 | The brief assigns session handling and the desktop download button to B06 |
| Marked `/privacy` Hidden and kept it out of the end-user chapters except a pointer | Live | It has no in-app link |
| Listed the full PAN reveal endpoint as a dependency (D-AUTH-002) instead of a feature | Separate feature | Its only UI is the B02 dialog |
| Security, key-rotation, PII backfill and startup jobs only in operator configuration | Features | Brief: operator-config only; no user-visible effect except the security emails (F-AUTH-008) |

### b10-core-shell

| Background jobs (price feeds, corporate-action application, net-worth snapshot, alert scan) documented as Live features with "Where to find it" pointing to the screens their results reach | Operator-config only | The brief assigns them to B10 and users see their effects |
| Price-feed and corporate-action features filed under Portfolios (PORT) | A separate module | Only the brief's prefixes may be used; they value portfolio holdings |
| Dashboard widgets rendered from other folders (FX strip, tax strip, Gmail cards, export dialog) documented here; Portfolio Score card, family banner, Switch view, managed accounts, desktop download, Gmail banner listed as dependencies | Leave all to owning batches | Brief rule: a feature belongs to the batch whose route renders it, except items the brief or modules.md assigned elsewhere |
| Sign out documented as a control of the header (F-SHELL-005); session refresh/expiry left to B06 | Separate feature | modules.md assigns session handling to B06 |
| Transaction photo endpoints (`/api/transactions/:id/photos`) not documented as a B10 feature | Separate feature | Only Gold pages (B01) call them |
| AI Assistant listed as usable by Free (preview) to Pro; the floating button's disabled-server behaviour documented as a defect | Treat the assistant as operator-only | It is wired end to end and reachable by every user |

### b07-data-in

| Split B07 into five chapters: Import (IMPORT), Email ingestion (INGEST), Gmail connection and inbox scans (MAIL), CAS (CAS), Documents (DOCS) | One "Data in" chapter | Mirrors the sidebar entries and keeps feature IDs per area |
| Documented the Gmail auto-connect banner and the scan shortcut (ScanContext) under MAIL; the **Scan inbox** button itself lives on B02's Mutual Funds page | Leave the shortcut to B02 | Brief assigns the scan context to B07; B02 lists it as a dependency |
| The inbox-scan approval screen (**Reports → Inbox imports**) is left to B08 and listed as D-MAIL-001; B07 documents the scan pipeline behind it | Document the tab here | Route ownership: `/reports` belongs to B08 |
| `/import/failures` documented as Hidden (inventory + gaps only), not as a user-manual feature | Full manual section | Skill rule: Hidden features are not taught to users; it is unreachable from the UI |
| IMAP mailboxes (dead MailboxesPage) folded into one Hidden row F-MAIL-008 | Separate rows per endpoint | No UI caller exists; only the poller still uses existing rows |
| Confirmed B02's open question (F-MF-003 auto-tried passwords): profile PAN, PAN+DOB variants, DOB formats, email, phone, plus saved file passwords | — | Traced in `packages/api/src/lib/pdf.ts:92` and `packages/api/src/lib/decryptIfNeeded.ts:187` |
| No new R- IDs; family-view roles marked "Same as base plan" | — | Every endpoint here filters by the signed-in user id |

### b02-mutual-funds

| Split B02 into two modules: Mutual Funds (holdings and imports) and Mutual Fund Analytics | One module | The analytics pages are plan-gated and conceptually separate |
| Marked the Finvu card and import Partial rather than Live | Live | It is an operator sandbox with demo payloads and no consent binding |
| Marked the admin facts page Hidden (documented in gaps, not taught in the manual); no S- IDs for its controls | Document as a feature | modules.md classifies it Hidden; no nav entry |
| Documented the Scan inbox button as an in-scope trigger and the scan itself as D-MF-004 | Dependency only | The button lives on the MF page |
| Did not document the mailback/import pipeline internals (owned by B07) | Trace fully | Brief assigns import pipeline to B07 |
| Summarised the 33 rule checks by category instead of listing each rule | Full rule list | Rules are internal; the UI shows each finding's own headline and evidence |

### b01-asset-classes

| One chapter per sidebar page (Stocks, F&O, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Others) plus a short shared "How asset-class pages work" chapter, with sub-prefixes STOCK, FNO, BOND, FD, GOLD, CRYPTO, NPS, PO, OTHER and ASSET for shared items | One ASSET chapter | Mirrors the navigation |
| Mutual Funds (B02), PPF & EPF and Forex (B11) only as dependencies; shared files PPFNpsFormDialog/EPFFormDialog documented here for NPS only | Document them here | Wave-0 ownership overrides |
| Stock add/edit form documented as dependency D-ASSET-002 (B10) | Document fully here | It is the Transactions module's shared form |
| F-FNO-009 marked Partial | Live | Server supports three brokers, UI syncs one |
| Dead components (GoldAssetDetailSheet, UnderlyingActivity) recorded as Hidden inventory rows | Omit | Traceability |
| R-MANAGER behaviour taken from global roles.md (data routes act on the managed person) without re-tracing authenticate | Re-trace | Owned by B03/global |

### b04-loans-cards

| Three modules: Loans (taken + given share one page and the LOAN prefix), EMI Calculator, Credit Cards | Separate "Loans given" module | Loans given render inside the `/loans` route and the brief assigns LOAN/EMI/CARD |
| Documented the daily rate refresh (F-EMI-010) and loan checks (F-LOAN-013) here; the admin rate page is D-EMI-001 (B06) | Leave jobs to B06 | Their only user-visible effect is in these modules |
| Documented **Loan rate alerts** as a dependency (D-LOAN-002), not an S- setting | Own S- ID | The control lives on B06's Settings page |
| Gave the per-visit switching-cost fields an S- ID (S-LOAN-009) | Treat as plain fields | They change computed results and defaults matter |
| Marked F-LOAN-013, F-EMI-007, F-EMI-010 doc status Gaps | Verified | Behaviour depends on live third-party pages and production data |
| Documented the Loans page as reflecting PR #296 (commit fce9d649): Default stamp, overdue EMI alerts, foreclosure close/reopen, edit/undo fixes | — | Brief instruction |

### b05-property-vehicles

| Property photos (F-REST-010), location pin (F-REST-011) and grid/map view (F-REST-002) are documented once under Real Estate IDs and cross-referenced from Rental | Duplicate under RENT IDs | Same shared components and endpoints; one definition avoids drift |
| Automatic jobs and alerts (vehicle refresh, challan scan, expiry/property/rent alerts, reminder scan) are Live features in this batch | Leave to B10 Alerts | Their logic lives in B05 services; the Alerts page itself is a dependency (D-VEH-002, D-REST-002) |
| `/vehicles/value` valuation, catalogue endpoints and the fuel-price card are documented in Vehicles | Separate module | They are reached only from the Vehicles pages |
| The document vault on property pages is a dependency (D-REST-003), not documented | Document here | Shared component owned by the documents area |
| Linked loan/insurance on a property marked Partial | Hidden | The links render and work when present, but cannot be created in the UI |
| No new R- IDs; the Vehicles "Family" grouping and family view behaviour recorded as notes | Define a household role | Brief forbids new R- IDs; behaviour fits existing roles |
| Doc status "Gaps" for features whose behaviour depends on third-party sites or live credentials | Verified | Code was read fully, but production outcome cannot be confirmed code-only |

### b11-money-misc

| Documented the PPF & EPF page's shared asset-page parts (summary strip, transactions table) at the level needed for PF and pointed to B01 for the component (D-PF-001) | Full re-documentation of the shared page | Override assigned `/provident-fund` to B11; the component itself is B01's |
| Treated the EPF/PPF entry forms as B11 features and the NPS mode of the same dialog as B01 (D-PF-003) | Split by file | Brief assignment: B11 documents them for PF, B01 for NPS |
| Listed the dashboard FX strip as a dependency (D-FX-002) though its file is in `pages/forex` | Document it here | It renders on the dashboard route (B10 owns it as F-DASH-006) |
| Documented **Export to Tally** button behaviour here and pointed to B08 for the Reports-tab copy | Leave all to B08 | The button is rendered on `/accounting`; B04/B05/B08 dependency rows point Tally to B11 |
| Marked defects that leave a feature usable as Live (e.g. F-FX-007) and features that can't achieve their purpose as Partial (F-PF-006/007/008) | Mark all defective features Partial | Live = reachable and wired; Partial = cannot complete its stated outcome |
| Left backend-only endpoints out of the user manual (inventory + gaps only) | Manual sections | Skill rule: only Live/Partial are taught to users |

### b08-reports-tax

| Documented the shared **Download Report** dialog (F-REPORT-016) here, though it renders on other batches' pages | Leave to each page's batch | B02 already cites it as a B08 dependency; one description avoids 15 copies |
| Grouped the 34 Plus catalog reports into one feature (F-REPORT-013) and the 6 accounting reports into another | One feature per report | They share inputs, gate and download behaviour; each is named with its on-screen description |
| Treated `/api/intelligence/net-worth/*` as B10's (dashboard) and listed them as a dependency | Document here | Brief assigns net-worth snapshot job to B10 |
| Inbox imports tab documented here (it renders on `/reports`) with backend as a B07 dependency | Leave to B07 | Route ownership rule |
| Used the role "Same as base plan / Own figures only" for family overlays on screen | Mark as family data | Reports/analytics endpoints read the caller's own data only |

### b09-advice-pro

| Documented the six advisor rules inside F-ADV-005 rather than as six features | One feature per rule | Users experience them as one "Refresh" action; rules have no separate controls |
| Marked F-ADV-005, F-ADV-009, F-ADV-014 as Doc status Gaps | Verified | Their visible output depends on operator configuration not observable in code |
| Treated the professional's per-grant edit rights as conditions on R-PROF, not new roles | New R- IDs | Brief forbids new R- IDs |
| Documented Account Access (client side) only as dependency D-CA-001 | Full documentation here | Brief assigns `settings/ProfessionalAccessPage` to B06 |
| Marked F-CA-018 Deprecated | Hidden | Endpoint and UI text explicitly say records are "no longer created" |

### b03-family-succession

| Module prefixes FAM / SUCC / WILL with workflow IDs W-FAM-, W-SUCC-, W-WILL- | Single W- sequence | Matches the brief's prefixes and keeps IDs mergeable |
| Family dashboard split into four features (wealth, attention, goals, protection) | One feature | Each card has its own endpoint, rules and empty states |
| Header **Switch view**, user-menu managed accounts and managing banner documented here (F-FAM-022, F-FAM-024) | Leave to B10 | Assigned to B03 by the wave-0 brief |
| Family overlay roles marked "Same as base plan" for Succession and Will Maker | Separate cells | Family role does not change these features; only managing does |
| Seat-line and will-suggestion RLS issues logged as unverified (not confirmed defects) | Confirmed defects | Reasoned from the FamilyMember policy without a database run |

## Audit allow-list

### b06-account-access

| (none) | — | No sample identifiers were quoted; PAN, email and phone placeholders were paraphrased |

### b07-data-in

| `alerts@hdfcbank.net` | Placeholder of the **Email address** field, `apps/web/src/pages/ingestion/SendersPage.tsx:88` | A generic bank alert address used as example text in the app, not user data (audit run with `--allow-email-domain hdfcbank.net`) |
