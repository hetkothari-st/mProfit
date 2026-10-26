# Workflows and Troubleshooting — Reports, Tax, Analytics, Portfolio Score (B08)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Reports, Tax Planning, Analytics, Portfolio Score

<!-- BEGIN WORKFLOWS -->
## Check your data before trusting a report <!-- W-REPORT-001 -->
**Goal:** Make sure the figures in Reports are complete before filing or sharing them.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.
**Before you start:** Have your transactions imported.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Reports** | Runs data checks ("Checking your data…") |
| 2 | If amber/red, click **See N issues** | Lists each issue with up to 20 examples |
| 3 | For "Some sales are for more units than were ever bought …", click **Add purchase** or **Review N matching purchase(s) from email** | Opens the pre-filled transaction form or the email review page (D-REPORT-001, D-REPORT-002) |
| 4 | For "Some saved holdings do not match the transactions …", click **Fix now** | Rebuilds stored holdings and gains; toast "Rebuilt N holding(s) from your transactions" |
| 5 | Come back to Reports | "All data checks passed. Data as of: …" |

**Success:** Green line "All data checks passed."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Could not rebuild holdings" | Repair failed | Retry; the nightly 02:15 IST job also repairs (F-REPORT-017) |
| "Data checks could not be run, so these reports have not been verified." | Check request failed | Reload the page |
| Prices flagged as old | Price older than 5 days (2 for crypto) | Wait for the price jobs; check the asset's identifier |

## Download your capital gains for the income-tax return <!-- W-REPORT-002 -->
**Goal:** Get capital gains files for an FY to file or send to your CA.
**Who:** R-FREE and up (catalog reports need R-PLUS).
**Before you start:** Complete W-REPORT-001.

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → Reports**, set **Portfolio** to **All portfolios** | — |
| 2 | Open **Statements**; (to change year, first open an FY tab and pick **Financial Year**) | Shows four statement cards with "FY …" |
| 3 | Click **PDF** on **Capital Gains Statement** | Saves `everypaisa-capital-gains-<FY>.pdf` |
| 4 | Optional: **Tax & MIS downloads** → **Income Tax — Schedule 112A** → **Excel** | Saves the Schedule 112A layout (Plus) |
| 5 | Optional: **Planning → Tax Planning → Summary → Download PDF** | Saves the CA tax report |

**Success:** Files saved on your device.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Alert containing "This feature requires the PLUS plan or higher" | Catalog report on Free | Use Statements (free) or upgrade |
| Alert with "Forbidden" | A single portfolio chosen together with another member in **Report for** | Choose **All portfolios** |

## Download a report for a family member or the whole household <!-- W-REPORT-003 -->
**Goal:** Produce a report covering a spouse or the family.
**Who:** R-FAMOWNER; R-FAMCONTRIB / R-FAMVIEWER with an uncapped view.
**Before you start:** Switch the header view to the family (D-REPORT-007).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Reports** | **Report for** appears |
| 2 | Choose a member or **Whole family (one section per member)** | Tax & MIS shows "These downloads cover …" |
| 3 | Keep **Portfolio** = **All portfolios**; download from a tab, Statements or Tax & MIS | File name ends with `-family` or the member's name |

**Success:** A file with one section per member (family) or that member's data.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. …" | Your family role is capped | Download your own reports; ask an owner |
| "The Tally export covers one person — …" (or the holdings / dashboard export / FY bundle equivalent) | That report is one person per file | Pick a single member |
| "A family must be selected before a report can be run for another member or for the household." | No family view | Switch to the family view first |

## Enter grandfathering FMV and download Schedule 112A <!-- W-TAX-001 -->
**Goal:** Use the 31-Jan-2018 price for equity bought before that date so long-term gains are not overstated.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** Have sales of pre-31-Jan-2018 equity in the FY.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Tax Planning**, pick **Financial Year**, open **Grandfathering (112A FMV)** | Shows rows; "Rows requiring FMV" count |
| 2 | Click **Enter FMV** on a row, type the closing price, press **Enter** | Saves the override ("edited"), starts a recompute, reloads tables |
| 3 | Repeat until "All FMVs are filled in" | Gain with FMV and Tax benefit update |
| 4 | Click **Schedule 112A CSV (with FMV)** | Saves `schedule-112a-grandfathering-<FY>.csv` |

**Success:** CSV with the FMV column filled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Value not kept, no message | Save failed | Retry; reload |
| "no ISIN" | Row has no ISIN | Add the ISIN to the transaction |
| CSV is your own data although a member is selected | These buttons ignore **Download reports for** | Sign in as / manage that member instead |

## Plan tax-loss harvesting before 31 March <!-- W-TAX-002 -->
**Goal:** See how much tax selling loss-making holdings could save this year.
**Who:** R-FREE and up.
**Before you start:** Current-FY gains booked.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Analytics**, keep the Tax FY on the current year | **Cut your tax bill** shows the estimated saving and candidates |
| 2 | Optional: **Detail → What-if: simulate a sale** for one candidate | Shows gain/loss, tax and cash |
| 3 | Optional: **Planning → Tax Planning → Tax Harvest** for the full list with Days to LTCG | Lists holdings by unrealised loss |

**Success:** You know which sales would offset which gains.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Harvesting losses only helps for the year you are still in. …" | A past FY selected | Switch to the current FY |
| "… you have no gains this year for them to cancel out." | Nothing to offset | — |

## Generate AI portfolio insights <!-- W-ANLYT-001 -->
**Goal:** Get an AI-written review of your portfolio.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Have holdings.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Analytics**, choose portfolio and period | — |
| 2 | In **AI Portfolio Insights**, click **Generate insights** | Reuses a result under 24 h old or generates one; toast |
| 3 | Click **Regenerate** for a fresh run | New narrative and cards |

**Success:** Narrative, cards and disclaimer shown.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Monthly LLM budget reached …" | Monthly AI spend cap reached | Wait for next month |
| "AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true)." | Server setting | Contact the operator |
| "AI Insights is locked" | Free plan | Upgrade (D-REPORT-004) |

## Raise your Financial Health Score <!-- W-INTEL-001 -->
**Goal:** Get a full grade and improve weak areas.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Portfolio Score** | Gauge, grade (or "—") and six cards |
| 2 | On each "Not scored" card, follow **To score this** via its **Go to …** link | Opens the page to add income, expenses, policies or goals |
| 3 | Return and click **Recalculate** | New score and grade |

**Success:** A letter grade and scores on all six cards.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Grade stays "—" | Less than half the weight scored | Add income and holdings first (each 20%) |
| "Couldn't load your health score. Try again shortly." | Request failed | Reload |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| A report tab or Analytics card stays empty with no message | The request failed; these pages show nothing on error (for example a family member's portfolio picked in **Portfolio**) | Choose **All portfolios**; reload |
| A browser alert full of raw text after clicking a download | Downloads show the server's raw error response | Read the "message" in the text; most common fixes: choose **Me**, fix dates, or upgrade |
| "Invalid financial year "…" — expected consecutive years like 2025-26" | Malformed FY in a link | Use the page's year selector |
| Numbers differ between Analytics "Realised P&L" style figures and taxable figures | Book gains vs taxable gains (grandfathering, indexation, exemption) | Expected; tax pages show taxable figures |
| Report figures change overnight | The 02:15 IST integrity job rebuilt drifted holdings/gains | Expected; check the data checks banner |
<!-- END TROUBLESHOOTING -->
