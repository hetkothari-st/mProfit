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
