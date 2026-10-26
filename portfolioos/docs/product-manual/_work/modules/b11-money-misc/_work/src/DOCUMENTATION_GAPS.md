# Documentation Gaps — Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting (B11)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting

## Verification limitations
UI not visually verified: this run was code-only (no app started, no browser). Labels, messages and behaviour are taken from source. Portal scraping (EPFO and PPF banks), the browser extension, Gmail scans and the insurance-document model were not exercised.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-INS-018 | Reading of insurance PDFs | Accuracy of the model's readings and which documents land in **Needs your check** on real PDFs | Needs live model credentials and real documents | Test with a sample of insurer PDFs |
| F-PF-006 | Portal refresh | Whether the EPFO and seven bank scrapers work against today's portals; real status strings shown during progress | Needs live portals, credentials and OTPs | Run a refresh per institution on a test account |
| F-PF-009 | Browser extension | The extension's popup labels ("Pair") and what it scrapes | The extension's code is not in this repository | Document from the extension repo |
| F-ACCT-013 | Tally export contents | Exact ledgers/groups and the README text inside the ZIP; which data issues block the export | Book-building rules (tallyBook) not traced line by line | Generate an export from a test account and review |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-FX-007 | Defect: the LRS form won't submit while **FX rate (optional)** or **TCS deducted** is empty. An empty text box is registered as "" and fails the optional regex; the form shows no message for these fields. | @@W/pages/forex/LrsTab.tsx#fxRate: z.string().regex@@, @@W/pages/forex/LrsTab.tsx#tcsDeducted: z.string().regex@@, @@apps/web/node_modules/react-hook-form/dist/index.esm.mjs#set(_formValues, name, shouldSkipSetValueAs ? defaultValue : getFieldValue(field._f))@@ | Treat "" as undefined (preprocess) and show field errors? |
| F-FX-002 | Defect: editing a forex balance clears the saved account number. The label says "(leave blank to keep existing)" but a blank box is sent as `null`, which the server treats as "clear". | @@W/pages/forex/ForexCashTab.tsx#(leave blank to keep existing)@@, @@W/pages/forex/ForexCashTab.tsx#accountNumber: v.accountNumber || null,##2@@, @@A/services/forex/forex.service.ts#if (patch.accountNumber === null || patch.accountNumber === '')@@ | Omit the field when blank on edit? |
| F-PF-006 | Defect: fetched and uploaded passbooks never reach the balance or holdings. Rows are stored as CONFIRMED canonical events; the projection marks PF events as no-op "updated by the PF service", but no code writes `ProvidentFundAccount.currentBalance`, and the holding recompute replays transactions only. | @@A/ingestion/projection.ts#ProvidentFundAccount.currentBalance is updated by the PF service@@, @@A/controllers/pf.controller.ts#lastFetchSource: 'MANUAL_PDF'@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#a.currentBalance != null@@ | Write the balance from the latest passbook row and/or create holdings? |
| F-PF-005 | Defect (data exposure): `GET /api/epfppf/accounts` returns raw rows, including `identifierCipher`, `storedCredentials` (encrypted blob) and `credentialsKeyId`; the PF statement report explicitly avoids these columns. | @@A/services/pf/pfAccounts.service.ts#export async function listPfAccounts@@, @@A/controllers/pf.controller.ts#ok(res, accounts);@@, @@A/services/reportBuilder/statement/providentFund.ts#Explicit, and deliberately not a spread@@ | Select a safe DTO? |
| F-PF-008 | Defect: EPFO password reset never runs from the web app. The dialog sends no `source`, the server defaults to `EXTENSION` and enqueues only for `SERVER_HEADLESS`; no extension route picks up pending sessions. | @@W/pages/pf/PfPasswordResetDialog.tsx#const sessionId = await pfApi.startPasswordReset({@@, @@A/controllers/pf.controller.ts#source: z.enum(['EXTENSION', 'SERVER_HEADLESS']).default('EXTENSION'),##2@@, @@A/controllers/pf.controller.ts#if (source === 'SERVER_HEADLESS') {##2@@ | Send `SERVER_HEADLESS`, or add an extension pickup route? |
| F-PF-010 | PF nudge cron runs at 03:30 IST; comments say 09:00 IST ("09:00 IST = 03:30 UTC") but the schedule passes timezone Asia/Kolkata. | @@A/jobs/pfNudgeJob.ts#cron.schedule('30 3 * * *'@@ | Intended 09:00 IST? |
| F-PF-007 | The passbook upload always uses the EPFO passbook parser, even for PPF accounts. | @@A/controllers/pf.controller.ts#const result = parseEpfoPassbook@@ | Route PPF uploads to the bank parsers? |
| F-PF-006 | Saved portal credentials can't be removed in the app (no caller of the forget-credentials route), and the refresh dialog always re-asks for them. | @@A/routes/pf.routes.ts#pfRouter.delete('/accounts/:id/credentials'@@ | Add a "Forget saved login" control? |
| F-INS-001 | Policy status (Active/Lapsed/Surrendered/Matured/Claimed) can't be set from any screen; the API accepts it. Matured/lapsed policies keep generating reminders. | @@A/controllers/insurance.controller.ts#status: z.enum(POLICY_STATUSES).optional(),@@, @@W/components/insurance/PolicyFormDialog.tsx#const input: UpdatePolicyInput = {@@ | Add a status control? |
| F-INS-008 | Health-cover details (members, room rent, co-pay, sub-limits) and the vehicle link have no input in this module; the Health cover panel and coverage health facts depend on them. | @@W/pages/insurance/InsuranceDetailPage.tsx#function HealthCoverPanel@@ | Add inputs? |
| F-INS-019 | Coverage check next steps that name a policy type open an empty **Add a policy** form (the step is ignored). | @@W/pages/insurance/CoveragePage.tsx#const onAddPolicy = (_step: NextStep)@@ | Pre-fill the type? |
| F-INS-002 | Catalogue search says "24+" products; the catalogue has 23. | @@W/components/insurance/InsuranceCatalogPicker.tsx#Search 24+@@ | Update copy or catalogue? |
| F-INS-023 | Auto-matched premiums are dated the processing day, not the email/payment date. | @@A/services/insurance/insurance.service.ts#paidOn: today,@@ | Use the event date? |
| F-ACCT-001 | Accounting mutations show `e.message` (axios "Request failed with status code …") instead of the server's error text, including the documented 404 "No receipts in that range." | @@W/pages/accounting/AccountingPage.tsx#onError: (e: Error) => toast.error(e.message),@@, @@W/pages/accounting/AccountingPage.tsx#A 404 here means the range genuinely holds no receipts@@ | Use `apiErrorMessage` / `decodeBlobError`? |
| F-ACCT-005 | Second voucher in a row reuses the suggested number: `voucher-next-no` isn't invalidated after a create and the dialog state isn't reset. | @@W/pages/accounting/AccountingPage.tsx#queryKey: ['voucher-next-no', type],@@, @@W/pages/accounting/AccountingPage.tsx#qc.invalidateQueries({ queryKey: ['vouchers'] });@@ | Invalidate and reset on success? |
| F-ACCT-005 | Next voucher number is derived from the digits of the alphabetically-last voucher of the type; with only `AUTO-…` vouchers it takes the digits inside a cuid, and after 9999 string ordering stops it increasing. | @@A/services/accounting/accounting.service.ts#orderBy: { voucherNo: 'desc' },@@, @@A/services/accounting/accounting.service.ts#const num = parseInt(last.voucherNo.replace@@ | Exclude AUTO vouchers and order numerically? |
| F-ACCT-006 | Deleting an auto voucher is undone by the next statement read (projectBeforeRead regenerates it). | @@A/controllers/accounting.controller.ts#async function projectBeforeRead@@, @@A/services/accounting/accounting.service.ts#if (wanted.has(v.voucherNo)) continue;@@ | Hide delete on auto vouchers? |
| F-ACCT-007 | "Generate" toast reports only created vouchers ("No new vouchers…" even when some were updated or removed). | @@W/pages/accounting/AccountingPage.tsx#No new vouchers@@ | Report updated/removed? |
| F-ACCT-013 | Tally export ignores manual vouchers and the user's chart of accounts (built from source records). | @@A/services/accounting/tally/tallySources.ts#prisma.transaction.findMany({@@ | Intended? |
| F-FX-004 | Pair P&L buckets by financial year of each trade, so cross-year positions realise nothing; average-price math though the comment says FIFO. | @@A/services/forex/forex.service.ts#const key = `${portfolioId}|${pair}|${financialYearOf(t.tradeDate)}`;@@, @@A/services/forex/forex.service.ts#const realised = avgSell.minus(avgBuy).times(matchedQty);@@ | Match across years? |
| F-FX-006 | LRS usage converts INR to USD at today's rate (fallback ₹83 hard-coded), not the remittance-date rate. | @@A/services/forex/forex.service.ts#?? new Decimal(83)@@ | Use stored per-remittance rates? |
| F-FX-007 | Remittance linked to a TCS credit increments `usedAmount` by id without checking the credit belongs to the caller (RLS may block); not reachable from the UI. | @@A/services/forex/forex.service.ts#where: { id: input.tcsCreditId },@@ | Add an ownership check? |
| F-FX-001 | Rates from exchangerate-api are labelled FRANKFURTER; any user can trigger the global sync. | @@A/priceFeeds/fx.service.ts#await upsertRate(code, 'INR', today, rate, 'FRANKFURTER');@@ | Separate label; rate-limit refresh? |
| F-GOAL-001 | Inflation rate is stored and an inflation-adjusted target computed, but neither the needed return nor any screen uses it. | @@A/services/goals/goals.service.ts#const requiredCagr = calcRequiredCagr(target, currentValue, years);@@ | Use the adjusted target? |
| F-CASH-002 | Cash flows from split settlements may be in a foreign currency; the list drops `currency` and formats every amount as ₹. | @@A/services/split/shareLink.service.ts#currency: want.currency@@, @@A/controllers/cashflows.controller.ts#amount: cf.amount.toString(),@@ | Show currency / INR equivalent? |
| F-CASH-001 | Forecast counts only the next premium per policy within 12 months, FD/RD maturities at invested amount, and full rent for partial months. | @@A/services/analytics/cashflowForecast.service.ts#nextPremiumDue: { gte: today, lte: horizonEnd },@@, @@A/services/analytics/cashflowForecast.service.ts#const amt = d(tx.netAmount);@@ | Project recurring premiums and maturity values? |
| F-INC-003 | Income delete has no confirmation (other modules confirm). | @@W/pages/income/IncomePage.tsx#onDelete={(id) => removeMut.mutate(id)}@@ | Add a confirm? |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-INS-024 | Account Aggregator (Finvu) insurance card and views — not imported by any page | Hidden | @@W/pages/insurance/FinvuInsuranceCard.tsx#export function@@ |
| F-INS-025 | Insurance alerts trigger route; policy status, health-cover details, vehicle and portfolio fields settable only via API | Backend-only | @@A/routes/insurance.routes.ts#insuranceRouter.post('/alerts/trigger'@@ |
| F-PF-011 | UAN lookup (5/day), forget saved credentials, extension-facing routes (pair-complete, me, raw-payload, revoke) | Backend-only | @@A/routes/pf.routes.ts#pfRouter.post('/uan-lookup'@@ |
| F-FX-009 | TCS credit create/delete, balance account-number reveal (not rate-limited or audited), currencies list, `?fy=` filters | Backend-only | @@A/routes/forex.routes.ts#forexRouter.post('/tcs'@@ |
| F-GOAL-004 | Read one goal (`GET /api/goals/:id`) | Backend-only | @@A/routes/goals.routes.ts#goalsRouter.get('/:id'@@ |
| F-INC-004 | Read one income entry (`GET /api/income/:id`) | Backend-only | @@A/routes/income.routes.ts#incomeRouter.get('/:id'@@ |
| F-ACCT-014 | Edit account, read/edit voucher, suggest voucher from a transaction | Backend-only | @@A/routes/accounting.routes.ts#accountingRouter.patch('/vouchers/:id'@@ |
| F-PF-006 | Portal refresh — imports rows but doesn't update balance or holdings | Partial | @@A/ingestion/projection.ts#case 'PF_EMPLOYER_CONTRIBUTION':@@ |
| F-PF-007 | Passbook upload — same limitation | Partial | @@A/controllers/pf.controller.ts#export async function uploadManualPassbookHandler@@ |
| F-PF-008 | EPFO password reset — never starts from the web app | Partial | @@A/controllers/pf.controller.ts#export async function startPasswordResetHandler@@ |
| F-FX-008 | TCS credits — list only, no way to add | Partial | @@W/pages/forex/LrsTab.tsx#TCS credits@@ |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-GOAL-002 | **New goal** button is outside the plan lock; Free users can open the form | `POST /api/goals` refuses below Plus | @@W/pages/goals/GoalsPage.tsx#<Plus className="h-4 w-4" /> New goal@@, @@A/routes/goals.routes.ts#goalsRouter.use(requireFeature('GOAL_PROJECTIONS'));@@ |
| F-ACCT-001 | Locked Accounting content is rendered (blurred) and still requests data | Every `/api/accounting` call returns 403 below Pro/Advisor | @@W/components/common/LockedFeature.tsx#pointer-events-none select-none blur@@ |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Documented the PPF & EPF page's shared asset-page parts (summary strip, transactions table) at the level needed for PF and pointed to B01 for the component (D-PF-001) | Full re-documentation of the shared page | Override assigned `/provident-fund` to B11; the component itself is B01's |
| Treated the EPF/PPF entry forms as B11 features and the NPS mode of the same dialog as B01 (D-PF-003) | Split by file | Brief assignment: B11 documents them for PF, B01 for NPS |
| Listed the dashboard FX strip as a dependency (D-FX-002) though its file is in `pages/forex` | Document it here | It renders on the dashboard route (B10 owns it as F-DASH-006) |
| Documented **Export to Tally** button behaviour here and pointed to B08 for the Reports-tab copy | Leave all to B08 | The button is rendered on `/accounting`; B04/B05/B08 dependency rows point Tally to B11 |
| Marked defects that leave a feature usable as Live (e.g. F-FX-007) and features that can't achieve their purpose as Partial (F-PF-006/007/008) | Mark all defective features Partial | Live = reachable and wired; Partial = cannot complete its stated outcome |
| Left backend-only endpoints out of the user manual (inventory + gaps only) | Manual sections | Skill rule: only Live/Partial are taught to users |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
