# EveryPaisa User Manual — Reports, Tax, Analytics, Portfolio Score (B08 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Reports (`/reports`), Tax Planning (`/tax`), Analytics (`/analytics`), Portfolio Score (`/health-score`), nightly stored-data integrity check

## Contents
- [Reports](#reports)
- [Tax Planning](#tax-planning)
- [Analytics](#analytics)
- [Portfolio Score](#portfolio-score)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Reports

The **Reports** page (sidebar **Tools → Reports**, route `/reports`, page title "Reports — Capital gains, income, XIRR and historical valuation") is where you read and download figures computed from your transactions: on-screen tables for capital gains, income, XIRR and valuation history, four statements, a catalog of 42 print-style "Tax & MIS" downloads, and the review queue for documents found in your Gmail. A data-checks banner above the tabs says whether the figures can be trusted. The same reporting engine also powers the **Download** button that appears on many other pages (F-REPORT-016), and a nightly job keeps stored figures in step with your transactions (F-REPORT-017).

### Reports page filters and tabs <!-- F-REPORT-001 -->
**What it does:** Gives the page its common filter card — **Portfolio**, **Report for** (only when you can report on someone else), **Financial Year** (only on tabs that need one) — and a row of 12 tabs: **Summary**, **Tax & MIS downloads**, **Statements**, **Unrealised P&L**, **Intraday**, **STCG**, **LTCG**, **Schedule 112A**, **Income**, **XIRR**, **Historical**, **Inbox imports**. Only the open tab's data is fetched.

**Why it exists:** One place for every report, with one set of filters, so the same portfolio and year apply as you move between tabs. The default of **All portfolios** exists so "a brand-new user (or one whose first portfolio happens to be empty) sees real numbers, not zeros" (code comment).

**Where to find it:** **Tools → Reports** (route `/reports`). A tab can be opened directly with `/reports?tab=<key>` (for example `/reports?tab=inbox-imports`); an unknown key opens **Summary**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (all tabs open; some downloads are plan-gated, see F-REPORT-013 and F-REPORT-014). R-MANAGER sees the managed person's data. R-VISITOR is sent to sign in.

**Steps**
1. Open **Tools → Reports**. The **Summary** tab opens with **All portfolios** selected.
2. Pick a portfolio in **Portfolio** if you want one book only. The open tab reloads for that portfolio.
3. On **Intraday**, **STCG**, **LTCG**, **Schedule 112A** or **Income**, choose a year in **Financial Year**. The table reloads.
4. Click any tab to switch report. The filters stay as you set them.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Portfolio** | Select | **All portfolios** or one of your portfolios (S-REPORT-001) | Never hidden |
| **Report for** | Select | Whose figures the downloads on this page cover (S-REPORT-002) | Hidden when you are not viewing a family, or your family view is capped, or the family has no other active member |
| **Financial Year** | Select | Year for FY-based tabs (S-REPORT-003) | Shown only on Intraday, STCG, LTCG, Schedule 112A, Income |
| **Excel**, **PDF** | Buttons | Download the open tab (F-REPORT-010) | Shown only on Unrealised P&L, Intraday, STCG, LTCG, Schedule 112A, Income |
| Tab buttons (12) | Tabs | Switch report | Never |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | `all` or a portfolio id | **All portfolios** | "Forbidden" if the portfolio is not yours (see Limitations) |
| Financial Year | Select | Yes on FY tabs | Current FY and the 7 before it, as "2026-27" | Current Indian FY (April–March, computed in UTC) | "Invalid financial year "…" — expected consecutive years like 2025-26" (server) |

**Settings and toggles here:** S-REPORT-001 **Portfolio** — one book or all; S-REPORT-002 **Report for** — Me / Whole family / one member, downloads only; S-REPORT-003 **Financial Year** — the year for FY-based tabs. None of them is saved; all reset when you leave the page.

**Results:** Nothing is changed in your data; the tables and downloads follow the chosen filters.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A tab stays empty with no message | The request failed (for example "Forbidden" on a portfolio you do not own) and the page shows nothing on error | Choose **All portfolios** or one of your own portfolios |
| "Select a portfolio to view reports." | No portfolio value is set | Pick a value in **Portfolio** |

**Limitations:** The filters are not remembered between visits. In a family view the **Portfolio** list also shows portfolios belonging to other members (the list follows the family view) but every Reports endpoint accepts only portfolios you own, so picking one of theirs leaves the tab empty — use **Report for** downloads instead (see DOCUMENTATION_GAPS.md). On-screen tables are always about you; only downloads follow **Report for**.

**How it works:** The page keeps tab, portfolio (`all` by default) and FY in component state. Each tab is a separate query keyed by portfolio and, where relevant, FY, and enabled only while that tab is open. The server resolves `portfolioId=all` to "every portfolio you own" and otherwise checks the portfolio's owner equals the caller (403 otherwise). FY values are validated as consecutive years. Tab keys accepted from the URL: summary, statements, tax-mis, intraday, stcg, ltcg, schedule-112a, income, unrealised, xirr, historical, inbox-imports.

**Related features:** F-REPORT-002 (search), F-REPORT-003 (data checks), F-REPORT-004 to F-REPORT-015 (tabs), D-REPORT-007 (family view switcher).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:43`, `apps/web/src/pages/reports/ReportsPage.tsx:139`, `apps/web/src/pages/reports/ReportsPage.tsx:181`, `apps/web/src/pages/reports/ReportsPage.tsx:197`, `apps/web/src/pages/reports/ReportsPage.tsx:289`, `apps/web/src/pages/reports/ReportsPage.tsx:386`, `packages/api/src/controllers/reports.controller.ts:79`, `packages/api/src/controllers/reports.controller.ts:93`, `packages/api/src/controllers/reports.controller.ts:99`, `apps/web/src/App.tsx:259`

### Report search <!-- F-REPORT-002 -->
**What it does:** A search box above the filters ("Search reports… e.g. XIRR, LTCG, holdings statement") that finds any tab, statement or Tax & MIS report by words in its title or description and jumps to it.

**Why it exists:** The page holds 12 tabs, 4 statements and 42 catalog reports; a short blurb per tab makes them "findable by keyword in the search bar below, not just by their tab label" (code comment).

**Where to find it:** **Tools → Reports**, top of the page.

**Who can use it:** Everyone who can open Reports (R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER).

**Steps**
1. Type a word, for example "dividend". Up to 8 matches appear, each with the tab it lives on.
2. Use the arrow keys and **Enter**, or click a match. The page switches to that tab; a statement or catalog card is scrolled into view and outlined for about 1.8 seconds.
3. Press **Escape** to close the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Search field | Text | Filters the index as you type | Never |
| Clear search (×) | Button | Empties the field | Hidden while the field is empty |
| Match row | Button | Opens the tab and highlights the card | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Search | Text | No | Case-insensitive substring of title or description; max 8 results | Empty | "No reports match "<text>"" |

**Settings and toggles here:** None.

**Results:** Only navigation; nothing is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No reports match "…"" | No title or description contains the text | Try a shorter word (for example "gain") |

**Limitations:** The **Tax & MIS downloads**, **Statements** and **Inbox imports** tabs themselves are not in the index (their cards are). A catalog report found by search is still locked if your plan does not include it.

**How it works:** A static index built from the tab hints, the 4 statement cards and the 42 Tax & MIS report definitions. Matching is in the browser. The dropdown closes 150 ms after the field loses focus so a click can register.

**Related features:** F-REPORT-011, F-REPORT-012, F-REPORT-013, F-REPORT-014.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:60`, `apps/web/src/pages/reports/ReportsPage.tsx:107`, `apps/web/src/pages/reports/ReportsPage.tsx:437`, `apps/web/src/pages/reports/ReportsPage.tsx:494`, `apps/web/src/pages/reports/ReportsPage.tsx:512`

### Data checks banner and Fix now <!-- F-REPORT-003 -->
**What it does:** Above every tab except **Inbox imports**, a line says whether the reports can be trusted: "All data checks passed." with "Data as of: transactions up to … · prices up to …", or a warning/error panel listing what is missing, out of date or inconsistent, with links to fix each item and a **Fix now** button when stored holdings are out of step with transactions.

**Why it exists:** "Reports are computed live from stored data, so they are exactly as good as that data. This sits above every tab and says, in plain words, what is missing, out of date or inconsistent — instead of letting a report print a confident total over a gap" (code comment).

**Where to find it:** **Tools → Reports**, under the filter card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — ungated ("knowing whether your own figures are complete is not a paid feature"). R-MANAGER: checks the managed person's data.

**Steps**
1. Open Reports. "Checking your data…" shows while the checks run.
2. If the panel is amber or red, click **See N issues**. Each issue lists up to 20 examples, then "…and N more".
3. For a sale with no purchase behind it, click **Add purchase** (opens the transaction form pre-filled) or **Review N matching purchase(s) from email** (opens the email review page).
4. If **Fix now** is shown, click it. A toast says "Rebuilt N holding(s) from your transactions" or "Everything already matched your transactions", and every report reloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **See N issue(s)** / **Hide details** | Toggle link | Opens/closes the issue list | Hidden when all checks pass |
| **Fix now** | Button | Rebuilds stored holdings and capital gains for the selected portfolio(s) | Shown only when an "out of sync" issue exists; disabled while running |
| **Add purchase** | Link | Opens `/transactions` with the missing purchase pre-filled (asset, quantity, "on or before" date) | Per item, when no matching email purchase is waiting |
| **Review N matching purchase(s) from email** | Link | Opens `/ingestion` | Per item, when matching email events are waiting |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (follows S-REPORT-001 **Portfolio**).

**Results:** **Fix now** rewrites the stored holdings and capital-gain rows of the portfolio(s) in scope from the transactions; transactions themselves are never changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Data checks could not be run, so these reports have not been verified." | The check request failed | Reload the page; the reports still show |
| "Some figures in these reports are incomplete or wrong." | At least one error-level issue | Open the details and fix the items |
| "These reports may not include your latest data." | Only warning-level issues | Optional: finish imports, review email events |
| "Could not rebuild holdings" (toast) | **Fix now** failed | Try again; the nightly job (F-REPORT-017) also repairs |

**Limitations:** The app never fills in a missing purchase by itself ("a guessed price would put a wrong figure in the tax reports"). Account-wide issues are marked "— across all your portfolios" even when one portfolio is selected.

**How it works:** `GET /api/reports/data-quality?portfolioId=…` (cached in the browser for 60 seconds) runs these checks, in this order: **OVERSOLD** (error) — sales of more units than were bought, booked at zero cost so gains are overstated; **GAINS_NEED_REVIEW** (warning) — gain rows computed with a missing input (for example no CII year); **MISSING_PRICE** (error) — market-priced holdings with no price, valued at cost; **STALE_PRICE** (warning) — price older than 5 days (2 days for crypto); deposits, PF, NPS, insurance, property, bonds and other non-market classes are never stale; **SUSPICIOUS_PRICE** (warning) — latest price moved more than 40% (stocks) or 20% (fund NAVs) from the previous one with no split/bonus/merger within 5 days; **TRADE_PRICE_OFF_MARKET** (warning) — a buy or sell more than 25% away from that day's close/NAV (last 365 days); **HOLDINGS_OUT_OF_SYNC** (error) — stored holding differs from a replay of transactions (tolerance 0.000001 units, ₹0.0001 cost); **STATEMENT_MISMATCH** (error, account) — units on your latest statement differ from transactions; **IMPORTS_NOT_FINISHED**, **EVENTS_AWAITING_REVIEW**, **UNRESOLVED_FAILURES** (warnings, account). **Fix now** calls `POST /api/reports/data-quality/repair`, which re-runs the integrity check with repair for each portfolio in scope and returns the counts. Every downloaded file from Reports also carries "Data as of" and "Data checks" lines from the same checks, or "Could not be run for this file".

**Related features:** F-REPORT-017 (nightly repair), D-REPORT-001 (transaction form), D-REPORT-002 (email review).

**Sources:** `apps/web/src/components/reports/DataQualityBanner.tsx:27`, `apps/web/src/components/reports/DataQualityBanner.tsx:34`, `apps/web/src/components/reports/DataQualityBanner.tsx:55`, `apps/web/src/components/reports/DataQualityBanner.tsx:79`, `apps/web/src/components/reports/DataQualityBanner.tsx:96`, `apps/web/src/components/reports/DataQualityBanner.tsx:143`, `apps/web/src/components/reports/DataQualityBanner.tsx:159`, `packages/api/src/routes/reports.routes.ts:100`, `packages/api/src/controllers/reports.controller.ts:340`, `packages/api/src/controllers/reports.controller.ts:362`, `packages/api/src/services/integrity/reportDataQuality.service.ts:196`, `packages/api/src/services/integrity/reportDataQuality.service.ts:291`, `packages/api/src/services/integrity/reportDataQuality.service.ts:443`, `packages/api/src/services/holdings/priceStaleness.ts:28`, `packages/api/src/services/integrity/storedDataIntegrity.service.ts:38`

### Summary tab <!-- F-REPORT-004 -->
**What it does:** Shows three cards — **Portfolio** (name, currency, number of transactions and holdings), **Unrealised** (Invested, Value, P&L) and **XIRR** (Overall, 1Y, 3Y, 5Y) — and a table **Capital Gains by Financial Year** with columns FY, Intraday, STCG, LTCG, Taxable, newest year first.

**Why it exists:** A one-screen overview of a book before drilling into individual reports. Inferred from behavior.

**Where to find it:** **Tools → Reports → Summary** (default tab).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER (managed person's data).

**Steps**
1. Open Reports. **Summary** shows for **All portfolios** (card title "All portfolios").
2. Choose a portfolio to see that book only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None besides the page filters | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-REPORT-001 **Portfolio**.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realised gains yet." | No sale has been matched to a purchase | None needed |
| XIRR shows "—" | Less than 90 days of cash-flow history in that window | Wait for more history |

**Limitations:** XIRR windows with less than 90 days of history show "—" rather than a number.

**How it works:** `GET /api/reports/summary`. Unrealised figures come from stored holdings; capital gains are FIFO-matched per FY; XIRR overall and rolling 1/3/5-year values are computed from your dated cash flows and are null when the span is under 90 days. Money is formatted with Indian grouping and banker's rounding to 2 decimals.

**Related features:** F-REPORT-005, F-REPORT-006, F-REPORT-008.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:556`, `apps/web/src/pages/reports/ReportsPage.tsx:604`, `apps/web/src/pages/reports/ReportsPage.tsx:634`, `packages/api/src/services/reports/reports.service.ts:297`, `packages/api/src/services/reports/reports.service.ts:470`, `packages/api/src/services/analytics/xirr.reliability.ts:7`

### Unrealised P&L tab <!-- F-REPORT-005 -->
**What it does:** Lists every open holding with Asset, Class, Qty, Avg, CMP (current market price), Invested, Value, P&L and %, under a heading "N holdings · Invested ₹… · Value ₹… · P&L ₹…".

**Why it exists:** Shows what you would gain or lose if you sold everything today. Inferred from behavior.

**Where to find it:** **Tools → Reports → Unrealised P&L**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Unrealised P&L**. The table loads for the selected portfolio(s).
2. Optional: click **Excel** or **PDF** to download it (F-REPORT-010).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Excel**, **PDF** | Buttons | Download this table | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-REPORT-001 **Portfolio**; S-REPORT-002 **Report for** (download only).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A holding shows its cost as its value | No market price (see the data checks banner, MISSING_PRICE) | Wait for the price job or check the asset's identifier |

**Limitations:** Uses the latest stored price; no intraday pricing.

**How it works:** `GET /api/reports/unrealised` reads stored holdings and sums cost, value and P&L. Download uses the same endpoint with `format=xlsx|pdf`, footer "Total Cost / Total Value / Unrealised P&L".

**Related features:** F-REPORT-003, F-REPORT-010.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:647`, `packages/api/src/controllers/reports.controller.ts:262`

### Capital gains tabs: Intraday, STCG, LTCG, Schedule 112A <!-- F-REPORT-006 -->
**What it does:** Four tabs listing realised gains for the chosen FY, one row per FIFO match of a sale to a purchase: Asset, Buy Date, Sell Date, Qty, Buy ₹, Sell ₹, Cost, Proceeds, Gain/Loss, Taxable. The heading shows "<kind> · N rows · Total ₹…", plus "Exemption ₹…" and "Taxable ₹…" where they apply. **Intraday** = bought and sold the same day; **STCG** = short-term; **LTCG** = long-term; **Schedule 112A** = long-term gains on listed equity and equity-oriented funds, with the year's exemption.

**Why it exists:** Gives the per-sale detail a tax return needs, split the way the return asks for it. Inferred from behavior.

**Where to find it:** **Tools → Reports → Intraday / STCG / LTCG / Schedule 112A**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (on-screen and download are ungated); R-MANAGER.

**Steps**
1. Open the tab, choose **Financial Year**.
2. Read the rows; click **Excel** or **PDF** to download.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial Year** | Select | Year of the sale | — |
| **Excel**, **PDF** | Buttons | Download | — |

**Fields and rules:** As F-REPORT-001.

**Settings and toggles here:** S-REPORT-001, S-REPORT-002 (download), S-REPORT-003.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No records for selected FY." | No sale of that kind in the FY | Pick another year |
| Gains look too high | A sale with no purchase is booked at zero cost (data checks: OVERSOLD) | Add the missing purchase |

**Limitations:** Long-term vs short-term follows the app's capital-gains rules table (equity long-term after 12 months; other classes 24 or 36 months depending on the transfer date). The Schedule 112A "Taxable" figure is after the FY exemption (₹1,00,000 from FY 2018-19, ₹1,25,000 from FY 2024-25) and includes grandfathered cost for equity bought on or before 31-Jan-2018.

**How it works:** `GET /api/reports/intraday|stcg|ltcg|schedule-112a?portfolioId&fy`. Rows come from the FIFO capital-gains engine; the Schedule 112A list keeps rows that are LONG_TERM and equity-oriented, and totals apply each FY's own exemption.

**Related features:** F-REPORT-010, F-TAX-004, F-TAX-006.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:738`, `apps/web/src/pages/reports/ReportsPage.tsx:801`, `packages/api/src/controllers/reports.controller.ts:120`, `packages/api/src/services/reports/reports.service.ts:42`, `packages/api/src/services/reports/reports.service.ts:85`, `packages/shared/src/finance/capitalGainsTaxRules.ts:91`

### Income tab <!-- F-REPORT-007 -->
**What it does:** Lists dividends, interest and maturity credits in the FY (Date, Type, Asset, Amount, Narration), headed "Dividends ₹… · Interest ₹… · Total income ₹… · Maturity proceeds ₹… (principal, not income)".

**Why it exists:** Collects "income from other sources" for the return and keeps returned principal out of the income total. Inferred from the heading text.

**Where to find it:** **Tools → Reports → Income**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Income**, choose **Financial Year**.
2. Optional: **Excel** / **PDF**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Excel**, **PDF** | Buttons | Download | — |

**Fields and rules:** As F-REPORT-001.

**Settings and toggles here:** S-REPORT-001, S-REPORT-002 (download), S-REPORT-003.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No income this FY." | No dividend/interest/maturity rows dated in that FY | Pick another year |

**Limitations:** Maturity proceeds are shown but not counted in **Total income**.

**How it works:** `GET /api/reports/income`; download footer: Dividends, Interest, Total income, "Maturity proceeds (not income)".

**Related features:** F-TAX-008.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:813`, `apps/web/src/pages/reports/ReportsPage.tsx:827`, `packages/api/src/controllers/reports.controller.ts:196`

### XIRR tab <!-- F-REPORT-008 -->
**What it does:** Table "Annualized Returns (XIRR)" with rows Overall, 1 Year, 3 Year, 5 Year and columns XIRR, Invested, Terminal Value, Cashflows.

**Why it exists:** Shows a money-weighted annual return that accounts for when each rupee went in or out. Inferred from behavior.

**Where to find it:** **Tools → Reports → XIRR**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **XIRR**. Hover a "—" to see "Less history than needed for a meaningful annual rate".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-REPORT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| XIRR "—" | Less than 90 days of history in the window | Wait |

**Limitations:** No download for this tab.

**How it works:** `GET /api/reports/xirr`; for **All portfolios** the user-level overall and rolling 1/3/5-year XIRR are computed, otherwise the portfolio's. A window is "reliable" only with at least 90 days of cash flows.

**Related features:** F-REPORT-004, F-ANLYT-002.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:867`, `apps/web/src/pages/reports/ReportsPage.tsx:905`, `packages/api/src/controllers/reports.controller.ts:281`, `packages/api/src/services/analytics/xirr.reliability.ts:7`

### Historical tab <!-- F-REPORT-009 -->
**What it does:** "Monthly valuation history · N points": one row per month-end since your first transaction, with Cost, Value and number of Holdings.

**Why it exists:** Shows how the book's value and cost moved over time. Inferred from behavior.

**Where to find it:** **Tools → Reports → Historical**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Historical**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-REPORT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not enough transaction history." | No transactions | Add transactions |

**Limitations:** Monthly only on this page (the API also supports quarterly). No download.

**How it works:** `GET /api/reports/historical-valuation?granularity=MONTHLY` replays transactions to each month-end from the month of the first trade to today and values positions at the prices available for those dates.

**Related features:** F-ANLYT-003.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:921`, `apps/web/src/pages/reports/ReportsPage.tsx:958`, `packages/api/src/services/reports/reports.service.ts:195`

### Excel / PDF download of the open tab <!-- F-REPORT-010 -->
**What it does:** On **Unrealised P&L**, **Intraday**, **STCG**, **LTCG**, **Schedule 112A** and **Income**, the **Excel** and **PDF** buttons download the same report as a file named `<tab>-<FY><member suffix>.xlsx|pdf`.

**Why it exists:** To hand the figures to a CA or keep them on file. Inferred from behavior.

**Where to find it:** **Tools → Reports**, right side of the filter card, on those six tabs.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (ungated); R-FAMOWNER and uncapped members can download for another member or the whole family; R-MANAGER.

**Steps**
1. Open one of the six tabs and set the filters.
2. Optional: choose **Report for**.
3. Click **Excel** or **PDF**. The browser saves the file.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Excel** | Button | `.xlsx` | Hidden on other tabs |
| **PDF** | Button | `.pdf` | Hidden on other tabs |

**Fields and rules:** Not applicable — uses the page filters.

**Settings and toggles here:** S-REPORT-001, S-REPORT-002, S-REPORT-003; the file's colours follow the app's light/dark theme (S-REPORT-011).

**Results:** A file is saved on your device. Nothing changes in your data.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A browser alert showing the raw server error text | The server refused (for example "That member is not part of a family you can see.", or a capped family view: "Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. …") | Choose **Me** in **Report for** |

**Limitations:** Errors appear as a plain browser alert containing the raw server response. A file for another member covers all of that member's portfolios, whatever is chosen in **Portfolio**. The file name contains the FY even for **Unrealised P&L**, which is not FY-based.

**How it works:** The browser fetches `GET /api/reports/<tab>?portfolioId&fy&format&theme` with your session token (plus `subject` and `familyId` when **Report for** is not **Me**) and saves the response. The server resolves the subject: Me (default); a member (must be readable in the family you are viewing; capped members are refused); or **Whole family** (one section per member). Each file is stamped with data-check lines.

**Related features:** F-REPORT-001, F-REPORT-003.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:257`, `apps/web/src/pages/reports/ReportsPage.tsx:268`, `apps/web/src/pages/reports/ReportsPage.tsx:286`, `apps/web/src/components/reports/useReportSubject.ts:102`, `packages/api/src/services/reports/reportSubjects.ts:94`, `packages/api/src/services/reports/reportSubjects.ts:162`, `packages/api/src/services/reports/reportSubjects.ts:199`

### Statements tab <!-- F-REPORT-011 -->
**What it does:** Four download cards, each with **PDF** and **Excel**: **Holdings Statement** (per-asset positions by class with avg cost, market value, unrealised P&L and allocation %), **Capital Gains Statement** (FIFO-matched Intraday, STCG and LTCG sections with FY totals), **Income Statement** (dividends, interest and maturity credits by category with FY totals) and **Transaction Ledger** (chronological book-style ledger with running balance). The two FY-based cards show "FY <year>".

**Why it exists:** Sectioned, FY-grouped statements in an industry-standard layout for filing and record keeping (code comment). The household versions of holdings live here.

**Where to find it:** **Tools → Reports → Statements**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (ungated); R-MANAGER.

**Steps**
1. Choose **Portfolio** (and **Report for** if offered). Switch to an FY tab first if you need a different year — the Statements tab has no FY selector and uses the year last chosen (current FY by default).
2. Open **Statements** and click **PDF** or **Excel** on a card. A spinner shows on that card until the file is saved as `everypaisa-<card>-<FY>.pdf|xlsx`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF**, **Excel** (per card) | Buttons | Download that statement | Disabled on that card while it downloads |

**Fields and rules:** Not applicable — uses the page filters.

**Settings and toggles here:** S-REPORT-001, S-REPORT-002, S-REPORT-003.

**Results:** A file is saved on your device.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not signed in" | Session token missing | Sign in again |
| Alert with "Forbidden" | One portfolio is selected while **Report for** names another member | Set **Portfolio** to **All portfolios** |

**Limitations:** The FY selector is hidden on this tab. The ledger has no date range here (whole history). The file name carries the FY even for Holdings and Ledger.

**How it works:** `GET /api/reports/statement/holdings|capital-gains|income|ledger?portfolioIds&fy&format&theme` (capital gains with `kind=all`). `portfolioIds=all` means every portfolio of the person reported on; a specific id must belong to that person.

**Related features:** F-REPORT-010.

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:75`, `apps/web/src/pages/reports/ReportsPage.tsx:984`, `apps/web/src/pages/reports/ReportsPage.tsx:1002`, `apps/web/src/pages/reports/ReportsPage.tsx:1024`, `apps/web/src/pages/reports/ReportsPage.tsx:1078`, `packages/api/src/routes/reports.routes.ts:107`, `packages/api/src/controllers/reports.controller.ts:898`, `packages/api/src/controllers/reports.controller.ts:912`

### Tax & MIS downloads — inputs and free reports <!-- F-REPORT-012 -->
**What it does:** The **Tax & MIS downloads** tab is a catalog of 42 print-style reports (PDF + Excel each; **Export to Tally** is ZIP). Its own input card has **Report for**, **Financial year**, **As-of date**, **From** and **To**; each card shows "Uses: …" with the inputs it takes. Two reports are free on every plan: **Portfolio Holdings Summary** (cross-asset valuation as of today with per-class subtotals) and **Cash Flow Statement** (period inflows vs outflows by category, T-account layout).

**Why it exists:** Mirrors the reports Indian investors and CAs know from desktop portfolio software ("mProfit-style layout"); these are "shaped to look right in print form … and would be visually noisy in-app" (code comment). Holdings summary and cash flow are "the Free-tier 'basic reports' carve-out".

**Where to find it:** **Tools → Reports → Tax & MIS downloads**.

**Who can use it:** Free reports: R-FREE and up. R-MANAGER (managed person's data).

**Steps**
1. Open **Tax & MIS downloads**. Inputs default to: Financial year = the FY chosen on the page, As-of date = today, From = empty, To = today.
2. Adjust the inputs a report uses.
3. Click **PDF** or **Excel** on the card. The button spins until the file `<report>-<FY><member suffix>.pdf|xlsx` is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Whose data (S-REPORT-002) | As F-REPORT-001 |
| **Financial year** | Select | S-REPORT-004 | — |
| **As-of date** | Date | S-REPORT-005 | — |
| **From**, **To** | Date | S-REPORT-006, S-REPORT-007 | — |
| **PDF**, **Excel** (per card) | Buttons | Download | Disabled for that button while it downloads |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Financial year | Select | For FY reports | Current FY and 7 before | Page FY | "Invalid financial year …" |
| As-of date | Date | No | ISO date | Today | "Invalid `asOf` date" |
| From / To | Date | No | ISO dates; From ≤ To | From empty, To today | "Invalid `from` date", "`from` date is after `to` date" |

**Settings and toggles here:** S-REPORT-002, S-REPORT-004, S-REPORT-005, S-REPORT-006, S-REPORT-007, S-REPORT-011. Help text: "Each report uses whichever subset of these inputs applies to it (shown in the card). Leave any field blank to use the report's default range." When **Report for** is not **Me**: "These downloads cover every member of the family, one section each." or the member's name.

**Results:** A file is saved on your device.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert with raw error text | Invalid dates or a refused subject | Fix the dates or choose **Me** |

**Limitations:** The catalog ignores the page's **Portfolio** selector — every catalog report covers all your portfolios. The FY here is separate from the page's FY after the tab opens.

**How it works:** `GET /api/reports/download/<endpoint>?format&theme&fy|asOf|from|to&subject&familyId`. Every catalog download goes through one subject resolver (one section per member for **Whole family**) and is stamped with "Data as of" and data-check lines. Holdings summary and cash flow have no plan gate on the server.

**Related features:** F-REPORT-013, F-REPORT-014, F-REPORT-002.

**Sources:** `apps/web/src/pages/reports/TaxMisDownloads.tsx:36`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:62`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:172`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:199`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:530`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:550`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:630`, `packages/api/src/routes/reports.routes.ts:137`, `packages/api/src/routes/reports.routes.ts:140`, `packages/api/src/controllers/reports.controller.ts:1104`

### Tax & CA Report Catalog (Plus) <!-- F-REPORT-013 -->
**What it does:** 34 further catalog reports, available from the Plus plan: Grandfathering LTCG (Sec 112A); Demat Account-wise Holdings; M2M Report — Equity + F&O; Short Term / Long Term / Speculation; Income Tax — Schedule 112A; Mutual Fund Capital Gain (Short + Long); Daily Transactions — Broker Bill Register; Income Statement; XIRR / TWR Performance; Tax Summary (Form 16 helper); Combined Realised / Unrealised G/L (Equity); Family-wise Holdings; Scriptwise — Qtywise; Contract Note Charges (Brokerage Statement); M2M Report — Mutual Funds; Financial Ledger; Closing Balance Report; Top Holdings Report; Sector Wise Allocation; Contract Notes Summary; Brokerwise Capital G/L; Tax P&L Summary; STT 10 DB Report; Capital Gains — FIFO; Advance Tax Summary; Opening Stock Report; Holding Period Return; Script Account Ledger; Fund Flow Statement; Broker Bill Register — Family/Member-wise; Portfolio Snapshot; Day Book; Dividend Report (Date-wise); Bank Reconciliation. Each card's description (shown on the page) states its content.

**Why it exists:** The paid "Tax & CA Report Catalog" for investors and their CAs. Inferred from the lock card wording.

**Where to find it:** **Tools → Reports → Tax & MIS downloads**, below the two free reports.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees one card instead: "N more reports waiting for you — 34 in the Tax & CA Report Catalog on Plus — plus 6 Accounting Reports (Trial Balance, P&L, Balance Sheet, Tally exports) on Pro/Advisor." with **See plans**.

**Steps**
1. As F-REPORT-012: set inputs, click **PDF** or **Excel** on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF**, **Excel** | Buttons | Download | Cards hidden for R-FREE |
| **See plans** | Link | Opens `/pricing` | Shown only to R-FREE |

**Fields and rules:** As F-REPORT-012.

**Settings and toggles here:** As F-REPORT-012.

**Results:** A file is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (inside the alert) | Plan lapsed or not Plus | Upgrade on **Pricing** (D-REPORT-004) |

**Limitations:** The Schedule 112A and other tax reports here accept **Whole family**, producing one section per member; the Tax Planning page refuses a combined filing for the same reason (F-TAX-001). Each card lists the inputs it uses; **Dividend Report (Date-wise)** is the only one that takes Financial year, From and To together.

**How it works:** Server gate `requireFeature('TAX_REPORT_CATALOG')` (minimum PLUS) on each `/api/reports/download/<endpoint>`. The browser hides the cards when the signed-in plan is below PLUS. Reports are built with the shared print layout engine and stamped with data-check lines.

**Related features:** F-REPORT-012, F-REPORT-014.

**Sources:** `apps/web/src/pages/reports/TaxMisDownloads.tsx:38`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:474`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:490`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:529`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:649`, `packages/api/src/routes/reports.routes.ts:85`, `packages/api/src/routes/reports.routes.ts:125`, `packages/api/src/middleware/requirePlan.ts:18`

### Accounting reports and Export to Tally (Pro/Advisor) <!-- F-REPORT-014 -->
**What it does:** Six catalog entries for the double-entry books: **Trial Balance**, **Account Ledger — All Accounts**, **Profit & Loss Statement**, **Balance Sheet**, **Chart of Accounts (Account Master)** and **Export to Tally** — "Your complete books as one ZIP for TallyPrime: groups and ledgers (one per bank account, loan, card and holding), vouchers split by financial year, holdings at each year end, and a step-by-step import guide. Checked against Tally's import rules before it downloads."

**Why it exists:** Accounting-specific exports for practices and CAs (Pro/Advisor plan). From code comments.

**Where to find it:** **Tools → Reports → Tax & MIS downloads**, last group.

**Who can use it:** R-PRO. R-PLUS and R-FAMILY see a compact lock "Accounting Reports is locked — Upgrade to Pro/Advisor to unlock Accounting Reports." with **Upgrade**. R-FREE sees the combined card (F-REPORT-013).

**Steps**
1. Set **As-of date** (Trial Balance, Balance Sheet) or **From**/**To** (Ledger, P&L).
2. Click **PDF**/**Excel**, or **ZIP** on **Export to Tally**. The ZIP is saved as `tally-export<member suffix>.zip`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF**, **Excel** | Buttons | Download | Locked below Pro/Advisor |
| **ZIP** | Button | Tally export | Locked below Pro/Advisor |
| **Upgrade** | Link | `/pricing` | Shown when locked |

**Fields and rules:** As F-REPORT-012.

**Settings and toggles here:** As F-REPORT-012.

**Results:** A file is saved. Before building, the server brings your accounting books up to date from your transactions.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PRO_ADVISOR plan or higher" | Plan below Pro/Advisor | Upgrade |
| "The Tally export covers one person — a combined version would not be a valid filing for anyone. Pick a single member and download it once per person." | **Report for** is **Whole family** | Choose one member |
| Alert listing problems | The books break a Tally import rule; the export is refused rather than producing a file Tally would partly reject | Fix the listed records in Accounting (D-REPORT-005) |

**Limitations:** Tally export is one person per file.

**How it works:** Server gate `requireFeature('ACCOUNTING_MODULE')`. Trial balance, ledger, P&L and balance sheet first project accounting entries for the subject. Tally export builds a ZIP and returns header `X-Tally-Notes` with the number of notes.

**Related features:** F-REPORT-012, D-REPORT-005.

**Sources:** `apps/web/src/pages/reports/TaxMisDownloads.tsx:28`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:433`, `apps/web/src/pages/reports/TaxMisDownloads.tsx:655`, `packages/api/src/routes/reports.routes.ts:86`, `packages/api/src/routes/reports.routes.ts:176`, `packages/api/src/controllers/reports.controller.ts:1152`, `packages/api/src/controllers/reports.controller.ts:1430`, `packages/api/src/services/reports/reportSubjects.ts:432`

### Inbox imports tab <!-- F-REPORT-015 -->
**What it does:** The review queue for attachments found by a Gmail scan. While a scan runs, a blue line shows "Scanning your inbox — X / Y messages • N documents pending review". Status chips (**Pending review**, **Approved**, **Imported**, **Parse failed**, **All**), sender and document-type filters, and a table (File, From, Date, Type, Confidence, Status, Actions) with **Preview**, **Approve**, **+ Always**, **Reject** per row and bulk **Approve selected** / **Reject selected** / **Clear**.

**Why it exists:** Documents found in email are only imported after you approve them. Inferred from behavior.

**Where to find it:** **Tools → Reports → Inbox imports**; also opened from the dashboard Gmail scan card and after starting a Gmail scan (`/reports?tab=inbox-imports`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a connected Gmail. R-MANAGER cannot use it: `/api/gmail` is an account route ("Switch back to your own account to do this.").

**Steps**
1. Open the tab. **Pending review** is selected.
2. Optional: filter by sender or document type.
3. Click **Preview** (or the file name) to open the document.
4. Click **Approve** to import it, **+ Always** to approve and auto-approve future documents from that sender, or **Reject**.
5. To act on many: tick rows (only pending ones can be ticked), then **Approve selected** or **Reject selected**. Toast "Approved selected" / "Rejected selected".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Status chips | Buttons | S-REPORT-008 | — |
| **All senders** select | Select | S-REPORT-009 | — |
| **All doc types** select | Select | S-REPORT-010 | — |
| Row checkbox | Checkbox | Select for bulk action | Disabled unless the row is pending review |
| **Preview** | Button | Opens the preview sheet | — |
| **Approve** / **+ Always** / **Reject** | Buttons | Act on one document | Shown only for pending rows; disabled while an action runs |
| **Approve selected** / **Reject selected** / **Clear** | Buttons | Bulk actions | Shown only when rows are selected |

**Fields and rules:** Not applicable — filters only.

**Settings and toggles here:** S-REPORT-008 **Status filter**, S-REPORT-009 **Sender filter**, S-REPORT-010 **Doc type filter** — not saved.

**Results:** Approved documents are queued for import into your transactions; rejected ones are marked rejected. **+ Always** also creates an auto-approve rule for that sender.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve failed" / "Reject failed" / "Bulk approve failed" / "Bulk reject failed" (or the server's message) | The action was refused or failed | Retry; see the Gmail inbox page (D-REPORT-003) |
| "No documents in this filter." | Nothing matches | Switch to **All** |

**Limitations:** Shows at most 200 documents per filter. The statuses Rejected, Not financial and Already imported can only be seen under **All**. Single-row **Reject** never adds the sender to a blocklist.

**How it works:** Scan jobs are polled every 5 seconds; while one is PENDING/LISTING/DOWNLOADING/CLASSIFYING, or any listed document is CLASSIFYING/IMPORTING, the list refreshes every 3 seconds. Endpoints are the Gmail scan API owned by B07 (list scans, list docs with `limit=200`, senders, approve, reject, bulk approve with `createAutoApproveRule=false`, bulk reject).

**Related features:** D-REPORT-003.

**Sources:** `apps/web/src/pages/reports/InboxImportsTab.tsx:28`, `apps/web/src/pages/reports/InboxImportsTab.tsx:38`, `apps/web/src/pages/reports/InboxImportsTab.tsx:51`, `apps/web/src/pages/reports/InboxImportsTab.tsx:55`, `apps/web/src/pages/reports/InboxImportsTab.tsx:113`, `apps/web/src/pages/reports/InboxImportsTab.tsx:122`, `apps/web/src/pages/reports/InboxImportsTab.tsx:185`, `apps/web/src/pages/reports/InboxImportsTab.tsx:216`, `apps/web/src/components/upload/InboxImportRow.tsx:47`, `apps/web/src/components/upload/InboxImportRow.tsx:99`

### Download Report dialog (on other pages) <!-- F-REPORT-016 -->
**What it does:** A **Download** button used on the dashboard and on many asset and liability pages (stocks, mutual funds, F&O, crypto, deposits, post office, other assets, forex, loans, credit cards, insurance, rental, real estate, vehicles). It opens "Download Report" with **Report for** (when offered), **Portfolio** (holdings reports), **Scope** (dashboard: **All portfolios combined** / **Specific portfolio**), **Format** (**PDF** / **Excel (.xlsx)**), **Appearance** (**Dark** / **Light (print)**, the app's current theme marked "· current"), **Cancel** and **Download** ("Preparing…" while running).

**Why it exists:** Lets any section be exported without going to Reports. Inferred from behavior.

**Where to find it:** The **Download** button in the header of those pages (owned by their batches).

**Who can use it:** R-FREE and up (ungated); R-MANAGER.

**Steps**
1. Click **Download**. The dialog opens with PDF and your current theme selected.
2. Choose options; click **Download**. The file `everypaisa-<section>-report<member suffix>.pdf|xlsx` is saved and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Subject; **Whole family** is removed for holdings and dashboard exports | Hidden as in F-REPORT-001 |
| **Portfolio** | Select | **All portfolios** or one | Holdings reports only |
| **Scope** + portfolio pick | Select | Dashboard export scope ("— pick portfolio —") | Dashboard only |
| **Format** | Toggle | PDF or Excel | — |
| **Appearance** | Toggle | Dark or Light (print), this download only | — |
| **Download** | Button | Builds the file | Disabled while running, or when **Specific portfolio** has no portfolio |

**Fields and rules:** Not applicable — choices only.

**Settings and toggles here:** S-REPORT-011 **Report theme** (overridable per download here).

**Results:** A file is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert "Error: …" with the raw server response | Server refusal | See Limitations |

**Limitations:** For a holdings export with **Portfolio** = **All portfolios**, the dialog sends the id of every portfolio in your list; if you are viewing a family (the list then includes other members' portfolios) or chose another member in **Report for**, the server refuses with "Forbidden" (see DOCUMENTATION_GAPS.md).

**How it works:** Holdings → `GET /api/reports/holdings-export?portfolioIds&assetClasses&format&theme` (one person per file, ownership of each id checked); dashboard → `/api/reports/dashboard-export?scope&portfolioId`; vehicles, insurance, loans, credit cards, rental, real estate → `/api/reports/section-export?section=…` (subject-aware, one section per member for the family).

**Related features:** F-REPORT-011.

**Sources:** `apps/web/src/components/reports/DownloadReportButton.tsx:38`, `apps/web/src/components/reports/DownloadReportButton.tsx:98`, `apps/web/src/components/reports/DownloadReportButton.tsx:149`, `apps/web/src/components/reports/DownloadReportButton.tsx:181`, `apps/web/src/components/reports/DownloadReportButton.tsx:215`, `apps/web/src/hooks/useDownloadReport.ts:1`, `packages/api/src/controllers/reports.controller.ts:386`, `packages/api/src/controllers/reports.controller.ts:411`, `packages/api/src/controllers/reports.controller.ts:572`

### Nightly stored-data integrity check <!-- F-REPORT-017 -->
**What it does:** Every night at 02:15 IST the app first retries failed imports and emails, then, for every portfolio of every active user, recomputes holdings and capital gains from the transactions alone, compares them with what is stored, and rebuilds anything that drifted. If anything drifted or a portfolio could not be checked, the oldest active administrator gets one in-app alert "Data integrity: stored figures drifted".

**Why it exists:** "The stored rows are a cache of a pure function of the transactions, so when they disagree the cache is wrong by definition and rebuilding it loses nothing." The alert exists because "a drift means some write path skipped its recompute" (code comment).

**Where to find it:** No page. The effect is visible in the Reports data checks banner (F-REPORT-003) — "They are rebuilt automatically every night, or use Fix now" — and, for administrators, in Alerts.

**Who can use it:** Runs automatically for every user's data. R-ADMIN receives the alert.

**Steps:** Not applicable — automatic.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None for users. Operator switch `ENABLE_DATA_INTEGRITY_CRON` (`false` disables the schedule).

**Results:** Stored holdings and capital-gain rows match your transactions by the morning; a run record is kept (counts, up to 200 per-portfolio detail entries).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Banner still says "out of sync" in the morning | The check failed for that portfolio | Click **Fix now** (F-REPORT-003) |

**Limitations:** Only portfolios of active users are checked. If no active ADMIN exists, the drift is only logged.

**How it works:** Cron `15 2 * * *` in Asia/Kolkata. Ingestion recovery runs first. Portfolios are listed in system context, each check runs in that user's context (row-level security), with repair on. A second run is skipped while one is in progress. Alert metadata source `data.integrity`.

**Related features:** F-REPORT-003.

**Sources:** `packages/api/src/jobs/dataIntegrityJob.ts:49`, `packages/api/src/jobs/dataIntegrityJob.ts:60`, `packages/api/src/jobs/dataIntegrityJob.ts:66`, `packages/api/src/jobs/dataIntegrityJob.ts:82`, `packages/api/src/jobs/dataIntegrityJob.ts:140`, `packages/api/src/jobs/dataIntegrityJob.ts:158`, `packages/api/src/jobs/dataIntegrityJob.ts:170`, `packages/api/src/jobs/dataIntegrityJob.ts:175`, `packages/api/src/index.ts:240`

**What this area doesn't do**
- You can't schedule reports or have them emailed; every report is downloaded on demand.
- You can't pick a portfolio for the Tax & MIS catalog — it always covers all your portfolios.
- You can't see another member's figures on screen in Reports; only downloads follow **Report for**.
- There is no XIRR or Historical download on this page (use **XIRR / TWR Performance** in the catalog).
- Reports never fill in missing purchases or prices for you.

## Tax Planning

The **Tax Planning** page (sidebar **Planning → Tax Planning**, route `/tax`; page title "Tax Reports — ITR-aligned capital gains, business income and tax-harvesting across all portfolios") estimates the tax on your investment gains for a financial year, lists the gains the way the income-tax return schedules ask for them, shows which holdings could be sold at a loss to cut tax, and lets you enter the 31-Jan-2018 prices used for grandfathering. It always covers all your portfolios.

### Tax page controls <!-- F-TAX-001 -->
**What it does:** A card with **Financial Year**, **Download reports for** (when you can report on others) and a download button that depends on the tab, plus 10 tabs: **Summary**, **Schedule 112A**, **Schedule 112**, **STCG**, **LTCG**, **Intraday**, **F&O (Sec. 43(5))**, **Dividend & Interest**, **Tax Harvest**, **Grandfathering (112A FMV)**.

**Why it exists:** Tax figures are per financial year and per person (assessee). The year list contains only years with activity so the page does not "default to today's FY and show ₹0 across the board if the user's last transactions were in a prior FY" (code comment).

**Where to find it:** **Planning → Tax Planning** (route `/tax`); also from the dashboard tax strip.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (F&O tab needs R-PRO); R-MANAGER (managed person's tax).

**Steps**
1. Open the page. **Financial Year** is set to the latest year with any capital gain or transaction (or the current FY if none).
2. Pick another year if needed; the open tab reloads.
3. Click a tab.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Financial Year** | Select | S-TAX-001 | — |
| **Download reports for** | Select | S-TAX-002; downloads only; no "Whole family" option | Hidden as **Report for** in F-REPORT-001 |
| **CA Tax Report (PDF)** | Button | F-TAX-003 | Summary tab only |
| **ITR-portal CSV** | Button | F-TAX-004 | Schedule 112A tab only |
| **Schedule 112A CSV (with FMV)** | Button | F-TAX-010 | Grandfathering tab only |
| Tabs (10) | Tabs | Switch view | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Financial Year | Select | Yes | Years with activity, newest first | Latest year with activity | "fy query param required (e.g. 2024-25)" (server, if missing) |

**Settings and toggles here:** S-TAX-001 **Financial Year**; S-TAX-002 **Download reports for** — Me or one family member; applies to the PDF/CSV downloads, not to the tables. Neither is saved.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A tab shows nothing | The request failed; the page shows no error | Reload; for the F&O tab see F-TAX-007 |
| "A tax report covers one person — a combined version would not be a valid filing for anyone. …" | A household subject was requested | Pick one member |

**Limitations:** The tab and year are not remembered. Tables are always your own figures (or the managed person's).

**How it works:** `GET /api/tax/available-fys` lists FYs (descending) from your capital-gain rows and transaction dates. Every `/api/tax` read resolves one subject (self by default; a combined household is refused) and runs as that person so row-level security returns their rows.

**Related features:** F-TAX-002 to F-TAX-010, D-TAX-002 (dashboard tax strip).

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:37`, `apps/web/src/pages/tax/TaxPage.tsx:146`, `apps/web/src/pages/tax/TaxPage.tsx:262`, `apps/web/src/pages/tax/TaxPage.tsx:286`, `apps/web/src/pages/tax/TaxPage.tsx:293`, `packages/api/src/controllers/tax.controller.ts:38`, `packages/api/src/controllers/tax.controller.ts:51`, `packages/api/src/services/tax/tax.service.ts:104`, `apps/web/src/App.tsx:260`

### Tax summary (estimated tax by section) <!-- F-TAX-002 -->
**What it does:** Three cards — **Total Realised Gain** (FY), **Estimated Tax Liability** ("Excludes surcharge & cess") and **Effective Rate** (Tax / Realised Gain) — and a **Capital Gains Breakdown** table with Section, Description, Gain, Taxable, Rate, Tax for: Sec. 111A (STCG on listed equity, STT paid); Sec. 112A (LTCG on listed equity, "exemption used ₹X of ₹Y"); Sec. 112 (LTCG on other assets, with / without indexation); Slab (STCG on non-equity — debt, bonds, gold, etc.); Sec. 43(5) intraday speculative income; Sec. 115BBH virtual digital assets (only when non-zero); Sec. 43(5) F&O non-speculative (with "· Sec. 44AB audit" when turnover exceeds ₹10 Cr). Below: losses to carry forward, and **Other Income (taxed at slab — outside this estimate)** with Dividends, Interest, Maturity Proceeds.

**Why it exists:** An estimate of the tax on investment gains, aligned to the ITR sections, to plan payments and share with a CA. Inferred from behavior and page title.

**Where to find it:** **Planning → Tax Planning → Summary**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the page; **Summary** is the first tab.
2. Read the breakdown; click **Download PDF** (or **CA Tax Report (PDF)**) for the CA report (F-TAX-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | F-TAX-003 | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001. The slab rate used comes from the tax slab in your most recent risk-profile assessment (D-TAX-001); without it 30% is used and the page says "Slab-rate lines use 30% because your income-tax slab is not on file. Add it in your risk profile for an exact figure."

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Effective Rate "—" | Total gain is zero or negative | — |
| Slab lines at 30% | No tax slab on file | Record your slab in the Advisor risk profile |

**Limitations:** Excludes surcharge, cess, deductions (80C/80D) and brought-forward losses. The footnote also says the estimate excludes "any FMV adjustment for pre-31-Jan-2018 equity (grandfathering)", but the Sec. 112A figures do use grandfathered cost (see DOCUMENTATION_GAPS.md). F&O non-speculative profit is computed and shown here on every plan, though the F&O tab itself is Pro/Advisor only.

**How it works:** `GET /api/tax/summary?fy`. Rows are bucketed by each sale's transfer date using the rules table: rule set from 1-Apr-2018 — STCG listed equity 15%, LTCG listed equity 10%, LTCG with indexation 20%, without 20%, listed bonds without indexation 10%, VDA 30%; from 23-Jul-2024 — 20%, 12.5%, 20% (indexed, property bought before 23-Jul-2024), 12.5%, 12.5%, 30%. Sec. 112A exemption ₹1,00,000 (from FY 2018-19), ₹1,25,000 (from FY 2024-25), applied once per FY to the higher-rate part first. Set-off within the year: short-term losses against any capital gain, long-term losses only against long-term gains, highest-rate gains first (Sec. 112 before 112A); intraday losses stay within speculation; VDA losses offset nothing. F&O: net P&L of closed trades in the FY, taxed at the slab rate if positive; audit flag when turnover > ₹10,00,00,000. "Rate" column shows tax ÷ taxable, or the statutory rate when nothing is taxable.

**Related features:** F-TAX-003, F-TAX-007, F-ANLYT-007.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:386`, `apps/web/src/pages/tax/TaxPage.tsx:480`, `apps/web/src/pages/tax/TaxPage.tsx:546`, `apps/web/src/pages/tax/TaxPage.tsx:572`, `apps/web/src/pages/tax/TaxPage.tsx:615`, `packages/api/src/services/tax/tax.service.ts:245`, `packages/api/src/services/tax/taxComputation.ts:85`, `packages/shared/src/finance/capitalGainsTaxRules.ts:45`, `packages/shared/src/finance/capitalGainsTaxRules.ts:91`, `packages/shared/src/finance/capitalGainsTaxRules.ts:117`, `packages/api/src/services/reports/schedule43.report.ts:68`

### CA Tax Report (PDF) <!-- F-TAX-003 -->
**What it does:** Downloads "CA-ready capital gains report" — "One PDF with tax summary, unrealised snapshot, harvesting opportunities, and full transaction detail — ready to share with your CA." Saved as `capital-gains-tax-report-<FY><member suffix>.pdf`; includes your name and PAN when on file.

**Why it exists:** To hand a CA everything for the year in one file (on-screen text).

**Where to find it:** **Planning → Tax Planning → Summary**: **Download PDF** in the card, or **CA Tax Report (PDF)** in the top card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (ungated); a family member you may report on via **Download reports for**; R-MANAGER.

**Steps**
1. Choose **Financial Year** (and **Download reports for** if needed).
2. Click **Download PDF**. The file is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** / **CA Tax Report (PDF)** | Buttons | Same download | Summary tab only |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-TAX-001, S-TAX-002, S-REPORT-011 (theme).

**Results:** A PDF is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Alert with raw error text | Refused subject or invalid FY | Choose **Me** or another year |

**Limitations:** Covers all portfolios (the page sends no portfolio filter).

**How it works:** `GET /api/tax/capital-gains-report?fy&theme[&subject&familyId]`; the subject's PAN is decrypted for the report header; built as that person.

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:244`, `apps/web/src/pages/tax/TaxPage.tsx:403`, `apps/web/src/pages/tax/TaxPage.tsx:411`, `packages/api/src/controllers/tax.controller.ts:126`, `packages/api/src/controllers/tax.controller.ts:139`

### Schedule 112A tab and ITR-portal CSV <!-- F-TAX-004 -->
**What it does:** Lists the FY's long-term sales of listed equity and equity-oriented funds ("Schedule 112A · LTCG on listed equity / equity MF") with Asset, ISIN, Buy, Sell, Qty, Cost, Proceeds, Gain/Loss, Taxable, Review; heading adds Exemption, Taxable, Rate and Est. Tax. When grandfathered lots exist, a line "FMV data: X of Y rows have FMV" with **Edit FMV values →**. **ITR-portal CSV** downloads the Schedule 112A file in the income-tax portal's column layout (ISIN, name, units, sale price, full value of consideration, cost without indexation, cost per unit, acquired before 01/02/2018, FMV per unit on 31/01/2018, …).

**Why it exists:** To fill ITR-2/ITR-3 Schedule 112A without retyping each sale. From the report descriptions.

**Where to find it:** **Planning → Tax Planning → Schedule 112A**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open **Schedule 112A**, choose the year.
2. If "FMV data" shows rows without FMV, click **Edit FMV values →** (F-TAX-010).
3. Click **ITR-portal CSV**. The file `schedule-112a-<FY><member suffix>.csv` is saved.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **ITR-portal CSV** | Button | Download CSV | This tab only |
| **Edit FMV values →** | Link | Opens the Grandfathering tab | Shown when grandfathered rows exist |
| **Review** badge | Tooltip | Shows why a row needs checking | Only on rows needing review |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-TAX-001, S-TAX-002, S-TAX-003 (FMV overrides feed the CSV).

**Results:** A CSV is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Amber notice "N row(s) qualify for indexation but the CII table has no entry for that financial year — …" | Missing cost inflation index year | Treat those rows as provisional |
| "No records for selected FY." | No such sales | — |

**Limitations:** The CSV button always downloads your own data even when **Download reports for** names another member (the file name then carries the member's name) — see DOCUMENTATION_GAPS.md.

**How it works:** Table: `GET /api/tax/schedule-112a?fy`. Rate shown = estimated tax ÷ taxable (or the statutory rate when nothing is taxable). The CSV button calls `GET /api/tax/grandfathering.csv?fy` (same builder as the grandfathering CSV, FMV column filled where known).

**Related features:** F-TAX-010, F-REPORT-006.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:212`, `apps/web/src/pages/tax/TaxPage.tsx:215`, `apps/web/src/pages/tax/TaxPage.tsx:304`, `apps/web/src/pages/tax/TaxPage.tsx:657`, `apps/web/src/pages/tax/TaxPage.tsx:665`, `apps/web/src/pages/tax/TaxPage.tsx:670`, `packages/api/src/services/tax/tax.service.ts:160`, `packages/api/src/services/tax/tax.service.ts:381`, `packages/api/src/controllers/fmv.controller.ts:117`

### Schedule 112 tab <!-- F-TAX-005 -->
**What it does:** "Schedule 112 · LTCG on other assets (with indexation)": long-term sales of non-equity assets with an **Indexed Cost** column.

**Why it exists:** ITR Schedule 112 detail for debt, gold, property and other assets. Inferred from the title.

**Where to find it:** **Planning → Tax Planning → Schedule 112**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review** badge | Tooltip | Reason a row needs checking | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Indexation notice (as F-TAX-004) | CII year missing | Treat as provisional |

**Limitations:** No download on this tab.

**How it works:** `GET /api/tax/schedule-112?fy`. Indexed cost = cost × CII(sale year) ÷ CII(purchase year) where indexation is available (transfers before 23-Jul-2024, or property bought before that date).

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:355`, `packages/api/src/services/tax/tax.service.ts:189`, `packages/api/src/services/tax/capitalGains.service.ts:23`, `packages/shared/src/finance/capitalGainsTaxRules.ts:105`

### STCG, LTCG and Intraday tabs <!-- F-TAX-006 -->
**What it does:** Three lists for the FY: "Short-Term Capital Gains", "Long-Term Capital Gains" (with Indexed Cost) and "Intraday (Sec. 43(5) Speculative)", across all portfolios, with the same columns as F-TAX-004.

**Why it exists:** Per-sale detail by tax bucket. Inferred from behavior.

**Where to find it:** **Planning → Tax Planning → STCG / LTCG / Intraday**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open a tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review** badge | Tooltip | Reason for review | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No records for selected FY." | No such sales | — |

**Limitations:** No download here; use Reports (F-REPORT-006, F-REPORT-010).

**How it works:** `GET /api/tax/stcg|ltcg|intraday?fy` from the FIFO capital-gains engine over all your portfolios.

**Related features:** F-REPORT-006.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:359`, `apps/web/src/pages/tax/TaxPage.tsx:748`, `packages/api/src/controllers/tax.controller.ts:74`

### F&O (Sec. 43(5)) tab <!-- F-TAX-007 -->
**What it does:** "F&O Schedule 43 / ITR-3 Schedule BP · FY …": Gross Profit, Gross Loss, Net P&L, Turnover (ICAI), Trades, an audit note, and a **Per-instrument breakdown** (Underlying, Type, Strike, Expiry, Side, P&L, Turnover, Trades).

**Why it exists:** F&O results are non-speculative business income reported in ITR-3; the turnover decides whether a tax audit applies. From the on-screen text.

**Where to find it:** **Planning → Tax Planning → F&O (Sec. 43(5))**.

**Who can use it:** R-PRO only (server gate). Other plans see the tab but it stays blank.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Tab is blank | Your plan is below Pro/Advisor; the server answers "This feature requires the PRO_ADVISOR plan or higher" and the page shows nothing | Upgrade on **Pricing** |
| "No F&O trades closed in this FY." | No closed trades | — |

**Limitations:** No lock card or message for lower plans (see DOCUMENTATION_GAPS.md). The audit check assumes the ₹10 Cr limit for ≥95% digital transactions.

**How it works:** `GET /api/tax/schedule-43?fy`, gated by `requireFeature('FNO_SCHEDULE_43')`. Turnover is summed per closed trade; audit note "Turnover exceeds ₹10 Cr — §44AB tax audit applicable. Consult a CA." or "Turnover within §44AB threshold (₹10 Cr for ≥95% digital transactions)."

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:761`, `apps/web/src/pages/tax/TaxPage.tsx:806`, `apps/web/src/pages/tax/TaxPage.tsx:848`, `packages/api/src/routes/tax.routes.ts:39`, `packages/api/src/services/reports/schedule43.report.ts:68`

### Dividend & Interest tab <!-- F-TAX-008 -->
**What it does:** "Dividends ₹… · Interest ₹… · Maturity ₹… · Total ₹…" and a table Date, Type, Portfolio, Asset, Amount, Narration across all portfolios.

**Why it exists:** Income from other sources for the return. Inferred from behavior.

**Where to find it:** **Planning → Tax Planning → Dividend & Interest**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the tab and choose the year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No income in this FY." | Nothing recorded | — |

**Limitations:** The "Total" in this heading is computed by the server; the Reports Income tab labels maturity proceeds as principal, not income.

**How it works:** `GET /api/tax/income?fy`.

**Related features:** F-REPORT-007.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:861`, `apps/web/src/pages/tax/TaxPage.tsx:898`, `packages/api/src/services/tax/tax.service.ts:210`

### Tax Harvest tab <!-- F-TAX-009 -->
**What it does:** Cards **Total Unrealised Loss**, **STCG Loss Available** (with "Realised STCG this FY"), **LTCG Loss Available** (with "Realised LTCG this FY") and a table "Holdings sorted by unrealised loss (harvest candidates)": Asset, Class, Portfolio, Qty, Avg, CMP, Invested, Value, P&L, %, Classification (STCG LOSS, LTCG LOSS, STCG GAIN, LTCG GAIN), Days to LTCG.

**Why it exists:** Shows which holdings could be sold at a loss to offset this year's gains (tax-loss harvesting). From the page text.

**Where to find it:** **Planning → Tax Planning → Tax Harvest**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the tab. Biggest losses are listed first.
2. Read **Days to LTCG**: "LTCG ✓" means all units are already long-term; otherwise the days left (hover for the oldest buy date).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-TAX-001 (for the realised-gain lines).

**Results:** View only; nothing is sold.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings to analyse." | No capital-asset holdings | — |

**Limitations:** The footnote says classification "uses the oldest BUY in the lot — actual FIFO matching at sell time may differ", but the server now classifies by remaining FIFO lots; **Days to LTCG** is computed in the browser with 365 days (equity, ETF, mutual funds), 730 (foreign equity) or 1095 (others), which can differ from the server's rules for non-equity funds bought after 23-Jul-2024 (24 months). Colouring: 7 days or fewer shows in the positive colour, 8–30 days amber.

**How it works:** `GET /api/tax/harvest?fy`. For each capital-asset holding the remaining FIFO lots are valued at today's price; lot P&L is split into short- and long-term; classification is by the larger of the two; holdings with no transaction history count as one short-term lot. Rows sorted by unrealised P&L ascending. Deposits, PF, insurance and similar classes are skipped.

**Related features:** F-ANLYT-008.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:119`, `apps/web/src/pages/tax/TaxPage.tsx:910`, `apps/web/src/pages/tax/TaxPage.tsx:950`, `apps/web/src/pages/tax/TaxPage.tsx:1018`, `apps/web/src/pages/tax/TaxPage.tsx:1046`, `packages/api/src/services/tax/tax.service.ts:527`, `packages/api/src/services/tax/tax.service.ts:627`

### Grandfathering (112A FMV) tab <!-- F-TAX-010 -->
**What it does:** For the FY's sales of equity bought on or before 31-Jan-2018: cards **Rows requiring FMV**, **Gain without FMV**, **Gain with FMV** ("Using Sec. 55(2)(ac) basis"), **Tax benefit from FMV**; a table with Asset, ISIN, Buy Date, Sell Date, Qty, Cost, Proceeds, **FMV / unit** (editable), Adjusted basis, Corrected gain, Tax saving; and **Schedule 112A CSV (with FMV)**.

**Why it exists:** For such equity the cost can be raised to its fair market value on 31-Jan-2018, which lowers the taxable gain; the app needs that price for each ISIN. From the on-screen disclaimer.

**Where to find it:** **Planning → Tax Planning → Grandfathering (112A FMV)**, or **Edit FMV values →** on Schedule 112A.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER (edits the managed person's overrides).

**Steps**
1. Open the tab. Rows without a price show **Enter FMV** in amber, with the banner "N holding(s) bought before 31-Jan-2018 need the BSE/NSE closing price on that date. …".
2. Click **Enter FMV** (or the pencil on an existing value), type the price per unit, press **Enter** or click ✓. Press **Escape** or ✕ to cancel.
3. The tables recompute. Values you entered are tagged "edited"; built-in values "seed".
4. To go back to the seed value, click the revert icon ("Revert to seed value") on an edited value.
5. Click **Schedule 112A CSV (with FMV)** to download `schedule-112a-grandfathering-<FY><member suffix>.csv`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enter FMV** | Button | Opens the price field | Rows without FMV; "no ISIN" rows cannot be edited |
| Pencil ("Edit FMV") | Button | Edit an existing value | Visible on hover |
| ✓ / ✕ | Buttons | Save / cancel | ✓ disabled while saving |
| Revert ("Revert to seed value") | Button | Deletes your override | Only on "edited" values |
| **Schedule 112A CSV (with FMV)** | Button | Download | This tab only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| FMV per unit | Number | Yes to save | ≥ 0, step 0.01; must be a finite number | Current value or empty | Empty or invalid input is silently ignored; server: "fmvPerUnit (string) is required" |

**Settings and toggles here:** S-TAX-003 **FMV / unit override** — saved per ISIN on your account; affects this tab, Schedule 112A, the tax summary and both CSVs.

**Results:** Your override is stored for that ISIN and a background capital-gains recompute starts; tables reload.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Value not saved, no message | Save request failed (no error is shown) | Retry; reload the page |
| "no ISIN" | The sale has no ISIN to key the price on | Add the ISIN to the transaction |

**Limitations:** Seed values are approximate ("verify against the official BSE bhavcopy for EQ310118"). The adjusted basis cannot exceed the sale proceeds. Per-row "Tax saving" uses 12.5% for sales on/after 23-Jul-2024 and 10% before. This tab and its CSV always use your own data, regardless of **Download reports for**.

**How it works:** `GET /api/tax/grandfathering?fy` (rows, totals; rows needing input counted in the browser); `PUT /api/tax/fmv-overrides/:isin` with `{fmvPerUnit, scripName}`; `DELETE /api/tax/fmv-overrides/:isin`. Adjusted basis = max(actual cost, min(FMV × qty, sale value)). Tax benefit total = Σ |gain difference| × LTCG rate at each sale date.

**Related features:** F-TAX-004, W-TAX-001.

**Sources:** `apps/web/src/pages/tax/TaxPage.tsx:229`, `apps/web/src/pages/tax/TaxPage.tsx:309`, `apps/web/src/pages/tax/TaxPage.tsx:1074`, `apps/web/src/pages/tax/TaxPage.tsx:1083`, `apps/web/src/pages/tax/TaxPage.tsx:1093`, `apps/web/src/pages/tax/TaxPage.tsx:1105`, `apps/web/src/pages/tax/TaxPage.tsx:1225`, `apps/web/src/pages/tax/TaxPage.tsx:1292`, `apps/web/src/pages/tax/TaxPage.tsx:1316`, `apps/web/src/pages/tax/TaxPage.tsx:1341`, `apps/web/src/api/tax.api.ts:292`, `packages/api/src/controllers/fmv.controller.ts:58`, `packages/api/src/controllers/fmv.controller.ts:89`, `packages/api/src/controllers/fmv.controller.ts:105`, `packages/api/src/services/tax/fmvOverride.service.ts:206`

**What this area doesn't do**
- It doesn't compute your full income-tax return: salary, TDS, deductions, surcharge and cess are not included.
- It doesn't let you pick a portfolio — every figure covers all your portfolios.
- It doesn't show a whole-family tax view; tax is per person.
- It doesn't record advance tax you have paid (the instalment view is on Analytics, F-ANLYT-007).
- It doesn't sell anything for you; harvesting is information only.

## Analytics

The **Analytics** page (sidebar **Overview → Analytics**, also on the phone tab bar; route `/analytics`; heading "Your money, in detail") explains your portfolio in charts. **Overview** answers "what is it worth, am I up or down, what is doing badly, and what will March cost me"; **Detail** holds the rest (code comment). Every chart and metric has an "i" button whose text says exactly what the number is and which time frame it follows.

### Analytics page controls <!-- F-ANLYT-001 -->
**What it does:** A portfolio selector (**All portfolios (N)** or one portfolio), period pills **1M**, **3M**, **6M**, **1Y**, **3Y**, **5Y**, **All**, and two views, **Overview** and **Detail**. With no portfolios it shows "No portfolios yet — Create a portfolio and add transactions to unlock analytics." with **Get started**.

**Why it exists:** Lets you scope the analysis to one book and a time window. The view is in the URL "so a view can be linked and reloaded into" (code comment).

**Where to find it:** **Overview → Analytics** (route `/analytics`; `/analytics?view=detail` opens Detail).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (AI Insights needs R-PLUS); R-MANAGER (managed person's data).

**Steps**
1. Open **Analytics**. Overview loads for all portfolios and 1Y.
2. Choose a portfolio and/or period. Cards reload (loading placeholders show meanwhile).
3. Click **Detail** for the second set of charts; **Overview** to go back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Portfolio selector | Select | S-ANLYT-001 | — |
| **1M** … **All** | Pills | S-ANLYT-002 | — |
| **Overview** / **Detail** | Tabs | S-ANLYT-003 | — |
| **Get started** | Link | Opens `/onboarding` | Only with no portfolios |
| "i" buttons | Popovers | Explain each card | — |

**Fields and rules:** Not applicable — selectors only.

**Settings and toggles here:** S-ANLYT-001 **Portfolio** — all or one; S-ANLYT-002 **Period** — 30, 90, 180, 365, 1095, 1825 days or all history, used only by cards that say "Follows the period selected at the top."; S-ANLYT-003 **View** — kept in the URL. Portfolio and period reset on reload.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Placeholders never fill | The snapshot request failed (no message is shown) | Reload; in family view choose **All portfolios** |

**Limitations:** In a family view the selector also lists other members' portfolios, but the API accepts only your own (403) — choose **All portfolios** (see DOCUMENTATION_GAPS.md). The data is cached in the browser for 5 minutes (risk for 15).

**How it works:** One call `GET /api/analytics/snapshot?portfolioId&period` returns all cheap widgets; `GET /api/analytics/risk` is fetched only on **Detail**. Period values outside the list are rejected: "Invalid period "…". Use one of: 1M, 3M, 6M, 1Y, 3Y, 5Y, All".

**Related features:** F-ANLYT-002 to F-ANLYT-013, D-ANLYT-001.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:27`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:50`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:57`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:77`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:97`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:123`, `packages/api/src/controllers/analytics.controller.ts:52`, `packages/api/src/controllers/analytics.controller.ts:67`, `packages/api/src/services/analytics/analytics.service.ts:43`, `apps/web/src/App.tsx:166`

### Headline numbers (KPI cards) <!-- F-ANLYT-002 -->
**What it does:** Three cards: **Current value** ("You put in ₹…"), **Profit if you sold today** (₹ with sign and % of invested) and **Annualised return** (XIRR; hint "XIRR · counts when each rupee went in", or "Needs N more days · so far x%" when history is too short).

**Why it exists:** "The three numbers this page exists to answer: what is it worth, am I up or down, and what return is that." (code comment).

**Where to find it:** **Overview → Analytics → Overview**, top.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001 (not the period — these are as of today).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Annualised return "—" | Less than 90 days of cash flows | Wait; the hint says how many days remain |

**Limitations:** XIRR is suppressed under 90 days of history.

**How it works:** From the snapshot `kpis` block: current value, total cost, unrealised P&L and overall XIRR with a reliability flag (span < 90 days → unreliable).

**Related features:** F-REPORT-008.

**Sources:** `apps/web/src/pages/analytics/widgets/KpiCards.tsx:34`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:41`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:51`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:62`, `packages/api/src/services/analytics/analytics.service.ts:111`, `apps/web/src/pages/analytics/infoCopy.ts:42`

### Portfolio value over time <!-- F-ANLYT-003 -->
**What it does:** A line chart: solid line = market value of your holdings, dashed line = amount invested in them, over the selected period.

**Why it exists:** "The one chart that tells the whole story" (code comment); the gap between lines is your gain or loss.

**Where to find it:** **Analytics → Overview**, under the KPI cards.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" button | Popover | Definition | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-002.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No history yet" | No valuation points in the period | Choose a longer period |

**Limitations:** Month-end/dated valuation points from transaction replay; not intraday.

**How it works:** Snapshot `portfolioValueLine` for the period's days (All = full history).

**Related features:** F-REPORT-009.

**Sources:** `apps/web/src/pages/analytics/widgets/PerformanceWidgets.tsx:23`, `apps/web/src/pages/analytics/widgets/PerformanceWidgets.tsx:38`, `packages/api/src/services/analytics/analytics.service.ts:656`, `apps/web/src/pages/analytics/infoCopy.ts:74`

### AI Portfolio Insights <!-- F-ANLYT-004 -->
**What it does:** A foldable panel **AI Portfolio Insights**. It shows instant rule-based cards ("Instant · from your data") — an FD maturing within 30 days, and from October to March the total unrealised loss on equity, ETF and mutual fund holdings that could offset gains before 31 March — and, on request, an AI-written narrative with cards by category (Diversification, Tax optimisation, Underperformers, Cash drag, Sector tilt, Risk concentration) and severity (HIGH/MEDIUM/LOW), each possibly with a link to act on it, followed by a disclaimer.

**Why it exists:** A starting point for your own review — "Observations generated by AI from your portfolio data … not financial advice" (info text).

**Where to find it:** **Analytics → Overview**, below the value chart.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees the panel blurred behind "AI Insights is locked — Upgrade to Plus to unlock AI Insights." with **View plans**. R-MANAGER: the managed person's data under the manager's plan.

**Steps**
1. Expand the panel if folded (click its title).
2. With no stored insight: click **Generate insights**. A cached result under 24 hours old is reused ("Loaded cached insight (under 24h old).") or a new one is made ("Insights generated.").
3. To force a fresh run, click **Regenerate** (or **Generate** in the header).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Panel title (chevron) | Toggle | Fold/unfold; remembered on this browser (S-ANLYT-005) | — |
| **Generate insights** | Button | Generate, reusing a result under 24 h old | Disabled while running or when the monthly AI budget is reached |
| **Regenerate** / **Generate** (header) | Button | Always makes a fresh result | Same; hidden when folded |
| Card action link | Link | Opens the relevant page | Only when the card has one |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ANLYT-005 **Insights panel folded** (this browser only); S-ANLYT-001 and S-ANLYT-002 are sent with the request.

**Results:** A new insight is stored for you (per portfolio or all portfolios) and its estimated cost is added to your monthly AI spend.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Monthly LLM budget reached — New insights are paused until next month, or until the cap is raised in settings." | Your AI spend this month reached the cap (default ₹1,000) | Wait for next month; the cap is operator configuration, not a user setting |
| "AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true)." | Feature off on this server | Operator must enable it |
| "ANTHROPIC_API_KEY is not set — cannot generate insights." | Server not configured | Operator |
| "Monthly LLM cap reached (₹x / ₹y)." | Budget reached at generate time | Wait |
| "No portfolio data available to analyse." | Nothing to analyse | Add holdings |
| "Generate failed" | Request failed | Retry |

**Limitations:** The 24-hour cache is per portfolio scope, not per period. Server configuration messages are shown to users verbatim. The rule-based cards always cover all your portfolios. The panel is still mounted (blurred) for Free users, whose insight requests are refused by the server.

**How it works:** `GET /api/analytics/insights` returns the latest stored insight (any age); `POST /api/analytics/insights/generate {period, force}`; `GET /api/analytics/insights/deterministic`; `GET /api/analytics/insights/spend` (ungated). Generation uses the Anthropic API with model from AppSetting `llm.insights_model` or env `LLM_INSIGHTS_MODEL` (default `claude-sonnet-4-6`), sends your aggregated snapshot (not raw documents), and records cost at $3 input / $15 output per million tokens × FX (AppSetting `llm.usd_inr_fx`, default 90). In non-production the feature is on when an API key exists. Budget: warn ₹500, cap ₹1,000 per month unless overridden.

**Related features:** F-ANLYT-008, D-ANLYT-002.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:177`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:107`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:146`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:174`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:223`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:254`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:268`, `packages/api/src/routes/analytics.routes.ts:33`, `packages/api/src/services/analytics/analytics.insights.ts:133`, `packages/api/src/services/analytics/analytics.insights.ts:146`, `packages/api/src/services/analytics/analytics.insights.ts:185`, `packages/api/src/services/analytics/analytics.insights.ts:286`, `packages/api/src/services/analytics/analytics.insights.ts:345`, `packages/api/src/services/insights/deterministicInsightsRules.ts:8`, `packages/api/src/services/insights/deterministicInsightsRules.ts:33`, `packages/api/src/ingestion/llm/budget.ts:21`, `packages/api/src/config/env.ts:117`

### Allocation and concentration <!-- F-ANLYT-005 -->
**What it does:** **Allocation by class** — a pie of today's value by asset type. **Concentration** — your largest holdings (up to 10) with each one's share, and a sentence "Your top N holdings are X% of everything you own" (or "Your biggest holding is X% of everything you own" when the listed holdings are the whole portfolio).

**Why it exists:** Shows where the money sits and how much sits in one place. From info text.

**Where to find it:** **Analytics → Overview**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet" | No holdings | — |

**Limitations:** The info text says shares "above 60% is flagged", but the card shows no flag (see DOCUMENTATION_GAPS.md).

**How it works:** Snapshot `allocationByClass` and `concentrationRisk` (top 10 of the holdings treemap by value, with running cumulative %).

**Related features:** F-ANLYT-010.

**Sources:** `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:21`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:100`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:119`, `packages/api/src/services/analytics/analytics.service.ts:230`, `packages/api/src/services/analytics/analytics.service.ts:357`, `apps/web/src/pages/analytics/infoCopy.ts:115`

### Best and worst holdings <!-- F-ANLYT-006 -->
**What it does:** One table of up to 5 biggest losers and 5 biggest gainers ranked by rupees, with Asset, Class, Value, Gain / loss and %.

**Why it exists:** "Ranked by rupees on purpose: a small holding down 40% matters less than a large one down 5%." (info text).

**Where to find it:** **Analytics → Overview**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" button | Popover | Definition | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet" | No priced holdings | — |

**Limitations:** The server sends the top 10 gainers and losers by percentage; the page re-ranks only those by rupees, so a large-rupee loser outside the top 10 by percentage is not shown. Holdings without a price are left out.

**How it works:** Snapshot `topWinnersLosers` (n = 10 each, by % gain); browser re-sorts the union by rupee P&L and takes 5 each side.

**Related features:** F-ANLYT-005.

**Sources:** `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:33`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:36`, `packages/api/src/services/analytics/analytics.service.ts:340`

### Tax block: financial year and "What you'll owe" <!-- F-ANLYT-007 -->
**What it does:** Under the heading **Tax**, a financial-year selector (labelled "FY 2026-27" etc.) and the card **What you'll owe**: the tax on gains booked so far in that FY and, when it is ₹10,000 or more, the four advance-tax instalments (15 June 15%, 15 September 45%, 15 December 75%, 15 March 100%) with the cumulative amount due, status ("Nothing due", "x% of the year", or "Missed · ₹… interest") and an estimate of interest on missed instalments at 1% a month (section 234C).

**Why it exists:** "The two things they ask at tax time now live here too: pick the year, and see what is owed on it." (code comment).

**Where to find it:** **Analytics → Overview**, section **Tax**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps**
1. Choose the FY (current FY is always offered, plus years with activity).
2. Read the amount and instalments.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| FY selector | Select | S-ANLYT-004 | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ANLYT-004 **Tax financial year** — drives only this block and the harvest card.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not work out the tax for FY …" | Request failed | Reload |
| "Nothing to pay on investments for FY … — no gains have been booked." | No gains | — |
| "… covered by exemptions and set-off." | Gains fully exempt or offset | — |
| "… That is under the ₹10,000 mark, so there is nothing to pay in instalments — it settles with your return." | Total below ₹10,000 | — |

**Limitations:** "Covers investment income this app can see — capital gains, intraday and crypto. Salary, TDS already deducted, other income and deductions are not included, so treat it as a floor rather than a tax return." Advance tax already paid is not known to the app. Slab-rated amounts assume 30% unless your slab is recorded.

**How it works:** `GET /api/tax/advance?fy`. Tax is computed as at each instalment date; a gain counts only from the instalment after it is booked (234C proviso). Interest = shortfall × 1% × 3 months for each of the first three instalments, 1 month for the last, once the date has passed. Below ₹10,000 total, nothing is due in instalments (sec 208).

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:196`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:23`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:69`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:103`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:146`, `packages/api/src/services/tax/advanceTaxMath.ts:24`, `packages/api/src/services/tax/advanceTaxMath.ts:38`, `packages/api/src/services/tax/advanceTax.service.ts:62`

### Cut your tax bill (harvesting) <!-- F-ANLYT-008 -->
**What it does:** For the current FY only: a sentence with the estimated saving ("Selling the holdings below at a loss before 31 March could reduce this year's tax by about ₹…"), four tiles (**Unrealised loss pool**, **STCG offset available**, **LTCG offset available**, **Taxable gains (FY)**), the tax-before/after working with rates and exemption, and up to 20 loss-making holdings (Asset, Portfolio, Class, Bucket, Unrealised loss). For a past FY the card is replaced by "Harvesting losses only helps for the year you are still in. Switch to FY … to see what you could still do."

**Why it exists:** "Leads with one sentence and a rupee figure, because that is the only part most readers need: what selling your losers before 31 March would save." (code comment).

**Where to find it:** **Analytics → Overview**, under **What you'll owe**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-004 (must be the current FY).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing to harvest — none of your holdings is currently worth less than you paid." | No losses | — |
| "… you have no gains this year for them to cancel out." | No booked gains | — |
| "… the gains you have booked so far are already untaxed." | Gains within exemption | — |

**Limitations:** With one portfolio selected, only the candidate list is limited to that portfolio; the totals and the saving are computed across all your portfolios (see DOCUMENTATION_GAPS.md). "An estimate under current set-off rules — not advice."

**How it works:** Snapshot `taxHarvest` from the same harvest report as F-TAX-009 for the current FY; saving = tax on realised gains before minus after offsetting available losses, at today's equity rates and the FY exemption.

**Related features:** F-TAX-009, W-TAX-002.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:199`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:204`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:106`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:122`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:169`, `packages/api/src/services/analytics/analytics.service.ts:847`, `packages/api/src/services/tax/tax.service.ts:633`

### Capital gains by FY and Income by month <!-- F-ANLYT-009 -->
**What it does:** On **Detail**: **Capital gains by FY** — grouped bars Intraday, STCG, LTCG for the last 6 financial years; **Income by month** — stacked bars Dividend, Interest, Maturity for up to the last 12 months, including interest accrued on fixed deposits, NSC, RD and post-office schemes.

**Why it exists:** Trends in realised gains and income. From info text.

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chart tooltips | Hover | Exact amounts | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001; S-ANLYT-002 (income chart only).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realised gains" / "No income recorded" | No data | — |

**Limitations:** Gains chart: last 6 FYs only.

**How it works:** Snapshot `cgByFy` and `incomeTrend` (period days).

**Related features:** F-REPORT-004, F-REPORT-007.

**Sources:** `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:25`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:62`, `packages/api/src/services/analytics/analytics.service.ts:473`, `packages/api/src/services/analytics/analytics.service.ts:581`, `apps/web/src/pages/analytics/infoCopy.ts:127`

### Sector allocation and XIRR by asset class <!-- F-ANLYT-010 -->
**What it does:** **Sector allocation** — pie of directly held stocks by sector (unknown = Unclassified; slices over 6% labelled). **XIRR by asset class** — bars of annualised return per asset type over the whole holding time (up to 12 classes; green gain, red loss).

**Why it exists:** Sector tilt and which asset types actually earn. From info text.

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No equity holdings to classify" | No direct stocks | — |
| "Not enough cashflows to compute XIRR" | No class has an XIRR | — |

**Limitations:** Mutual funds and other assets are not in the sector pie. Across several portfolios, class XIRR is an invested-weighted average.

**How it works:** Snapshot `sectorAllocation` (from the stock master's sector) and `assetClassXirr`.

**Related features:** F-ANLYT-005.

**Sources:** `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:86`, `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:111`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:151`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:170`, `packages/api/src/services/analytics/analytics.service.ts:384`, `packages/api/src/services/analytics/analytics.service.ts:777`, `apps/web/src/pages/analytics/infoCopy.ts:118`

### Money in and out; What you own and owe <!-- F-ANLYT-011 -->
**What it does:** **Money in and out** — monthly bars of cash coming back to you (sales, dividends, interest, maturities) against money you put in (buys, SIPs, deposits), last 12 months. **What you own and owe** — You own, You owe, Net worth.

**Why it exists:** Cash direction and the net-worth picture. From info text ("Neither is good or bad — investing steadily sits below").

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-002 (cash chart).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No cashflow recorded" | No investment cash flows | — |

**Limitations:** Liabilities come from the dashboard net-worth service (loans, cards).

**How it works:** Snapshot `cashflowWaterfall` and `liabilitiesVsAssets` (dashboard net worth: total, liabilities, after liabilities).

**Related features:** D-INTEL-001.

**Sources:** `apps/web/src/pages/analytics/widgets/CashflowWidget.tsx:26`, `apps/web/src/pages/analytics/widgets/LiabilitiesWidget.tsx:15`, `packages/api/src/services/analytics/analytics.service.ts:883`, `packages/api/src/services/analytics/analytics.service.ts:937`, `apps/web/src/pages/analytics/infoCopy.ts:140`

### Risk: swings, worst fall, return correlation <!-- F-ANLYT-012 -->
**What it does:** Cards **How much it swings** (annualised volatility from month-to-month value changes) and **Worst fall** (largest peak-to-trough fall in the period); grid **Return correlation by asset class** (−1 to +1 between pairs of up to 8 largest classes with price history), with "Not shown — no price history: …".

**Why it exists:** Shows how bumpy the ride is and how diversified your asset classes really are. From info text. Sharpe and beta were removed because they are distorted by money you add (code comment).

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-002.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Needs at least two asset classes with price history and 6+ months of data in the selected period." | Not enough data | Choose a longer period |

**Limitations:** Volatility and worst fall use total value, so deposits and withdrawals look like swings. Deposits and other unpriced classes are not in the correlation.

**How it works:** `GET /api/analytics/risk?portfolioId&period` — one monthly valuation pass feeds volatility, max drawdown and class correlation (Pearson over monthly price returns, minimum observations from the server, 6 by default on screen). The NIFTY fetch for beta is capped at 6 seconds.

**Related features:** F-ANLYT-001.

**Sources:** `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:27`, `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:98`, `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:115`, `packages/api/src/controllers/analytics.controller.ts:87`, `packages/api/src/services/analytics/analytics.risk.ts:108`, `packages/api/src/services/analytics/analytics.risk.ts:264`, `apps/web/src/pages/analytics/infoCopy.ts:150`

### What-if: simulate a sale <!-- F-ANLYT-013 -->
**What it does:** Pick a holding, a **Sell qty** and optionally a **Sell price (opt.)**, click **Simulate**: shows Proceeds, the realised gain (labelled Realised STCG / Realised LTCG / Realised gain (mixed)), Est. tax (with rate), Net cash after tax, the split for mixed lots, the share taxed at your slab rate, "Matched N purchase lots oldest-first (FIFO), from <date> · cost basis ₹…", and "This holding: x% → y% of portfolio · N units left (₹…)". Nothing is sold.

**Why it exists:** To preview the tax and concentration effect of a sale before making it. From info text.

**Where to find it:** **Analytics → Detail**, card **What-if: simulate a sale**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps**
1. Choose a holding in **Select a holding…** (all your portfolios, units shown).
2. Enter **Sell qty** (placeholder = units held) and optionally a price (placeholder = current price).
3. Click **Simulate**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Holding** | Select | Holding to sell | — |
| **Sell qty** | Number | Units | — |
| **Sell price (opt.)** | Number | Price; blank = current price | — |
| **Simulate** | Button | Runs the simulation | Disabled until a holding and qty > 0 are set, and while running |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Sell qty | Number | Yes | > 0 and ≤ units held | Empty | "Sell quantity must be positive", "Sell quantity exceeds holding" |
| Sell price | Number | No | Decimal | Current price (else value ÷ qty, else average cost) | — |

**Settings and toggles here:** None (ignores the page's portfolio selector).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Holding not found" | Holding removed | Reload |
| "holdingId and sellQty are required" | Missing input | Fill both |

**Limitations:** "LTCG figures are approximate (the ₹1.25L exemption applies at the aggregate FY level); … Charges (brokerage, STT, stamp duty) are excluded." (disclaimer shown under the result).

**How it works:** `POST /api/analytics/what-if {holdingId, sellQty, sellPrice}` replays the portfolio's transactions to get open FIFO lots (holdings-only imports count as one short-term lot), prices the sale and taxes each part by its term and asset type at today's rates; non-equity short-term gains use your slab (30% if not on file).

**Related features:** F-ANLYT-008.

**Sources:** `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:18`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:41`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:58`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:83`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:144`, `packages/api/src/controllers/analytics.controller.ts:28`, `packages/api/src/services/analytics/whatIf.service.ts:27`, `packages/api/src/services/analytics/whatIf.service.ts:32`, `packages/api/src/services/analytics/whatIf.service.ts:155`, `packages/api/src/services/analytics/whatIf.service.ts:84`

**What this area doesn't do**
- No benchmark comparison is drawn on the page (the API has one, unused).
- No export or download of the charts.
- It doesn't place or record trades — the what-if is a preview only.
- It doesn't show Sharpe ratio or beta.

## Portfolio Score

The **Portfolio Score** page (sidebar **Overview → Portfolio Score**, route `/health-score`; page title "Financial Health Score", eyebrow "Intelligence") gives one 0–100 score and a letter grade summarising six areas of your finances, each with what the app found and what to do about it.

### Financial Health Score overview <!-- F-INTEL-001 -->
**What it does:** Shows a gauge with your overall score and grade, "Updated <date and time>", a **Grade scale** (A Excellent 85–100, B Good 70–84, C Fair 55–69, D Needs work 40–54, F At risk 0–39, your grade highlighted) and a **Recalculate** button. When less than half of the weighted areas can be scored, the grade is "—".

**Why it exists:** "One number summarizing six areas of your financial life — emergency readiness, investing discipline, debt load, diversification, insurance, and goal progress — each weighted by importance." (page description).

**Where to find it:** **Overview → Portfolio Score** (route `/health-score`); the dashboard health card's **View breakdown** link (D-INTEL-001).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (ungated); R-MANAGER (the managed person's score).

**Steps**
1. Open **Portfolio Score**. "Loading…" shows, then the gauge.
2. Click **Recalculate** to compute a fresh score now; the page reloads the result.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Recalculate** | Button | Forces a fresh computation | Disabled while the page query is refreshing |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** A recalculation replaces your stored score snapshot.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your health score. Try again shortly." | Request failed | Reload |
| Grade "—" | Less than 50% of the weight could be scored | Add income, expenses, holdings, policies or goals as each card suggests |

**Limitations:** The description says "Recalculated automatically every 24 hours", but no scheduled job does it: the stored score is reused for 24 hours and recomputed the next time the page (or dashboard card) is opened after that (see DOCUMENTATION_GAPS.md). A failed **Recalculate** shows no message.

**How it works:** `GET /api/intelligence/health-score[?force=true]`. A stored snapshot younger than 24 hours (and of the current format version) is returned unless forced. Overall = weighted average of the parts that could be scored (weights: emergency fund 20%, investment rate 20%, debt burden 20%, diversification 20%, insurance 10%, goal progress 10%), rounded; unscored parts are left out rather than counted as 50; below 0.5 of total weight scored → grade "—". Grade A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, else F.

**Related features:** F-INTEL-002, D-INTEL-001.

**Sources:** `apps/web/src/pages/intelligence/HealthScorePage.tsx:95`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:118`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:128`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:144`, `packages/api/src/controllers/intelligence.controller.ts:11`, `packages/api/src/services/analytics/healthScore.service.ts:15`, `packages/api/src/services/analytics/healthScore.service.ts:254`, `packages/api/src/services/analytics/healthScoreMath.ts:151`, `packages/api/src/services/analytics/healthScoreMath.ts:157`, `packages/api/src/services/analytics/healthScoreMath.ts:184`, `apps/web/src/App.tsx:250`

### Score dimensions <!-- F-INTEL-002 -->
**What it does:** Six cards — **Emergency Fund**, **Investment Rate**, **Debt Burden**, **Diversification**, **Insurance Coverage**, **Goal Progress** — each with "Weight N%", its score (or "Not scored"), a bar, an explanation, **Where you stand** (what was found), **Fix this** or **To score this** (what to do) and **Go to …** links to the pages that hold the data.

**Why it exists:** Tells you which area pulls the score down and where to fix it. Inferred from behavior.

**Where to find it:** **Overview → Portfolio Score**, below the gauge.

**Who can use it:** As F-INTEL-001.

**Steps**
1. Read the lowest-scoring card.
2. Click a **Go to …** link (for example **Go to Bank Accounts**) to add the missing data.
3. Come back and click **Recalculate**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to Bank Accounts**, **Go to FDs & RDs** | Links | `/bank-accounts`, `/fds` | Emergency Fund |
| **Go to Transactions**, **Go to Income** | Links | `/transactions`, `/income` | Investment Rate |
| **Go to Loans**, **Go to Credit Cards**, **Go to Income** | Links | `/loans`, `/credit-cards`, `/income` | Debt Burden |
| **Go to Analytics**, **Go to Portfolios** | Links | `/analytics`, `/portfolios` | Diversification |
| **Go to Insurance**, **Go to Income** | Links | `/insurance`, `/income` | Insurance Coverage |
| **Go to Goals** | Link | `/goals` | Goal Progress |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not scored" with **To score this** | The data for that area is missing (for example "We don't know your income yet, so we can't work out your investment rate.") | Do what the card says (for example "Add your salary under Income, or connect Gmail, so we can see your income.") |

**Limitations:** Income is your active salary entries, else an estimate from confirmed bank-credit events in the last 3 months. Age (for the equity guideline) is used only when known.

**How it works:** Scores (each clamped 0–100): **Emergency Fund** = liquid assets ÷ (6 × monthly expenses) × 100 (not scored without holdings or expenses). **Investment Rate** = monthly investment ÷ monthly income, 100 at 20% (not scored without income). **Debt Burden** = (EMIs + card minimum dues) ÷ income: 100 at ≤ 20%, 0 at ≥ 60%, linear between; 100 when you have no EMIs or card dues; not scored with debt but no income. **Diversification** = average of: largest asset class ≤ 60% (minus 2.5 points per % above), largest single holding ≤ 50% (minus 2 per % above), and — when your age is known — equity % within the age guideline (minus 5 per % gap). **Insurance Coverage** = life-type sum assured (term, whole life, ULIP, endowment) ÷ (10 × annual income); not scored without life policies or income. **Goal Progress** = average progress of active goals (each capped at 100); not scored without goals.

**Related features:** F-INTEL-001, D-INTEL-002.

**Sources:** `apps/web/src/pages/intelligence/HealthScorePage.tsx:39`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:209`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:214`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:234`, `apps/web/src/pages/intelligence/HealthScorePage.tsx:247`, `packages/api/src/services/analytics/healthScoreMath.ts:26`, `packages/api/src/services/analytics/healthScoreMath.ts:39`, `packages/api/src/services/analytics/healthScoreMath.ts:50`, `packages/api/src/services/analytics/healthScoreMath.ts:77`, `packages/api/src/services/analytics/healthScoreMath.ts:122`, `packages/api/src/services/analytics/healthScoreMath.ts:135`, `packages/api/src/services/analytics/healthScore.service.ts:327`, `packages/api/src/services/analytics/healthScore.service.ts:350`, `packages/api/src/services/analytics/healthScore.service.ts:363`, `packages/api/src/services/analytics/healthScore.service.ts:410`, `packages/api/src/services/analytics/healthScore.service.ts:434`

**What this area doesn't do**
- It doesn't track your score over time — only the latest score is kept.
- It doesn't let you change the weights or targets.
- It doesn't score a family as a whole.
<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open Reports, Tax Planning, Analytics or Portfolio Score (sent to sign in).

### Free user <!-- R-FREE -->
All four pages. Reports: every tab, statements, on-screen and tab downloads, and the two free catalog reports; the other 40 catalog reports are locked. Tax Planning: every tab except F&O (blank). Analytics: everything except AI Insights (locked card). Portfolio Score: full.

### Plus subscriber <!-- R-PLUS -->
Everything Free has, plus the 34-report Tax & CA Report Catalog and AI Insights.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in this area.

### Pro/Advisor subscriber <!-- R-PRO -->
Everything Plus has, plus the 6 accounting reports (including Export to Tally) and the F&O (Sec. 43(5)) tab.

### Administrator <!-- R-ADMIN -->
Access follows their plan; additionally receives the nightly "Data integrity: stored figures drifted" alert (oldest active admin only).

### Family owner <!-- R-FAMOWNER -->
In family view, can download any report for any active member or for the whole family (Tax Planning downloads: one member at a time). On-screen figures stay their own.

### Family contributor <!-- R-FAMCONTRIB -->
Same as owner when their view covers every asset class and category; a capped contributor can download only their own reports.

### Family viewer <!-- R-FAMVIEWER -->
Same as contributor.

### Managing a family member's account <!-- R-MANAGER -->
Every page shows the managed person's data under the manager's plan. The Inbox imports tab does not work (Gmail is an account route).

### Professional acting for a client <!-- R-PROF -->
Not applicable on these pages; client reports are downloaded from the CA workspace (D-REPORT-006).

### AI chatbot connection <!-- R-AICONN -->
No access to these pages.

### Succession nominee <!-- R-NOMINEE -->
No access.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| FY (financial year) | The Indian April–March tax year, written "2026-27". |
| STCG / LTCG | Short-term / long-term capital gain, decided by how long the units were held before sale. |
| Intraday (speculative) | A buy and sell of the same security on the same day; taxed as speculative business income under Sec. 43(5). |
| Schedule 112A | The ITR schedule for long-term gains on listed equity and equity-oriented funds, with an annual exemption (₹1,25,000 from FY 2024-25). |
| Schedule 112 | The ITR schedule for long-term gains on other assets, with or without indexation. |
| Sec. 111A | Short-term gains on listed equity with STT paid, taxed at a flat rate. |
| Grandfathering / FMV | For equity bought on or before 31-Jan-2018, the cost can be raised to its fair market value (closing price) on that date. |
| Indexation / CII | Raising the cost of an asset by the Cost Inflation Index of the sale year over the purchase year. |
| Set-off / carry forward | Using losses to reduce gains in the same year; unused losses are carried to later years. |
| Tax-loss harvesting | Selling holdings that are at a loss before 31 March to offset gains booked in the same year. |
| Advance tax | Tax paid in four instalments during the year (15 June, 15 September, 15 December, 15 March). |
| Slab rate | Your personal income-tax rate, used for non-equity short-term gains, intraday and F&O. |
| Unrealised P&L | Gain or loss on holdings you still own, at today's price. |
| Realised gain | Gain or loss locked in by a sale. |
| XIRR | Annualised return that accounts for the date of every cash flow. |
| Data checks | The checks above the Reports tabs that say whether figures are complete and current. |
| Report for | The picker that chooses whose figures a download covers: you, one family member, or the whole family. |
| Tax & MIS downloads | The catalog of 42 print-style reports on the Reports page. |
| Financial Health Score | The 0–100 score and A–F grade on the Portfolio Score page. |
<!-- END GLOSSARY -->
