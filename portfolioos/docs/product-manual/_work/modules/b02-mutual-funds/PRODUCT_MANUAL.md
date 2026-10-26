# EveryPaisa User Manual — Mutual Funds (B02 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Mutual Funds (`/mutual-funds`), Mutual Fund Analytics (`/mutual-funds/analysis`, `/mutual-funds/:schemeCode`, `/methodology/mf-score`)

## Contents
- [Mutual Funds](#mutual-funds)
- [Mutual Fund Analytics](#mutual-fund-analytics)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Mutual Funds

The **Mutual Funds** page (sidebar **Asset Classes → Mutual Funds**, route `/mutual-funds`) shows every mutual fund you hold across all your portfolios, priced from the AMFI NAV, together with every way the app offers to bring mutual fund data in: a CAS PDF upload, two "send me my CAS by email" requests, an inbox scan, a manual transaction, and an operator-facing Finvu (account aggregator) sandbox. It also carries a free Direct-vs-Regular check. The deeper research (scores, overlap, tax lots) lives in [Mutual Fund Analytics](#mutual-fund-analytics), reached with the **Portfolio analysis** button.

### Mutual fund holdings overview <!-- F-MF-001 -->
**What it does:** Shows four summary tiles — **Current value**, **Invested**, **Unrealised P&L**, **Return** — and a holdings table with one row per mutual fund position: **Scheme** (name, with symbol or ISIN underneath), **Units**, **Avg cost**, **NAV** (with "as of …" age), **Value**, **P&L**, **%** and **Portfolio**. Rows come from every portfolio you can read.

**Why it exists:** Inferred from behavior: it is the single place to see your whole mutual fund book at once instead of portfolio by portfolio; the header text states its purpose as "MF holdings across all portfolios, priced from AMFI NAV".

**Where to find it:** **Asset Classes → Mutual Funds** (route `/mutual-funds`). The dashboard's mutual fund tiles also link here.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate). In family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) the portfolios listed are the ones the family view exposes; when managing someone's account (R-MANAGER) it shows that person's funds.

**Steps**
1. Open **Asset Classes → Mutual Funds**. The page loads your portfolios, then each portfolio's holdings.
2. Read the four tiles at the top. If any fund has no NAV yet, the **Current value** tile shows "1 holding at cost — no price yet" (or "N holdings at cost — no price yet").
3. Scroll the holdings table. Hover the "as of …" text under a NAV to see the exact price timestamp in IST.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Summary tiles | Display | Show totals described below | Hidden when you hold no mutual funds (empty state shown instead) |
| Holdings table | Display | One row per position | Hidden when you hold no mutual funds |
| **Add transaction** (empty state) | Button | Opens the add-transaction form (D-MF-001) | Shown only in the empty state |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed; this is a read-only view.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No mutual fund holdings" — "Sync AMFI NAV first, then add a BUY or SIP transaction on a scheme." | No position with asset class Mutual Fund in any readable portfolio | Import a CAS (F-MF-003) or add a transaction (D-MF-001) |
| NAV age shown with "⚠" in amber | The price is more than 5 days old | Wait for the nightly NAV update at 22:00 IST (D-MF-010) |
| **NAV**, **Value**, **P&L** show "—" | No NAV is stored for that scheme yet | The holding is counted at cost in **Current value** until a NAV arrives |

**Limitations:** ETFs are not listed here even though they are fund-like; only asset class Mutual Fund rows appear (the Direct vs Regular card and the analytics do include ETFs). The **%** column and the **Return** tile are rounded by the shared percent formatter. The values reflect the stored holding projection, which is repriced nightly — see F-MF-004 for why the manual NAV sync does not move these numbers.

**How it works:** The page calls `GET /api/portfolios`, then `GET /api/portfolios/:id/holdings` once per portfolio, and keeps rows whose asset class is `MUTUAL_FUND`. Values come from the stored holding projection (`currentPrice`, `currentValue`, `priceAsOf`); a market price older than 5 days is flagged stale. Totals: **Current value** = sum of current value for priced holdings plus cost for unpriced ones; **Invested** = sum of cost; **Unrealised P&L** = priced value − priced cost (shown "—" when nothing is priced); **Return** = P&L ÷ priced cost × 100. All money is decimal arithmetic. Positions with zero units are deleted from the projection, so fully redeemed funds disappear.

**Related features:** F-MF-002 (transactions), F-MF-003 (CAS import), F-MF-004 (AMFI sync), F-MF-011 (analysis), D-MF-010 (price jobs).

**Sources:** `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:62`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:173`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:384`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:393`, `apps/web/src/lib/holdingsSummary.ts:1`, `apps/web/src/components/common/PriceAsOf.tsx:1`, `packages/api/src/services/holdings/priceStaleness.ts:28`, `packages/api/src/services/holdings/holdingsProjection.ts:439`

### Mutual fund transactions list <!-- F-MF-002 -->
**What it does:** Lists your mutual fund transactions (newest first) under the heading **Transactions** with **Date**, **Scheme** (and ISIN), **Type**, **Units** (3 decimals), **NAV** and **Amount** (units × NAV), plus a pencil (**Edit**) and a bin (**Delete**) on each row.

**Why it exists:** Inferred from behavior: lets you check and correct the history the holdings are computed from without leaving the page.

**Where to find it:** **Asset Classes → Mutual Funds**, below the holdings table (route `/mutual-funds`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In family view, R-FAMVIEWER cannot change family-shared portfolios (server rule owned by B03/B10); R-MANAGER edits the managed person's transactions.

**Steps**
1. Scroll to **Transactions**.
2. To edit, click the pencil (tooltip **Edit**). The shared transaction form opens pre-filled (D-MF-001).
3. To delete, click the bin (tooltip **Delete**). The row shows **Sure?** with **Yes** and **No**.
4. Click **Yes**. A toast says "Transaction deleted" and the holdings, portfolios and dashboard refresh.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Pencil (**Edit**) | Icon button | Opens the transaction form for this row | Hidden while that row is asking **Sure?** |
| Bin (**Delete**) | Icon button | Asks **Sure?** | Hidden while asking |
| **Yes** | Button | Deletes the transaction | Shows a spinner while deleting |
| **No** | Button | Cancels the delete | — |

**Fields and rules:** Not applicable — editing happens in the shared form (D-MF-001).

**Settings and toggles here:** None.

**Results:** Delete removes the transaction; the server recomputes the holding for that scheme, so units, cost and value change.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete" (or the server's message) | Server refused or network error | Retry; check you can edit that portfolio |

**Limitations:** Only the 200 most recent mutual fund transactions are fetched and there is no "load more" — older rows are silently not shown here (use **Overview → Transactions** for the full list). Type labels: Buy, Sell / Redeem, Dividend, SIP/Deposit, Withdrawal; other types show their raw code (for example `SIP`, `SWITCH_IN`). The **Type** column hides on narrow screens and **NAV** hides below medium width.

**How it works:** `GET /api/transactions?assetClass=MUTUAL_FUND&pageSize=200`; the server caps page size at 200, sorts by trade date then creation time, both descending. Rows whose type is BUY, DEPOSIT, DIVIDEND_PAYOUT, DIVIDEND_REINVEST, SIP or BONUS get a green chip, all others red. Delete calls `DELETE /api/transactions/:id`, then refetches transactions, holdings, portfolios and the dashboard.

**Related features:** F-MF-001, D-MF-001.

**Sources:** `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:33`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:72`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:85`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:476`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:515`, `packages/api/src/services/holdings/transaction.service.ts:659`

### CAS PDF upload and Recent imports <!-- F-MF-003 -->
**What it does:** The **Automated CAS Import** card lets you drop or choose a CAMS / KFintech Consolidated Account Statement (CAS) file; the file is parsed in the background and its mutual fund transactions are added. The **Recent imports** card shows the last 5 mutual fund CAS imports with status, row counts, and actions.

**Why it exists:** The card text: "Upload your CAMS or KFintech CAS PDF. We'll automatically extract all mutual fund transactions."

**Where to find it:** **Asset Classes → Mutual Funds**; the header button **Import CAS PDF** scrolls to the card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER uploads into the managed person's data.

**Steps**
1. Click **Import CAS PDF** (or scroll to **Automated CAS Import**).
2. Drag a file onto the box, or click **Choose file**. Accepted: PDF · XLSX · XLS · CSV · TSV · Max 50 MB.
3. A toast says "CAS uploaded — parsing in background. Status will update below." The **Recent imports** card appears with status **Pending** / **Processing** and the note "Parsing in progress — this can take 10-30 seconds for large CAS files."
4. If the status becomes **Needs password**, click the amber chip ("Click to enter PDF password") and enter the password (D-MF-003). On success: "Password accepted — reprocessing".
5. When the status is **Completed**, **Partial** or **Failed**, the row shows "successful/total rows". Click **View** to see errors (D-MF-003).
6. To drop a finished import from the list, click the bin (**Remove from list**), then **Yes** at **Remove?**. Toast: "Import removed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Import CAS PDF** | Header button | Scrolls to the upload card | — |
| Drop zone / **Choose file** | File input | Uploads the file | Disabled while uploading ("Uploading…") |
| **Needs password** chip | Button | Opens the password prompt | Only on imports with status Needs password |
| **View** | Button | Opens the import error details | Only when the import failed, has failed rows or parser warnings |
| Bin (**Remove from list**) | Icon button | Asks **Remove?** | Disabled while the import is Pending/Processing |
| **Yes** / **No** | Buttons | Confirm / cancel removal | — |
| **View all** | Link | Opens `/import` | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| File | File | Yes | .pdf, .csv, .tsv, .xlsx, .xls; 50 MB shown as limit | — | "Upload failed" (or the server's message) |

**Settings and toggles here:** None.

**Results:** A new import job is created with no portfolio chosen (the import pipeline decides the destination, D-MF-003). Parsed transactions are added; holdings and transactions on this page refresh automatically when the job finishes. A completed CAS with zero mutual fund rows shows: "CAS confirmed — no MF transactions in this period. If you have holdings, request a wider date range."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Status **Needs password** | The PDF is encrypted and none of the auto-tried passwords worked | Click the chip and enter the password |
| Status **Failed** / **Partial** | Parser could not read some or all rows | Click **View**; correct or re-upload (D-MF-003) |
| "Failed to remove import" | Server refused | Retry |

**Limitations:** Only imports of type MF CAS PDF / MF CAS Excel appear here, and only the latest 5. The "Pro Tips" box says the app auto-tries "your PAN, email & phone from Settings" as PDF passwords; that logic is in the import pipeline (B07) and was not traced here.

**How it works:** Upload sends the file to the imports API with `portfolioId: null`. The page polls `GET /api/imports` every 2 seconds while any job is Pending or Processing; when a job reaches a terminal state within the last 5 seconds it refreshes holdings and transactions. Status labels: Pending, Processing, Completed, Partial, Failed, Needs password.

**Related features:** D-MF-003, F-MF-005, F-MF-006, F-MF-007.

**Sources:** `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:108`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:120`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:145`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:236`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:248`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:365`, `apps/web/src/pages/imports/ImportDropzone.tsx:10`, `packages/shared/src/types/imports.ts:51`

### Sync AMFI NAV <!-- F-MF-004 -->
**What it does:** The **Sync AMFI NAV** button downloads the current AMFI NAV file on demand and stores the latest NAV for every scheme, creating scheme records for new schemes.

**Why it exists:** Inferred from behavior: lets a user pull today's NAVs without waiting for the nightly 22:00 IST job; the empty-state text tells new users to "Sync AMFI NAV first" so scheme search has data.

**Where to find it:** **Asset Classes → Mutual Funds**, header button **Sync AMFI NAV**.

**Who can use it:** Every signed-in user (R-FREE and up); not plan-gated. The data it writes is shared by all users.

**Steps**
1. Click **Sync AMFI NAV**. The button shows a spinner and is disabled.
2. On success a toast says "AMFI sync: N NAVs upserted, M new schemes".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sync AMFI NAV** | Button | Runs the AMFI NAV load | Disabled while running |

**Fields and rules:** Not applicable — no input.

**Settings and toggles here:** None.

**Results:** The global NAV table and scheme list are updated. Your holdings' **NAV** and **Value** columns do **not** change from this button alone — holdings are repriced by the nightly job.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "AMFI sync failed" (or the server's message) | AMFI unreachable, or the feed canary rejected a broken file | Try later; the nightly job retries at 22:00 IST |
| Toast succeeds but holding values unchanged | This endpoint only loads NAVs; it does not reprice holdings | Wait for the 22:00 IST job, which reprices holdings right after loading NAVs |

**Limitations:** Known defect: the button does not reprice holdings (logged in DOCUMENTATION_GAPS.md). Any signed-in user can trigger this global reload; there is no rate limit specific to it.

**How it works:** `POST /api/assets/amfi/sync` → `syncAmfiNav()`, which runs the AMFI loader inside the feed canary (rows parsed / imported / parse failures) and returns counts including `navsUpserted` and `mastersCreated`. The scheduled job at 22:00 IST calls the same loader and then `refreshAllHoldingPrices()`.

**Related features:** F-MF-001, D-MF-010.

**Sources:** `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:75`, `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:226`, `packages/api/src/routes/assets.routes.ts:46`, `packages/api/src/controllers/assets.controller.ts:93`, `packages/api/src/priceFeeds/amfi.service.ts:295`, `packages/api/src/jobs/priceJobs.ts:97`

### Sync MF via CASParser <!-- F-MF-005 -->
**What it does:** The **Sync MF via CASParser** button opens the dialog **Sync Mutual Funds via PAN + Email**. You enter your PAN and the email registered on your folios; the app asks the casparser.in service to have KFintech email you a CAS PDF (covering CAMS and KFintech funds), locked with your PAN as its password. It also turns on Gmail monitoring of CAS senders so the PDF is imported automatically when it arrives.

**Why it exists:** The dialog explains: "No free public API allows PAN+OTP→MF data without a paid B2B partnership … KFintech mailback is the closest free PAN-only flow: identity is verified by sending the PDF to the email already registered on your folios."

**Where to find it:** **Asset Classes → Mutual Funds → Sync MF via CASParser**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate). Rate limit: 5 requests per minute per user.

**Steps**
1. Click **Sync MF via CASParser**. The dialog opens; if the server can read the CASParser account, a line shows "CASParser credits: N (plan)" (amber when 5 or fewer remain).
2. Type your **PAN** (forced to upper case, 10 characters) and **Email**.
3. Pick a **Period** (S-MF-001). **Portfolio** and **Nickname** can be filled but are not used (see Limitations).
4. Click **Request CAS**. On success the dialog shows **CAS request submitted**, the service's message, a "ref:" request id when given, and "PDF arrives in your inbox in 5-60 min. Connect Gmail in Settings to auto-import. Otherwise upload the PDF manually via "Import CAS PDF"."
5. Click **Done**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Request CAS** | Button | Sends the request | Disabled until PAN and email look valid, and while sending |
| **Cancel** | Button | Closes and clears the form | — |
| **Done** | Button | Closes after success | Success screen only |
| **Try again** | Button | Back to the form | Error screen only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| PAN | Text | Yes | 5 letters, 4 digits, 1 letter; max 10 | empty | Button stays disabled; server: "Invalid PAN" (422 "Validation failed") |
| Email | Email | Yes | text with one @ and a dot in the domain part; server max 120 | empty | Button stays disabled; server: "Validation failed" |
| Period | Select | Yes | All to Date / Last 12 months / Last 6 months / Last 3 months | All to Date | — |
| Portfolio | Select | No | Default or one of your portfolios | Default | — (ignored) |
| Nickname | Text | No | max 80 | empty | — (ignored) |

**Settings and toggles here:** S-MF-001 **Period** — sets the statement date range ("All to Date" = 1 January 1990 to today). S-MF-002 **Portfolio** and S-MF-003 **Nickname** — collected but never sent to the server, so they have no effect.

**Results:** KFintech emails the CAS to the address registered on the folios. Nine CAS sender domains (CAMS, CAMS CAS, KFintech, KFintech legacy, CDSL, CDSL eCAS, NSDL, NSDL eCAS, CASParser delivery) are added to your monitored Gmail senders with auto-commit on (existing entries are left unchanged), and an immediate Gmail sync runs for each connected Gmail account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **Something went wrong** + server message | casparser.in rejected the request or is unreachable | **Try again** later or upload the PDF manually |
| "Internal server error" | In production, errors from the CASParser client (including "not configured") are not mapped to a user message | Ask the operator to check `CASPARSER_API_KEY` |
| "Too many requests for this operation. Please wait a minute." | More than 5 requests in a minute | Wait a minute |
| No email arrives | PAN not on record with KFintech, or the email differs from the folio email | Check the folio email; the app cannot see KFintech's side |

**Limitations:** Known defect: **Portfolio** and **Nickname** are not sent. The "CASParser credits" line shows the operator's shared CASParser account balance, not anything personal. The PDF password is always your PAN in upper case. Nothing arrives in the app unless Gmail is connected (D-MF-004) or you upload the PDF yourself.

**How it works:** `POST /api/mf-casparser/kfintech/mailback` with `{pan, email, fromDate, toDate}`; the server calls casparser.in `/v4/kfintech/generate` with `password = PAN`, defaulting dates to 1990-01-01 → today. On failure it writes an ingestion-failure record (adapter `casparser.kfintech.v4`) holding only the PAN's last 4 characters. The credits line comes from `GET /api/mf-casparser/credits` (casparser.in `/v1/credits`); it is not retried on failure and simply hides.

**Related features:** F-MF-003, F-MF-006, D-MF-004.

**Sources:** `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:41`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:83`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:116`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:145`, `apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:255`, `packages/api/src/routes/mfCasparser.routes.ts:17`, `packages/api/src/controllers/mfCasparser.controller.ts:34`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:350`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:398`, `packages/api/src/services/mf/mfCasparser/mfCasparser.service.ts:419`, `packages/api/src/middleware/rateLimit.ts:261`

### Sync via CAMS / KFintech <!-- F-MF-006 -->
**What it does:** The **Sync via CAMS / KFintech** button opens **Sync Mutual Funds via CAMS + KFintech CAS**. The server opens the public CAS request forms of CAMS and KFintech in a headless browser, shows you each portal's captcha, and submits the request so each registrar emails you a CAS PDF locked with your saved PAN.

**Why it exists:** The dialog text: "We'll request a Consolidated Account Statement (CAS) from CAMS and KFintech. The PDF arrives in your inbox in 5–60 min and is auto-imported by the Gmail integration." The code keeps it as the fallback to CASParser.

**Where to find it:** **Asset Classes → Mutual Funds → Sync via CAMS / KFintech**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Needs a PAN on your profile. See role notes for R-MANAGER.

**Steps**
1. Click **Sync via CAMS / KFintech**. "Loading profile…" shows briefly; the app fetches your full PAN through the audited reveal endpoint.
2. If no PAN is saved, the dialog says **PAN not set on your profile.** Click **Set PAN now**, type the PAN, click **Save PAN** (toast "PAN saved to profile").
3. With a PAN saved, the **PAN** field is pre-filled. Enter the **Email** registered with your folios, choose **Period**, optionally **Portfolio** and **Nickname**.
4. Click **Continue**. The server opens both portals; a toast says which were reached (for example "CAMS & KFintech reached").
5. The next screen says "CAS will be emailed to <masked email>. PDF password = your saved PAN (XXXXXX<last 4>)." For each portal, type the captcha shown, or read "Form opened — no captcha challenge."
6. Click **Submit CAS Request**. "Submitting request to portal(s)..." shows.
7. The result shows **CAS request submitted** with "CAMS: OK (ref …)" / "failed — <reason>" / "not requested" and the same for KFintech. Click **Done**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Set PAN now** | Button | Opens the PAN entry step | Only when no PAN is saved |
| **Save PAN** | Button | Saves PAN to your profile | Disabled until PAN format is valid, and while saving |
| **Back** | Button | Returns to the previous step | — |
| **Continue** | Button | Opens the portals | Disabled until PAN and email are valid and a PAN is saved |
| Captcha for CAMS / Captcha for KFintech | Text inputs | Captcha answers | Shown only when the portal showed a captcha |
| **Submit CAS Request** | Button | Submits to the portals | Disabled until required captchas are typed |
| **Cancel**, **Done**, **Try again** | Buttons | Close / close / back to form | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| PAN | Text | Yes | 5 letters, 4 digits, 1 letter; max 10 | Your saved PAN | Server: "Invalid PAN" / "Invalid PAN format" |
| Email | Email | Yes | server: valid email, max 120 | empty | Server: "Validation failed" |
| Period | Select | Yes | All to Date / Last 12 / 6 / 3 months | All to Date | — |
| Portfolio | Select | No | Default or one of your portfolios | Default | "Portfolio not found" / "No portfolio found — create one first" |
| Nickname | Text | No | max 80 | empty | — |
| Captcha (each) | Text | When shown | max 20 characters | empty | Portal result "failed — CAMS rejected the captcha" (or KFintech) |

**Settings and toggles here:** S-MF-004 **Period** — "All to Date" sends no dates (the portal's default range); the others send today minus 3/6/12 months. S-MF-005 **Portfolio** and S-MF-006 **Nickname** — stored on the request record only; they do not decide where the arriving PDF is imported.

**Results:** A mailback request record is stored with per-portal status (Pending → Submitted or Failed) and request references. The registrars email the CAS, password-protected with your saved PAN. Import happens only through Gmail (if the sender is monitored) or manual upload.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to reach CAMS or KFintech portals. Try again or use PDF upload." | Neither portal form could be opened | **Try again** later or upload a PDF |
| "PAN not set on profile. Set PAN in Settings first — it doubles as the CAS PDF password." | No PAN saved at submit time | Save a PAN (step 2) |
| "Job in status …, expected CAPTCHA_REQUIRED" | The request was already submitted or failed | Start again |
| "failed — CAMS session expired" / "KFintech session expired" | More than 5 minutes between **Continue** and **Submit CAS Request** | Start again and submit within 5 minutes |
| "failed — … rejected the captcha" | Wrong captcha | Start again |

**Limitations:** Each portal browser session lives 5 minutes. This flow does not add CAS senders to Gmail monitoring (unlike F-MF-005), so auto-import depends on your existing Gmail sender setup. No dedicated rate limit applies. The PDF password is always the saved PAN.

**How it works:** `POST /api/mf-cas-mailback/initiate` validates PAN/email, resolves the portfolio (chosen one, else your default, else your first), creates the request record with status `CAPTCHA_REQUIRED`, and for each requested provider opens a headless browser session keyed `<job>:cams` / `<job>:kfin`, returning a captcha image or null. `POST /api/mf-cas-mailback/submit` reads the PAN from your profile as the PDF password, submits each pending portal, records per-portal results and ingestion failures, and sets the overall status `SUBMITTED` unless every attempted portal failed. The PAN and email are held only in the in-memory session.

**Related features:** F-MF-005, F-MF-003, D-MF-004, D-MF-006.

**Sources:** `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:50`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:96`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:187`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:217`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:355`, `apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:446`, `packages/api/src/controllers/mfCasMailback.controller.ts:14`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:28`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:124`, `packages/api/src/services/mf/mfCasMailback/mfCasMailback.service.ts:171`, `packages/api/src/lib/mailbackSessions.ts:22`, `packages/api/src/ingestion/mfMailback/camsMailback.ts:10`

### Scan inbox <!-- F-MF-007 -->
**What it does:** The **Scan inbox** button checks your connected Gmail for new CAS emails right away instead of waiting for the scheduled poll.

**Why it exists:** Button tooltip: "Check Gmail for new CAS emails now".

**Where to find it:** **Asset Classes → Mutual Funds**, header button **Scan inbox**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with at least one active Gmail connection (D-MF-004).

**Steps**
1. Click **Scan inbox**. The icon spins and the button is disabled while scanning.
2. A toast says "Scanning Gmail — imports will appear when found". New imports appear under **Recent imports** (F-MF-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan inbox** | Button | Starts a Gmail scan | Disabled while a scan is running |

**Fields and rules:** Not applicable — no input.

**Settings and toggles here:** None.

**Results:** Matching CAS emails become import jobs (handled by B07).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No active Gmail account connected" | No Gmail connected | Connect Gmail (**Inbox → Connect your Gmail**) |

**Limitations:** The scan itself, its rate limit and which emails count are owned by B07.

**How it works:** Uses the app-wide scan context: it lists your mailboxes, refuses if none is an active Gmail OAuth account, otherwise starts a scan.

**Related features:** F-MF-003, F-MF-005, D-MF-004.

**Sources:** `apps/web/src/pages/assetClasses/MutualFundsPage.tsx:214`, `apps/web/src/context/ScanContext.tsx:22`

### Direct vs Regular & overlap <!-- F-MF-008 -->
**What it does:** The card **Plan analysis — Direct vs Regular & overlap** counts your schemes by plan type and groups schemes that look like the same fund under different plan/option names. It shows tiles **Schemes**, **Direct**, **Regular**, **MF value**, a warning when a fund family is held in both Direct and Regular plans, collapsible **Overlap groups**, and a table **All MF schemes (N)** with **Scheme**, **AMC**, **Plan** and **Value**.

**Why it exists:** The card's own copy: holding a fund in both Direct and Regular plans is flagged because "Switching to Direct plans can save ~1% per year in expense-ratio drag."

**Where to find it:** **Asset Classes → Mutual Funds**, near the bottom of the page.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (not plan-gated). Reads your own portfolios only.

**Steps**
1. Scroll to the card. "Loading overlap analysis…" shows first.
2. If "Possible duplicates" appears in amber, read the warning "N fund family held in both Direct and Regular plans".
3. Click an overlap group to expand its schemes; click again to collapse.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Overlap group row | Toggle button | Expands/collapses the group's schemes | Section hidden when no group exists |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Card not shown | You hold no mutual fund or ETF positions linked to a scheme | Add or import funds |
| Plan shows **UNKNOWN** | Scheme name contains neither "direct" nor "regular" | None — the check is name-based |

**Limitations:** Plan type and grouping are guessed from scheme names, not from scheme codes: a name without "direct"/"regular" is UNKNOWN, and two genuinely different funds whose names reduce to the same words are grouped. The "~1% per year" figure is fixed text, not computed. **MF value** includes ETFs and counts unpriced holdings at cost, so it can differ from the page's **Current value** tile.

**How it works:** `GET /api/analytics/mf-overlap` reads your holding projections with asset class Mutual Fund or ETF and a linked scheme, merges positions per scheme across portfolios, and labels the plan DIRECT/REGULAR/UNKNOWN by the words "direct"/"regular". The canonical name lower-cases the scheme name and strips direct/regular, growth/dividend/idcw/payout/reinvestment/bonus, plan/option/scheme/fund and dashes. Groups of 2+ schemes with the same canonical name become overlap groups; a group with both DIRECT and REGULAR counts once towards the duplicate warning. Everything is sorted by value, highest first.

**Related features:** F-MF-013 (holdings-based overlap), F-MF-015 (cost).

**Sources:** `apps/web/src/pages/mutualFunds/MfOverlapCard.tsx:44`, `apps/web/src/pages/mutualFunds/MfOverlapCard.tsx:65`, `apps/web/src/pages/mutualFunds/MfOverlapCard.tsx:116`, `packages/api/src/routes/analytics.routes.ts:47`, `packages/api/src/services/mf/mfOverlap.service.ts:60`, `packages/api/src/services/mf/mfOverlap.service.ts:74`, `packages/api/src/services/mf/mfOverlap.service.ts:92`, `packages/api/src/services/mf/mfOverlap.service.ts:124`, `packages/api/src/services/mf/mfOverlap.service.ts:168`

### Finvu (Account Aggregator) sandbox explorer <!-- F-MF-009 -->
**What it does:** The card **Finvu (Account Aggregator) via Finfactor Wealthscape** lets you send a **Unique identifier** to eight Finfactor Wealthscape mutual fund endpoints and see each response rendered as a view: **MF insights**, **Insights (no PII)**, **Linked accounts**, **Holding folio**, **Statement**, **Analysis**, **Benchmark trailing**, **Benchmark P2P**. A status pill shows **Demo mode**, **Configured** or **Token missing**.

**Why it exists:** The card's own text: "Pull mutual fund holdings, folios, transactions and insights from the user's linked AAs. The sandbox UAT serves dummy data — useful for verifying the round-trip before consent goes live." The code comment calls it a tool for "the operator".

**Where to find it:** **Asset Classes → Mutual Funds**, card below the transactions.

**Who can use it:** The card is shown to everyone; the endpoint buttons only succeed for R-PLUS, R-FAMILY, R-PRO (plan gate `AA_FINVU_AUTOIMPORT`). R-FREE gets "This feature requires the PLUS plan or higher".

**Steps**
1. Read the status pill. If **Token missing**, the card says to set `FINFACTOR_API_TOKEN` or `FINFACTOR_DEMO_MODE=true` and shows the base URL; all buttons are disabled.
2. Enter a **Unique identifier** (S-MF-007). The field starts with the sandbox sample.
3. Click one endpoint button. It spins; a toast "Finvu /<endpoint> ✓" appears and the result view renders below, titled with the button label.
4. In the **Statement** view, use the filter chips (S-MF-009) to narrow rows; "N of M shown" updates.
5. Click **Raw upstream JSON (for debugging)** to show or hide the raw response.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **MF insights** … **Benchmark P2P** (8 buttons) | Buttons | Call one endpoint each | Disabled when not configured, while any call runs, or identifier empty |
| **Unique identifier** | Text | Identifier sent to Finfactor | — |
| Statement filter chips **All**, **BUY**, **SELL**, **SIP only**, **DEMAT**, **SOA** | Chips | Filter statement rows | Statement view only |
| Holding row chevron | Toggle | Shows per-folio detail | Insights view rows with folios |
| **Raw upstream JSON (for debugging)** | Toggle | Shows raw JSON | After a result |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Unique identifier | Text | Yes | any non-empty string | sandbox sample value | Server: "uniqueIdentifier is required" |

**Settings and toggles here:** S-MF-007 **Unique identifier** — the identifier every call uses. S-MF-009 **Statement filter chips** — client-side filter, not saved.

**Results:** Nothing is stored; responses are displayed only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade (D-MF-005) |
| Buttons disabled, pill **Token missing** | Operator has not configured Finfactor | Operator sets the token or demo mode |
| Other toast errors | Upstream Finfactor error | Retry; check the identifier |

**Limitations:** This is an operator sandbox shown on an end-user page: in **Demo mode** every call returns the same documented sample payload; the benchmark buttons use fixed sample benchmarks and dates; the identifier is not checked against your own consent. Real consent is on the Connectors page (D-MF-011). See DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/integrations/finfactor/status` (any signed-in user) returns configured / demo mode / base URL. Each button posts to `/api/integrations/finfactor/mf/insights`, `/mf/insights-no-pii`, `/mf/linked-accounts`, `/mf/linked-accounts/holding-folio`, `/mf/statement` (newest first), `/mf/analysis`, `/mf/benchmark/trailing` (ranges 1M–10Y) or `/mf/benchmark/point-to-point`; in demo mode the server answers from built-in fixtures without calling Finfactor.

**Related features:** F-MF-010, D-MF-011.

**Sources:** `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:1`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:33`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:50`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:162`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:203`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:361`, `apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:101`, `packages/api/src/routes/finfactor.routes.ts:38`, `packages/api/src/routes/finfactor.routes.ts:42`, `packages/api/src/controllers/finfactor.controller.ts:105`, `packages/api/src/ingestion/finfactor/mf.service.ts:45`

### Finvu import to portfolio <!-- F-MF-010 -->
**What it does:** In the **Import into EveryPaisa** box of the Finvu card, **Import to portfolio** fetches the insights and full statement for the current **Unique identifier** and adds every new statement row as a real transaction in the chosen **Destination portfolio**.

**Why it exists:** Card text: "Projects every Finvu MF holding + statement row into the selected portfolio as real transactions. Idempotent — re-running skips already-imported rows (matched by Finvu txnId)."

**Where to find it:** **Asset Classes → Mutual Funds** → Finvu card → **Import into EveryPaisa**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Set the **Unique identifier** (S-MF-007).
2. Choose **Destination portfolio** (S-MF-008): **+ New "Finvu Imports" portfolio (auto-create)** or one of your portfolios.
3. Click **Import to portfolio**. It reads **Importing…**.
4. A toast reports "Imported N txns into "<portfolio>" (F funds, S skipped)" or "Nothing new — every Finvu txn already projected (S skipped)".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Destination portfolio** | Select | Target portfolio | Disabled while portfolios load or import runs |
| **Import to portfolio** | Button | Runs the import | Disabled when not configured, while running, or identifier empty |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Destination portfolio | Select | Yes | auto-create or an owned portfolio | + New "Finvu Imports" portfolio (auto-create) | Production: "Internal server error" when the portfolio is not yours |

**Settings and toggles here:** S-MF-007 **Unique identifier**; S-MF-008 **Destination portfolio** — auto-create reuses an existing portfolio named "Finvu Imports" or creates one.

**Results:** Transactions are created with a source hash per Finvu transaction id; scheme records are created or updated; each touched holding is recomputed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| Imported but the Mutual Funds tables did not change | The card refreshes cache keys this page does not use | Reload the page |
| A conflict or server error on rows another account already imported | Source hash is global, not per user (suspected) | See DOCUMENTATION_GAPS.md |

**Limitations:** Rows without a Finvu transaction id, an unmappable type, a date, units, NAV or amount are skipped. Creating "Finvu Imports" does not go through the plan's portfolio cap. Known defects are listed in DOCUMENTATION_GAPS.md (shared scheme records overwritten, no ownership check on the identifier, stale page after import).

**How it works:** `POST /api/integrations/finfactor/sync/mf {uniqueIdentifier, portfolioId?}`. The server fetches insights and the statement (oldest first) in parallel, upserts a scheme record per ISIN (scheme code from the payload, else the ISIN), then for each statement row computes `sha256("finvu:<txnId>")`, skips it if a transaction with that hash exists, maps the type, and creates the transaction with asset key `isin:<ISIN>`; finally it recomputes each touched holding. The toast reports created/skipped counts.

**Related features:** F-MF-009, F-MF-001.

**Sources:** `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:131`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:146`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:279`, `apps/web/src/pages/mutualFunds/FinvuSandboxCard.tsx:301`, `packages/api/src/routes/finfactor.routes.ts:63`, `packages/api/src/ingestion/finfactor/sync.service.ts:31`, `packages/api/src/ingestion/finfactor/sync.service.ts:135`, `packages/api/src/ingestion/finfactor/sync.service.ts:171`, `packages/api/src/ingestion/finfactor/sync.service.ts:224`, `packages/api/src/ingestion/finfactor/sync.service.ts:297`

What this area doesn't do:
- You can't edit a holding directly; holdings are computed from transactions (edit a transaction instead).
- There is no MF Central OTP sync or CDSL OTP flow in the UI, although the server has endpoints for both.
- The Mutual Funds page has no filter, search or sort controls on the holdings or transactions tables, and no pagination beyond 200 transactions.
- You can't see the status history of past CAS mailback requests in the app.
- ETFs are not listed in this page's holdings table.

## Mutual Fund Analytics

Mutual Fund Analytics is the research layer on top of your mutual fund book. It has three pages: **Portfolio analysis** (your own book: returns, overlap, look-through, cost, tax, goals), a **fund page** per scheme (score, metrics, findings and verdict), and **How we score a fund** (the methodology). Portfolio analysis and fund pages need the Plus plan or higher (feature `MF_ANALYTICS`); the methodology page is open to every signed-in user. A fixed disclaimer closes the analysis and fund pages: "Past performance does not guarantee future returns, and no analysis here predicts them. … Mutual fund investments are subject to market risks; read all scheme related documents carefully."

### Portfolio analysis — totals and scope notice <!-- F-MF-011 -->
**What it does:** The **Portfolio analysis** page opens with a summary card **Mutual fund book**: current value, invested value, number of schemes (and how many are equity-oriented), the as-of date, and six figures — **Absolute gain**, **Portfolio XIRR**, **Weighted TER**, **Annual cost**, **Effective funds**, **Redundancy** — plus **Switching to direct plans would save, per year**. When some data is hidden from you (family view caps), a restricted notice explains that totals are a floor.

**Why it exists:** Page description: "Your own returns, overlap, look-through exposure, cost and tax lots across every mutual fund you hold." Code comment: no fund website can offer this because none of them know the user's holdings.

**Where to find it:** **Asset Classes → Mutual Funds → Portfolio analysis** (route `/mutual-funds/analysis`). It is the only entry point.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees the lock card "Portfolio analytics is locked — Upgrade to Plus to unlock Portfolio analytics." with **View plans** (D-MF-005). In family view the figures aggregate every member you may read; R-MANAGER sees the managed person's book under the manager's plan.

**Steps**
1. Click **Portfolio analysis** on the Mutual Funds page. "Analysing your mutual fund book…" shows.
2. Read the summary card. Hover a figure's label for its hint (for example **Effective funds** "1 / Σ(weight²) — diversification across funds, not within them").
3. Click **How funds are scored** (top right) to open the methodology (F-MF-022).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **How funds are scored** | Link | Opens `/methodology/mf-score` | — |
| **View plans** | Button | Opens Pricing | Only on the lock card |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this page; the family view switcher (D-MF-009) changes whose data is included.

**Results:** Nothing is stored; the analysis is computed on request. The card says "Computed on request — not a stored run".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **Could not analyse your portfolio** + server message | Server error, or a family you are not a member of | Retry; switch view |
| "This feature requires the PLUS plan or higher" | Plan lapsed between page load and request | Upgrade |
| A figure shows "not available" with a reason | Not computable (for example no fund disclosed a TER) | None — the reason is shown instead of a zero |

**Limitations:** Figures are as fresh as the stored holdings and nightly reference data. Hidden asset classes make every "of net worth" share an over-statement; the notice says so.

**How it works:** `GET /api/mf-analytics/portfolio` resolves your effective scope (own data, or the family view in the `X-Viewing-As-Family` header) and computes the analysis over asset classes Mutual Fund and ETF. Positions are merged per scheme across portfolios and members. **Portfolio XIRR** uses your own dated cash flows with today's value as the closing inflow; it is "insufficient data" when there are fewer than two flows or no sign change, or when the solver does not converge. **Weighted TER** averages over funds that disclosed a TER; **Annual cost** applies it to value; **Effective funds** = 1 ÷ Σ(weight²); **Redundancy** = weighted mean pairwise overlap; the direct-plan saving is the TER gap to each regular plan's direct sibling on today's value.

**Related features:** F-MF-012 to F-MF-017, F-MF-022, D-MF-009.

**Sources:** `apps/web/src/pages/mf/MfPortfolioPage.tsx:60`, `apps/web/src/pages/mf/MfPortfolioPage.tsx:77`, `apps/web/src/pages/mf/MfPortfolioPage.tsx:85`, `apps/web/src/pages/mf/components/PortfolioTotals.tsx:92`, `apps/web/src/pages/mf/components/PortfolioTotals.tsx:136`, `apps/web/src/pages/mf/components/MfScopeNotice.tsx:1`, `apps/web/src/components/common/LockedFeature.tsx:42`, `packages/api/src/routes/mfPortfolio.routes.ts:46`, `packages/api/src/controllers/mfPortfolio.controller.ts:84`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:145`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:533`, `packages/shared/src/mfAnalytics.constants.ts:29`

### Funds you hold <!-- F-MF-012 -->
**What it does:** A table **Funds you hold** with one row per scheme: **Scheme** (AMC logo, name linking to the fund page, AMC · plan type · "SIP active" · "held N days"), **Score** (score and stars, or a status chip, plus the risk-o-meter), **Units**, **Invested**, **Value**, **Gain** (₹ and %), **Your XIRR**, **Fund CAGR**, **Timing**, **Weight** (share of the MF book, and "of net worth").

**Why it exists:** Page text: "Your XIRR is computed from your actual cash flows … Fund CAGR is what a single lump sum on the day you first bought would have returned. The difference is timing, and it is stated rather than judged."

**Where to find it:** **Portfolio analysis** page, second section.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read each row. Hover a status chip for its meaning (for example **Not scored**: "The scoring job has not covered this scheme yet. That is our coverage, not a judgement on the fund.").
2. Click a scheme name to open its fund page (F-MF-018).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Scheme name | Link | Opens `/mutual-funds/<scheme code>` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **No mutual fund holdings in this view** | Nothing held (or everything hidden by caps) | Import a CAS or add a transaction |
| **Fund CAGR** "not available" | No NAV on the first purchase day, or held under 365 days | None |

**Limitations:** **Fund CAGR** is only given for holdings of at least 365 days (shorter periods are not annualised). Positions without a linked scheme are skipped. A fund with no research metadata is still listed, with sub-category "UNMAPPED".

**How it works:** Per scheme, XIRR uses purchases/SIPs as outflows and redemptions/payouts as inflows plus current value; fund CAGR uses the NAV on or before your first purchase date to today; **Timing** = your XIRR − fund CAGR (no colour, descriptive). Weight in net worth uses all visible holdings as the denominator.

**Related features:** F-MF-011, F-MF-018.

**Sources:** `apps/web/src/pages/mf/components/HeldFunds.tsx:44`, `apps/web/src/pages/mf/components/HeldFunds.tsx:55`, `apps/web/src/pages/mf/components/HeldFunds.tsx:75`, `apps/web/src/pages/mf/components/HeldFunds.tsx:218`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:170`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1210`

### Overlap <!-- F-MF-013 -->
**What it does:** The **Overlap** section lists, for each pair of your funds, the share of their portfolios made of the same securities, in two tables: **Equity funds** ("Common ISINs across the two portfolios.") and **Debt funds** ("Same formula, computed by issuer rather than by security."). Each row shows **Pair**, **Overlap** and **Snapshots** dates; pairs in the same sub-category get a **Same sub-category** badge. Expanding a pair lists the top shared holdings with their weight in each fund.

**Why it exists:** Section text: "Two funds in the same sub-category that overlap heavily are one position wearing two names, and you pay two expense ratios for it."

**Where to find it:** **Portfolio analysis** page, **Overlap** section.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the pair tables.
2. Click a pair to expand **Shared holding** / **Weight in <fund A>** / **Weight in <fund B>**; click again to collapse.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Pair row | Toggle button | Expands shared holdings | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **No pair could be compared** | Fewer than two funds have a usable holdings disclosure at close dates | None — a data coverage gap |
| "N funds are missing from this comparison …" | Those funds have no usable disclosure | Treat figures as a lower bound |

**Limitations:** Only pairs whose two disclosures are at most 31 days apart are compared. Up to 10 shared securities are listed per pair.

**How it works:** Overlap = Σ min(weight in A, weight in B) over common holdings, keyed by ISIN for equity and by issuer for debt, using the latest stored portfolio snapshots.

**Related features:** F-MF-008, F-MF-014.

**Sources:** `apps/web/src/pages/mf/components/OverlapMatrix.tsx:45`, `apps/web/src/pages/mf/components/OverlapMatrix.tsx:55`, `apps/web/src/pages/mf/components/OverlapMatrix.tsx:85`, `apps/web/src/pages/mf/components/OverlapMatrix.tsx:159`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:151`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:158`

### Look-through <!-- F-MF-014 -->
**What it does:** The **Look-through** section adds up what your funds own underneath: **Asset class** split, **Sectors**, **Underlying stocks** (top 25, with **Of MF book**, **Of net worth**, **Held through**), **Market cap** (Large cap, Mid cap, Small cap, Unclassified), **Credit quality** (Sovereign, AAA, AA+, AA, AA-, A and below, Unrated) and, if you have a model portfolio, **Against your target allocation** (**Sleeve**, **Actual**, **Target**, **Drift**).

**Why it exists:** Inferred from behavior and page description: shows "look-through exposure" — what the book actually owns once you look through the fund wrappers.

**Where to find it:** **Portfolio analysis** page, **Look-through** section.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. The target comparison uses the caller's own latest risk-profile model portfolio (D-MF-007).

**Steps**
1. Read each block. Unavailable blocks state why (for example **No underlying holdings to aggregate**).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | Display only | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **No underlying holdings to aggregate** | No fund has a disclosure on file | None — coverage gap |
| **Against your target allocation** missing | No risk profile with a model portfolio | Complete the Advisor risk profile (D-MF-007) |

**Limitations:** Funds without disclosures are left out, so look-through figures are a floor; the section says which funds are missing. "Absolute weights only — we have not loaded index constituents to compare against."

**How it works:** Each fund's disclosed weights are scaled by its share of your MF book and summed. The target comes from the latest risk-profile assessment that has a model portfolio, using that portfolio's newest version.

**Related features:** F-MF-013, D-MF-007.

**Sources:** `apps/web/src/pages/mf/components/LookThrough.tsx:46`, `apps/web/src/pages/mf/components/LookThrough.tsx:108`, `apps/web/src/pages/mf/components/LookThrough.tsx:258`, `apps/web/src/pages/mf/components/LookThrough.tsx:305`, `apps/web/src/pages/mf/components/LookThrough.tsx:337`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:148`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1695`

### Cost <!-- F-MF-015 -->
**What it does:** The **Cost** section shows **Weighted TER**, **Annual cost**, **Cost rank in category** ("Higher is cheaper") and **Direct-plan saving, per year**, then a table **Scheme**, **TER**, **Direct sibling**, **Its TER**, **Annual saving**.

**Why it exists:** Code comment: the direct-plan saving "is usually the single largest actionable number in a retail portfolio — a recurring charge with a known size that stops when the plan changes."

**Where to find it:** **Portfolio analysis** page, **Cost** section.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the four figures and the table. Missing values show the reason (for example "this scheme has not disclosed an expense ratio to us").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | Display only | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| TER "not available" | No TER disclosed for the scheme | None |
| **Direct sibling** missing | No direct-plan sibling matched | None |

**Limitations:** Weighted TER covers only funds that disclosed a TER, so it is a floor.

**How it works:** Annual cost = weighted TER × current value; annual saving per regular scheme = (its TER − direct sibling TER) × its current value; cost rank is a value-weighted mean of each fund's cost percentile in its category.

**Related features:** F-MF-011, F-MF-008.

**Sources:** `apps/web/src/pages/mf/components/CostPanel.tsx:52`, `apps/web/src/pages/mf/components/CostPanel.tsx:72`, `apps/web/src/pages/mf/components/CostPanel.tsx:81`, `apps/web/src/pages/mf/components/PortfolioTotals.tsx:156`

### Tax lots <!-- F-MF-016 -->
**What it does:** The **Tax** section shows **Unrealised STCG**, **Unrealised LTCG**, **§112A headroom** and **Financial year**, a list **Lots currently at a loss**, and **Open lots**: **Scheme**, **Bought**, **Units**, **Cost**, **Value**, **Gain**, **Type** (STCG/LTCG and days to LTCG), **Exit load**, **Tax if sold today**.

**Why it exists:** Inferred from behavior: tells you what selling any lot today would cost in exit load and tax, and how much of the annual LTCG exemption is left.

**Where to find it:** **Portfolio analysis** page, **Tax** section.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the summary, then the lots. Days to LTCG of 60 or fewer are highlighted amber. A marker on the cost shows when the 31 January 2018 value was used ("Cost basis substituted with the fair market value on 31 January 2018 under §112A, because that is higher than what you paid.").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | Display only | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **No open lots** | No unredeemed purchase lots | None |
| **Exit load** "unknown" | No exit-load ladder on file | Check the scheme document |
| **Tax if sold today** "not available" | Short-term gain on a non-equity fund is taxed at your slab, which is not on file | None |

**Limitations:** Long-term is decided by days held: 360 days (12 × 30) for equity-oriented funds and 1,080 days (36 × 30) for others — not calendar months, matching the capital gains engine. **Tax if sold today** per lot does not subtract the §112A exemption, so summing lots overstates tax by up to the headroom. Unrealised debt LTCG uses the non-indexed rate.

**How it works:** Lots are open FIFO purchase lots. Tax uses the rules in force today: since 23 July 2024, 20% STCG and 12.5% LTCG for listed equity, 12.5% LTCG without indexation for others (before: 15% / 10% / 20%). Grandfathered cost = max(actual cost, min(FMV on 31 Jan 2018, current value)) for equity lots bought on or before that date. Exit load = current value × the first ladder step whose day limit covers the holding period, 0 after the ladder. §112A headroom = exemption for the FY (₹1,00,000 for FY 2018-19 to 2023-24; ₹1,25,000 from FY 2024-25; latest value carried forward) minus realised equity LTCG this FY across every member you can read, floored at 0.

**Related features:** F-MF-011, D-MF-012.

**Sources:** `apps/web/src/pages/mf/components/TaxLots.tsx:42`, `apps/web/src/pages/mf/components/TaxLots.tsx:53`, `apps/web/src/pages/mf/components/TaxLots.tsx:128`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:183`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1066`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1274`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1354`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:2297`, `packages/shared/src/finance/ltcg112a.ts:32`, `packages/shared/src/finance/capitalGainsTaxRules.ts:70`

### Goals fit <!-- F-MF-017 -->
**What it does:** The **Goals** section shows, for each active goal linked to portfolios that hold funds, a suitability chip (**Suitable**, **Mismatch**, **Underpowered**), **Horizon**, **Projected value**, **Target value** and **Shortfall**.

**Why it exists:** Component text: projections use "the fund's category median rolling return, not its own past return. Using the fund's own history is the classic over-promise."

**Where to find it:** **Portfolio analysis** page, **Goals** section (hidden when no goal maps to a fund).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO with goals in **Planning → Goals** (D-MF-008).

**Steps**
1. Read each goal card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | Display only | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Section absent | No active goal with linked portfolios holding funds | Link portfolios to a goal (D-MF-008) |
| **Projected value** "not available" | No category-median rolling return for these funds | None |

**Limitations:** Only the caller's own goals are used, even in family view. Suitability bands (years): active equity, index, solution and FoF at least 5; hybrid at least 3; debt duration 1–10; ultra-short debt 0–5; small/mid-cap mandates at least 7.

**How it works:** Funds belong to a goal when any of their transactions is in a portfolio linked to the goal. Horizon = years to target date. Target value is inflation-adjusted when the goal has an inflation rate. Shortfall needs both projection and target.

**Related features:** D-MF-008.

**Sources:** `apps/web/src/pages/mf/components/GoalFit.tsx:9`, `apps/web/src/pages/mf/components/GoalFit.tsx:63`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:197`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:214`, `packages/api/src/services/mf/mfAnalytics/mfPortfolioAnalysis.service.ts:1798`

### Fund detail — Overview <!-- F-MF-018 -->
**What it does:** A fund page (`/mutual-funds/<scheme code>`) shows the AMC logo, scheme name, "AMC · SEBI category / sub-category · plan type plan" and, on the default **Overview** tab, a plain-language summary: a score out of 100 with stars and a verdict headline (for example "One of the strongest funds in its category"), a scale against the category median and top quartile, strengths and weaknesses by pillar, three headline numbers (**Growth per year (NY)**, **Worst fall**, **Bumpiness**), a chart **What holding it has meant** of every completed 1/3/5-year holding period, alternatives (F-MF-019) and **Show the full calculations**.

**Why it exists:** Code comment: Overview is the default "because the reader who needs the most help is the one least likely to go looking for a toggle."

**Where to find it:** Click a scheme name in **Funds you hold** (F-MF-012) or in the alternatives list.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees "Fund analytics is locked".

**Steps**
1. Open a fund page. "Loading fund analytics…" shows.
2. Read the verdict, strengths/weaknesses and numbers.
3. Hover or explore the holding-period charts.
4. Click **Show the full calculations** or the **Detailed calculations** tab (F-MF-020).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Overview** / **Detailed calculations** | Tabs | Switch view (S-MF-010) | Shown once data loads |
| Holding-period chart | Interactive chart | Explore periods | Hidden when no rolling data |
| **Show the full calculations** | Link button | Switches to Detailed calculations | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-MF-010 **Overview / Detailed calculations** — Overview by default; not saved.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **Could not load this fund** — "Unknown scheme code: <code>" | No research record for this scheme code | Check the link; the scheme may not be in the research universe |
| **Not rated** — "We have not scored this fund. …" | No score yet | None |
| **Not rated** — "Not enough track record to rate it fairly yet. …" | Under 36 months of history | None |
| **Not rated** — "… Its category holds N schemes we can score, which is too few." | Fewer than 10 peers | None |
| "These figures are the growth option's." | Payout/reinvest option shown with its growth sibling's score | None |

**Limitations:** Verdict headlines are fixed per star rating. A pillar is a strength at 0.6 or above and a weakness below 0.4; "Fund house & manager" is never named as a strength or the weakest side. The summary horizon is the first available of 3, 5, 10, 7, 1 years.

**How it works:** One read, `GET /api/mf-analytics/schemes/:schemeCode/analytics`, returns meta, score, metrics per horizon, portfolio profile, peer ranks and category stats. If the scheme has no score but has a growth sibling with one, the sibling's metrics, profile, score and peers are used and the page says so.

**Related features:** F-MF-019, F-MF-020, F-MF-021, F-MF-022.

**Sources:** `apps/web/src/pages/mf/FundDetailPage.tsx:56`, `apps/web/src/pages/mf/FundDetailPage.tsx:164`, `apps/web/src/pages/mf/FundDetailPage.tsx:189`, `apps/web/src/pages/mf/components/PlainOverview.tsx:113`, `apps/web/src/pages/mf/components/PlainOverview.tsx:201`, `apps/web/src/pages/mf/components/PlainOverview.tsx:216`, `apps/web/src/pages/mf/components/PlainOverview.tsx:239`, `apps/web/src/pages/mf/components/PlainOverview.tsx:290`, `apps/web/src/pages/mf/components/PlainOverview.tsx:1107`, `apps/web/src/pages/mf/components/PlainOverview.tsx:1119`, `apps/web/src/pages/mf/components/PlainOverview.tsx:1398`, `packages/api/src/controllers/mfAnalytics.controller.ts:135`, `packages/api/src/controllers/mfAnalytics.controller.ts:657`

### Fund alternatives <!-- F-MF-019 -->
**What it does:** On the fund **Overview**, **Ranked higher by your adviser** lists up to 3 funds in the same category that the adviser's signed fund ranking places above this one, with AMC, stars, yearly cost when known, score and the score gap (+N), each with a mini holding-period chart. It ends with "This fund charges X% a year." or a note that no expense ratios are held.

**Why it exists:** Section text: "Same category, placed above this fund in the adviser's fund ranking — the list the Advisor page recommends from. A comparison, not advice to switch: moving funds can trigger an exit load and a tax bill this page cannot see."

**Where to find it:** Fund page → **Overview** → **Ranked higher by your adviser**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the list; click a fund to open its page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Alternative fund row | Link | Opens that fund's page | Section hidden when no alternatives |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No fund in its category is ranked above this one by your adviser right now." | This fund leads its ranking bucket | None |
| Section absent | No signed ranking, a stale ranking, or no score for this fund | None |

**Limitations:** The links perform a full page load. Nothing is listed when the adviser has no signed, fresh ranking.

**How it works:** `GET /api/mf-analytics/schemes/:schemeCode/alternatives` takes the fund's latest score, the rated schemes in the same universe at the same date, and the adviser's latest signed ranking; candidates must be in the same ranking bucket with a better (lower) rank; sorted by rank, at most 3.

**Related features:** F-MF-018, D-MF-007.

**Sources:** `apps/web/src/pages/mf/components/PlainOverview.tsx:1290`, `apps/web/src/pages/mf/components/PlainOverview.tsx:1303`, `apps/web/src/pages/mf/components/PlainOverview.tsx:1387`, `packages/api/src/routes/mfAnalytics.routes.ts:78`, `packages/api/src/services/mf/mfAnalytics/mfAlternatives.service.ts:57`, `packages/api/src/services/mf/mfAnalytics/mfAlternatives.service.ts:161`, `packages/api/src/services/mf/mfAnalytics/mfAlternatives.service.ts:184`

### Fund detail — Detailed calculations <!-- F-MF-020 -->
**What it does:** The **Detailed calculations** tab shows: the **Fund score** card (composite, stars, rating status, risk-o-meter, category universe, median and top-quartile scores, expandable pillar breakdown with **Input**, **Value**, **Category median**, **Percentile**, **Weight**, **Across horizons**); **Performance and risk** with horizon tabs **1Y 3Y 5Y 7Y 10Y** and metric groups **Returns**, **Risk**, **Risk-adjusted**, **Consistency** (plus rolling distribution, drawdown, calendar-year table and category percentiles); the findings block (F-MF-021); portfolio characteristics (holdings, top 10 weight, HHI, effective holdings, cash, active share, turnover, style drift, market cap, sectors, top holdings, debt metrics); and **Fund facts** (TER, category median TER, AUM, manager tenure, AMC, SEBI category, ISIN, benchmark, inception, minimum SIP, status).

**Why it exists:** Inferred from behavior: the full evidence behind the Overview for readers who want every metric.

**Where to find it:** Fund page → **Detailed calculations** tab.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Detailed calculations**.
2. Click a horizon tab (S-MF-011); the metrics and percentiles switch to that horizon.
3. Expand a pillar in the score card to see its inputs.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1Y**, **3Y**, **5Y**, **7Y**, **10Y** | Tabs | Select horizon | — (all five always shown) |
| Pillar row | Toggle | Shows the pillar's inputs | Only when a score exists |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-MF-010 **Overview / Detailed calculations**; S-MF-011 **Horizon tabs** — defaults to the shortest horizon with data, else 3Y; not saved.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **No NY-year record** | No metrics at that horizon ("… it is not a return of zero.") | Pick another horizon |
| **No category ranking at this horizon** | No peer ranks at that horizon | None |
| **No portfolio disclosure on file** | No holdings snapshot | None |
| **Relative metrics are not available** | No benchmark-relative data | None |

**Limitations:** All five horizon tabs show even when empty, by design.

**How it works:** Same single read as F-MF-018. Metrics, peers and scores are produced by the nightly and monthly jobs (F-MF-023).

**Related features:** F-MF-018, F-MF-021, F-MF-023.

**Sources:** `apps/web/src/pages/mf/FundDetailPage.tsx:203`, `apps/web/src/pages/mf/FundDetailPage.tsx:208`, `apps/web/src/pages/mf/FundDetailPage.tsx:229`, `apps/web/src/pages/mf/components/ScoreCard.tsx:61`, `apps/web/src/pages/mf/components/HorizonMetricsPanel.tsx:225`, `apps/web/src/pages/mf/components/PeerPercentiles.tsx:26`, `apps/web/src/pages/mf/components/PortfolioCharacteristics.tsx:48`, `apps/web/src/pages/mf/components/StructuralFacts.tsx:39`, `packages/shared/src/mfAnalytics.types.ts:98`

### Findings, verdict and Refresh analysis <!-- F-MF-021 -->
**What it does:** The **What we found** block on the Detailed calculations tab shows the latest analysis run of *your* portfolio for this fund: a verdict chip (**Hold**, **Monitor**, **Review**, **Switch candidate**, **Not enough data**) with its meaning, "Driven by: …" reasons, the cost of switching (**Exit load if sold today**, **Tax if sold today**, **Break-even**), optional verified narrative, and the list of findings with evidence tables. **Refresh analysis** runs a new analysis.

**Why it exists:** Inferred from behavior: turns the rule checks into a per-fund conclusion you can act on, with the cost of acting.

**Where to find it:** Fund page → **Detailed calculations** → **What we found**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. The analysis is always of the caller's own holdings.

**Steps**
1. Open **Detailed calculations**. "Loading analysis…" shows.
2. Read the verdict and findings. If no run exists: "No analysis has run for your portfolio yet … Use Refresh analysis to run one."
3. Click **Refresh analysis**. It reads **Re-running…**; when done, all fund pages show the new run.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh analysis** | Button | Runs a new analysis | Disabled while running |

**Fields and rules:** Not applicable — no input.

**Settings and toggles here:** None.

**Results:** A new analysis run with findings and verdicts is stored for you; previous verdicts are superseded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Analysis was refreshed less than an hour ago. Next refresh available at <time>." | 1 refresh per hour | Wait until the stated time (UTC ISO format) |
| **No verdict for this fund** — "The latest run reached no standing conclusion …" | You do not hold the fund, or it was added after the run | Refresh |
| **This analysis is incomplete.** | Some rule categories failed this run | Treat missing categories as unknown |
| **Could not load the analysis** | Server error | Retry |

**Limitations:** Runs happen only when you press **Refresh analysis**: the automatic triggers (holdings change, new score) exist in code but nothing calls them, so the shown run can be out of date. Unless the operator enables RIA verdicts, **Switch candidate** is shown as **Review**, no replacement is named, and the note reads "Analysis only. This deployment is not registered to give investment advice …". **Break-even** is always "not available" in this build because the expected cost edge is not set.

**How it works:** Reads `GET /api/mf-analytics/runs/latest`, `/funds/:code/findings`, `/funds/:code/verdict` (only runs with status COMPLETED or PARTIAL count). `POST /api/mf-analytics/refresh` checks the 60-minute cooldown, runs the analysis in your own data context and returns the run. Verdict rules: not rated and no critical finding → Not enough data; any critical finding → Switch candidate if a replacement exists, else Review; rating ≤ 2 with persistent underperformance and one more warning and break-even ≤ 24 months → Switch candidate; rating ≤ 2 or two or more warnings → Review; rating 3, one warning, a manager change or a recent reversal → Monitor; otherwise Hold. Narrative text appears only when an LLM narration was generated and verified.

**Related features:** F-MF-020, F-MF-023.

**Sources:** `apps/web/src/pages/mf/FundDetailPage.tsx:109`, `apps/web/src/pages/mf/components/FundAnalysis.tsx:118`, `apps/web/src/pages/mf/components/FundAnalysis.tsx:140`, `apps/web/src/pages/mf/components/FundAnalysis.tsx:174`, `apps/web/src/pages/mf/components/VerdictChip.tsx:35`, `apps/web/src/pages/mf/components/VerdictChip.tsx:60`, `packages/api/src/controllers/mfFindings.controller.ts:113`, `packages/api/src/controllers/mfFindings.controller.ts:212`, `packages/api/src/controllers/mfFindings.controller.ts:343`, `packages/api/src/jobs/mfAnalysisJob.ts:72`, `packages/api/src/jobs/mfAnalysisJob.ts:277`, `packages/api/src/services/mf/mfAnalytics/mfVerdict.ts:385`, `packages/api/src/services/mf/mfAnalytics/constants.ts:67`, `packages/api/src/services/mf/mfAnalytics/constants.ts:86`, `packages/api/src/services/mf/mfAnalytics/constants.ts:121`

### Scoring methodology <!-- F-MF-022 -->
**What it does:** **How we score a fund** shows the scoring rules read live from the scorer: an overview (percentile ranks within the fund's own SEBI sub-category; minimum 36 months of history; minimum 10 schemes per category; required pillars), the rating buckets table (**Rating**, **Share of category**, **Ranked above it**), **Horizon blending**, and one table per scoring model (**Pillar**, **Weight**, **Input**, **Within pillar**, **Direction**).

**Why it exists:** Code comment: it is how someone decides whether a rating is worth trusting, "which they must be able to do before buying the plan that shows them ratings", so it is not plan-gated.

**Where to find it:** **Portfolio analysis → How funds are scored** (route `/methodology/mf-score`).

**Who can use it:** Every signed-in user (R-FREE and up). Signed-out visitors are sent to sign in.

**Steps**
1. Open the page. "Loading the scoring models…" shows.
2. Read the sections.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | Display only | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None; read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **Could not load the scoring methodology** | Server error, or the payload failed validation | Retry later |
| "not declared — treat this row as unverified" in **Direction** | A metric has no declared direction in the scorer | Report it |

**Limitations:** Cached for 1 hour in the browser.

**How it works:** `GET /api/mf-analytics/methodology` returns constants: math version 1.0.0; rating cut-offs at 10%, 32.5%, 67.5%, 90% of the category from the top (5★ top 10%, 4★ next 22.5%, 3★ middle 35%, 2★ next 22.5%, 1★ bottom 10%); horizon base weights 3Y 20, 5Y 30, 10Y 50; required pillars Performance, Consistency, Tracking (where a model has them); models active equity, debt duration, ultra-short debt, FoF, hybrid, index.

**Related features:** F-MF-018, F-MF-020.

**Sources:** `apps/web/src/pages/mf/MethodologyPage.tsx:64`, `apps/web/src/pages/mf/MethodologyPage.tsx:71`, `apps/web/src/pages/mf/MethodologyPage.tsx:87`, `apps/web/src/pages/mf/MethodologyPage.tsx:238`, `packages/api/src/routes/mfPortfolio.routes.ts:56`, `packages/api/src/controllers/mfPortfolio.controller.ts:188`, `packages/api/src/services/mf/mfAnalytics/mfScoring/mfScoreMath.ts:408`, `packages/api/src/services/mf/mfAnalytics/mfScoring/mfScoreMath.ts:624`, `packages/api/src/services/mf/mfAnalytics/mfScoring/mfScoreMath.ts:683`, `packages/shared/src/mfAnalytics.constants.ts:52`, `packages/shared/src/mfAnalytics.constants.ts:62`

### Fund research data pipeline <!-- F-MF-023 -->
**What it does:** Scheduled server jobs keep the research data behind the fund pages current: NAV adjustment for payouts (22:30 IST daily), metrics (23:15 daily), peer ranks (00:30 daily), monthly rating chain that recomputes month-end metrics, ranks and scores (15th of each month 03:30), scheme metadata (1st of each month 02:00), NAV history backfill (Sundays 03:00), reconciliation (5th of each month 03:00), benchmark prices (20:00 daily), risk-free rate (Mondays 06:00), and data-operations alert emails to active administrators (06:30 daily). A narration job writes verified prose for verdicts when enabled.

**Why it exists:** Inferred from behavior: fund scores, metrics and peer ranks are computed from published NAVs and disclosures, not from user input.

**Where to find it:** No page of its own; results appear on fund pages (F-MF-018, F-MF-020) and in **Funds you hold** scores. All times IST.

**Who can use it:** System. R-ADMIN receives the ops alert emails.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no input.

**Settings and toggles here:** None for users; operator switches are listed under Operator configuration.

**Results:** Updated scores, ratings, metrics and metadata on fund pages.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Fund shows **Not scored** | The scoring job has not covered it | Wait for the monthly rating chain |

**Limitations:** Ratings change monthly (15th), not daily. The factsheet job is registered but runs only manually. Whether each job ran successfully in a given environment cannot be verified from code.

**How it works:** Jobs start at API boot unless their `ENABLE_*` switch is `false`. The prose job runs only with an Anthropic key and `ENABLE_LLM_ADVISOR_PROSE=true`; a failed narration never changes a verdict.

**Related features:** F-MF-020, F-MF-021, D-MF-010.

**Sources:** `packages/api/src/jobs/mfNavAdjustmentJob.ts:181`, `packages/api/src/jobs/mfMetricsJob.ts:322`, `packages/api/src/jobs/mfPeerRankJob.ts:245`, `packages/api/src/jobs/mfScoreJob.ts:245`, `packages/api/src/jobs/mfReconciliationJob.ts:1564`, `packages/api/src/jobs/mfNavHistoryBackfillJob.ts:721`, `packages/api/src/jobs/mfOpsAlertsJob.ts:75`, `packages/api/src/jobs/benchmarkPriceJob.ts:270`, `packages/api/src/jobs/riskFreeRateJob.ts:194`, `packages/api/src/jobs/mfProseJob.ts:236`, `packages/api/src/index.ts:285`

What this area doesn't do:
- It does not search for or browse funds you don't hold; a fund page opens only from a link (or a typed scheme code).
- It does not place orders or switch funds.
- It does not run analyses on a schedule; findings refresh only when you press **Refresh analysis**.
- It does not use your income-tax slab, so short-term tax on non-equity funds is not estimated.
- There is no export of the analysis.
<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any Mutual Funds or analytics page (sent to sign in).

### Free user <!-- R-FREE -->
Full Mutual Funds page, CAS imports, mailback requests, AMFI sync, Direct vs Regular card and methodology page; analysis and fund pages are locked.

### Plus subscriber <!-- R-PLUS -->
Everything Free has, plus Portfolio analysis, fund pages, findings and the Finvu buttons.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in this area.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Plus in this area.

### Administrator <!-- R-ADMIN -->
Plan decides access as for others; additionally can use the hidden MF qualitative facts page and receives MF data-ops alert emails.

### Family owner <!-- R-FAMOWNER -->
In family view, holdings and analysis include every active member's data.

### Family contributor <!-- R-FAMCONTRIB -->
In family view, sees members' fund data within their caps; analysis marks capped figures as partial.

### Family viewer <!-- R-FAMVIEWER -->
As contributor for reading.

### Managing a family member's account <!-- R-MANAGER -->
Pages show the managed person's funds under the manager's plan; see role notes for the PAN mismatch in the CAMS / KFintech dialog.

### Professional acting for a client <!-- R-PROF -->
Not applicable here — client books are in the CA workspace.

### AI chatbot connection <!-- R-AICONN -->
No access to these pages.

### Succession nominee <!-- R-NOMINEE -->
No access.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| AMFI NAV | The daily net asset value per unit published by AMFI; used to price mutual fund holdings. |
| CAS | Consolidated Account Statement — a PDF from CAMS/KFintech (or CDSL/NSDL) listing your mutual fund folios and transactions. |
| CASParser | casparser.in, a third-party service the app uses to request a KFintech CAS by PAN + email. |
| Mailback | A registrar's "email me my statement" request; the CAS arrives by email locked with a password. |
| Direct / Regular plan | Two plans of the same scheme; Regular includes distributor commission and costs more each year. |
| Overlap | Σ min(weight in fund A, weight in fund B) over securities both funds hold. |
| Look-through | Your exposure to the stocks, sectors and bonds inside your funds, weighted by what you hold. |
| TER | Total expense ratio — the yearly charge a fund deducts, as a % of assets. |
| Effective funds | 1 ÷ Σ(weight²) across your funds; how many equal-sized funds your book behaves like. |
| Redundancy | Value-weighted mean pairwise overlap between your funds. |
| XIRR | Annualised return computed from your own dated cash flows. |
| Fund CAGR | The fund's annualised NAV growth from your first purchase date to today. |
| Timing | Your XIRR minus the fund CAGR over the same period. |
| §112A headroom | Annual exemption on long-term gains from equity funds left this financial year after realised gains. |
| Grandfathering | For equity bought on or before 31 January 2018, cost can be raised to that day's fair market value. |
| Pillar | A group of metrics in a fund's score (for example Returns, Consistency, Cost). |
| Verdict | The per-fund conclusion of an analysis run: Hold, Monitor, Review, Switch candidate, Not enough data. |
| Finding | One rule result with evidence, from an analysis run. |
| Risk-o-meter | SEBI's risk label for a scheme (Low to Very High). |
| Finvu / Finfactor Wealthscape | An account-aggregator provider and its data API used by the sandbox card. |
<!-- END GLOSSARY -->
