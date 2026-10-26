# Workflows and Troubleshooting — Mutual Funds (B02)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Mutual Funds, Mutual Fund Analytics

<!-- BEGIN WORKFLOWS -->
## Import your mutual fund history from a CAS PDF <!-- W-MF-001 -->
**Goal:** Get every mutual fund transaction from a CAMS / KFintech CAS into EveryPaisa.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER imports into the managed person's data).
**Before you start:** Download your CAS PDF (or request one with W-MF-002 / W-MF-003).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Mutual Funds**, click **Import CAS PDF** | Scrolls to **Automated CAS Import** |
| 2 | Drop the PDF or click **Choose file** | Toast "CAS uploaded — parsing in background. Status will update below."; **Recent imports** shows Pending/Processing |
| 3 | Wait (10–30 seconds for large files) | Status polls every 2 seconds; holdings and transactions refresh when done |
| 4 | If **Needs password**: click it, enter the PDF password | "Password accepted — reprocessing" |
| 5 | Check the row count and the holdings table | Holdings show units, value and P&L (F-MF-001) |

**Success:** Status **Completed**, rows "N/N rows", funds appear in the holdings table.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Failed** or **Partial** | Some rows could not be parsed | Click **View**; fix via the Import page (D-MF-003) |
| "CAS confirmed — no MF transactions in this period. …" | The statement's date range has no MF transactions | Request a wider range (W-MF-002) |
| Funds listed without NAV | NAV not yet loaded for the scheme | Wait for the nightly update at 22:00 IST |

Continues on the Import page for error handling (D-MF-003).

## Request a CAS from CAMS and KFintech <!-- W-MF-002 -->
**Goal:** Have both registrars email you a CAS, then import it.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Know the email registered on your folios; Gmail connected if you want auto-import (D-MF-004).

| # | You do | The app does |
|---|---|---|
| 1 | Click **Sync via CAMS / KFintech** | Loads your saved PAN |
| 2 | If prompted, **Set PAN now** → type PAN → **Save PAN** | "PAN saved to profile" |
| 3 | Enter **Email**, choose **Period** (S-MF-004), click **Continue** | Opens both portals; toast "CAMS & KFintech reached" |
| 4 | Type each captcha shown | — |
| 5 | Click **Submit CAS Request** within 5 minutes of step 3 | Shows per-portal OK / failed result |
| 6 | Wait 5–60 minutes for the emails | Gmail import (if configured) or upload the PDF via W-MF-001 |

**Success:** **CAS request submitted** with "CAMS: OK" and/or "KFintech: OK".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Failed to reach CAMS or KFintech portals. Try again or use PDF upload." | Portals unreachable | Retry later or use W-MF-001 |
| "failed — CAMS session expired" | More than 5 minutes passed | Start again |
| "failed — … rejected the captcha" | Wrong captcha | Start again |
| No email | Email or PAN not on the folios | Check with the registrar |

## Request a CAS through CASParser <!-- W-MF-003 -->
**Goal:** Get a KFintech-issued CAS (covering CAMS and KFintech funds) by PAN + email, auto-imported from Gmail.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Gmail connected (D-MF-004) for automatic import.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Sync MF via CASParser** | Opens **Sync Mutual Funds via PAN + Email**; shows CASParser credits when available |
| 2 | Enter **PAN**, **Email**, choose **Period** (S-MF-001) | **Request CAS** enables when both look valid |
| 3 | Click **Request CAS** | Shows **CAS request submitted** and a reference; adds CAS senders to your Gmail monitoring and starts a Gmail sync |
| 4 | Wait 5–60 minutes | The email is imported automatically when Gmail is connected; otherwise use W-MF-001 |

**Success:** A new CAS import appears under **Recent imports**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Too many requests for this operation. Please wait a minute." | More than 5 requests in a minute | Wait |
| "Internal server error" | CASParser not configured or rejected the call | Try W-MF-002 or upload a PDF |

## Review your mutual fund portfolio analysis <!-- W-MF-004 -->
**Goal:** Understand returns, overlap, cost and tax across your funds.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** At least one mutual fund holding.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Portfolio analysis** on the Mutual Funds page | Computes the analysis on request |
| 2 | Read **Mutual fund book**, **Funds you hold**, **Overlap**, **Look-through**, **Cost**, **Tax**, **Goals** | Each section states when a figure is unavailable and why |
| 3 | Click a scheme name | Opens the fund page (W-MF-005) |

**Success:** All sections render; unavailable figures carry a reason.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Lock card "Portfolio analytics is locked" | Free plan | **View plans** (D-MF-005) |
| **Could not analyse your portfolio** | Server error or invalid family view | Retry or switch to personal view |

## Research a fund and refresh findings <!-- W-MF-005 -->
**Goal:** See how a fund scores against its category and what the analysis concluded for your holding.
**Who:** R-PLUS, R-FAMILY, R-PRO.

| # | You do | The app does |
|---|---|---|
| 1 | Open a fund from **Funds you hold** | Shows **Overview** (S-MF-010) |
| 2 | Click **Detailed calculations**, choose a horizon (S-MF-011) | Shows score card, metrics, peer percentiles |
| 3 | In **What we found**, click **Refresh analysis** | Runs a new analysis (once per hour) and updates every fund page |

**Success:** A verdict chip and findings for the fund.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Analysis was refreshed less than an hour ago. Next refresh available at <time>." | Cooldown | Wait |
| **No verdict for this fund** | Not held, or added after the last run | Refresh analysis |
| "Unknown scheme code: <code>" | Scheme not in the research data | None |

## Import mutual funds from Finvu (operator sandbox) <!-- W-MF-006 -->
**Goal:** Pull Finvu account-aggregator mutual fund data into a portfolio.
**Who:** R-PLUS, R-FAMILY, R-PRO; Finfactor must be configured or in demo mode.

| # | You do | The app does |
|---|---|---|
| 1 | In the Finvu card, set **Unique identifier** (S-MF-007) | — |
| 2 | Optionally click **MF insights** or **Statement** to preview | Renders the response |
| 3 | Choose **Destination portfolio** (S-MF-008), click **Import to portfolio** | Creates transactions; toast with created/skipped counts |
| 4 | Reload the page | Holdings table shows the imported funds |

**Success:** Toast "Imported N txns into "<portfolio>" …".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| Buttons disabled, **Token missing** | Not configured | Operator action |
| Page unchanged after import | Page cache not refreshed | Reload |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| Mutual fund NAV marked with "⚠" | Stored price older than 5 days | Wait for the 22:00 IST NAV job; **Sync AMFI NAV** alone does not reprice holdings |
| A figure on the analysis or fund page reads "not available" with a reason | The data needed is missing, and the app will not show a zero instead | None — the reason names what is missing |
| Older mutual fund transactions missing from the Mutual Funds page | That list shows only the latest 200 | Use **Overview → Transactions** |
| "Internal server error" from a sync dialog | Third-party (CASParser / Finfactor) error not mapped to a message in production | Try the other sync route or upload a PDF |
<!-- END TROUBLESHOOTING -->
