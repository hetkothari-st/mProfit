# Workflows and Troubleshooting — B01 Asset classes fragment

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Stocks, Futures & Options, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Other Assets (batch B01)

<!-- BEGIN WORKFLOWS -->
## Record a stock purchase and check it <!-- W-STOCK-001 -->
**Goal:** Add a stock you bought and see it valued.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).
**Before you start:** At least one portfolio.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Stocks** | Shows holdings or "No equity holdings" |
| 2 | Click **Add transaction** | Opens "Add transaction" (D-ASSET-002) |
| 3 | Fill the stock, quantity, price and date; save | Saves; rebuilds the holding; starts a background price refresh |
| 4 | Click **Refresh prices** if LTP shows "—" | "Refreshed N stock prices"; LTP and Value fill in |

**Success:** The stock row shows Qty, Avg cost, LTP "as of …", Value and P&L.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "…is already recorded. Record it again only if this is a second, genuine trade." | Same trade exists | Confirm in the form if it's genuine (the Transactions form offers this) |
| LTP stays "—" | No price for the symbol | Check the symbol; wait for the 16:30 IST end-of-day job |

## Add a fixed deposit and follow it to maturity <!-- W-FD-001 -->
**Goal:** Track an FD's value and get maturity reminders.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).
**Before you start:** Bank name, amount, opening date, rate, payout frequency, maturity date.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → FDs & RDs** → **Add** ▾ → **Fixed Deposit** | Opens "Add Fixed Deposit" |
| 2 | Pick the bank, enter **Principal Amount (₹)**, date, **Interest Rate**, **Interest Payout**, **Maturity Date**; optionally the FD number | — |
| 3 | Click **Add FD entry** | "FD entry added"; a card appears with **At maturity**, progress and **Worth today** |
| 4 | Within 30 days of maturity | "Coming up" lists it; the bell gets alerts at 30, 15, 7 and 1 days |
| 5 | When it matures, add a **Maturity payout** entry | The deposit closes and leaves the page; reminders stop |

**Success:** The card shows the projected maturity value and the matured stamp after the date.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Add a rate and maturity date to see what this deposit becomes." | Missing rate or maturity | Edit the deposit |
| Two FDs at the same bank merged into one card | Same name, no FD number | Edit each to add its FD number |
| Duplicate message when adding a second identical FD | Same bank, date, amount | Add the FD number to tell them apart |

## Run a recurring deposit installment by installment <!-- W-FD-002 -->
**Goal:** Record an RD and tick off each month.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).
**Before you start:** Monthly amount, start date, rate, tenure.

| # | You do | The app does |
|---|---|---|
| 1 | **FDs & RDs** → **Add** ▾ → **Recurring Deposit** | Opens "Add Recurring Deposit" |
| 2 | Enter **Monthly Installment (₹)**, **Installment date** (first payment), rate, **Tenure (months)** | **Maturity Date (auto-filled)** = start + tenure |
| 3 | Click **Add RD entry** | "RD entry added"; RD card shows "1 of <tenure>" |
| 4 | Open the RD card | Detail page with **Installment schedule** |
| 5 | Each month click **Mark paid** on the due row | "Installment marked paid"; row turns **Paid** |
| 6 | Paid by mistake? Click **Undo** | "Entry removed" |

**Success:** "<paid> / <total> paid"; Next EMI moves forward; reminders 3/1/0 days before each due date.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Installment shows **Overdue** | Not recorded | **Mark paid** |
| After a **Maturity payout** entry the RD is still listed | That entry removes only one installment | Delete the remaining installments, or leave it (see DOCUMENTATION_GAPS.md) |

## Record gold jewellery with photos <!-- W-GOLD-001 -->
**Goal:** Add a piece of jewellery valued at today's rate.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Gold & Silver** → **Add** | "Add Gold / Silver" with today's 24K price filled ("live") |
| 2 | Keep **Physical Gold**, pick **Carat** (e.g. 22K) | Price per gram re-fills at 22/24 of the 24K price |
| 3 | Name it ("Gold bracelet"), enter **Weight (grams)** and date; adjust price to what you paid | — |
| 4 | **Add photo** (up to 5) and click **Add entry** | Saves as "22K Gold bracelet", uploads photos, "Entry added" |
| 5 | Click the holding | Detail page with photo carousel and live valuation |

**Success:** The page values the piece at the 22K live rate.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Max 5 photos per entry" | Too many photos | Remove some |
| Dashboard value differs from the Gold page | Server values at 24K | Known limitation (DOCUMENTATION_GAPS.md) |

## Add a coin with live pricing <!-- W-CRYPTO-001 -->
**Goal:** Track a crypto holding with live INR/USD value.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Crypto** → **Add Crypto** | Opens "Add Cryptocurrency" |
| 2 | Type "BTC" in **Coin** and pick **Bitcoin** | "Linked to CoinGecko · live prices enabled" |
| 3 | Enter **Quantity**, click "Use this →" or type **Price ₹**, pick exchange | — |
| 4 | Click **Add entry** | "Crypto entry added"; a coin card with live value appears |

**Success:** Card shows INR and USD value and 24h change.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Coin not in search | Not in the app's coin list | Enter as free text (no live price) |

## Record a Post Office scheme <!-- W-PO-001 -->
**Goal:** Track an NSC (or any of the 8 schemes).
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Post Office** → **Add first NSC** (or **Add scheme**) | "Add Post Office Entry" with NSC selected |
| 2 | Enter **Post Office branch**, **Certificate number**, date, **Certificate amount (₹)**, rate 7.7 | **Maturity date** auto-fills 5 years later |
| 3 | Click **Add entry** | "Post Office entry added"; NSC section shows the account with accrued value |
| 4 | Open the account | Detail page with projected growth and CAGR |

**Success:** Current value grows yearly; alerts at 30/15/7/1 days before maturity.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Current shows "—" | No interest rate saved | **Edit details** and add the rate |

## Connect Zerodha and sync today's F&O trades <!-- W-FNO-001 -->
**Goal:** Bring F&O trades in from Kite.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a Kite developer app.
**Before you start:** API key and secret from developers.kite.trade; the redirect address the dialog shows registered in your Kite app.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → F & O** → **connect** on **Kite (Zerodha)** | "Connect broker" dialog |
| 2 | Paste **API key**, **API secret**; **Save & continue** | "Kite (Zerodha) configured"; opens the Kite login popup |
| 3 | Log in to Kite in the popup | Popup closes; "Kite (Zerodha) login complete"; chip shows a tick |
| 4 | Click **Sync Kite** | "Synced — N new trades"; positions and trades refresh |
| 5 | Next day, click **login** on the chip before syncing | Kite needs a daily login |

**Success:** Open positions appear in the Futures Ledger / Options Chain.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Popup blocked — allow popups and retry." | Browser blocked popup | Allow popups |
| "Login to Kite (Zerodha)." | Session expired | Complete login; sync resumes |
| Earlier days' trades missing | Sync fetches today only | Import contract notes (D-ASSET-012) |

## Close an F&O position at expiry <!-- W-FNO-002 -->
**Goal:** Book the expiry of a contract held to expiry.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

| # | You do | The app does |
|---|---|---|
| 1 | Expiry day, after 17:30 IST | Job creates an expiry close request, sets status "EXPIRY ?", alert "… expires today" |
| 2 | **F & O** → **Expiry** | Lists "Expiry close <date>" with contracts and settlement |
| 3 | Click **Approve** | "Approved"; closing trade booked at settlement; position closed (EXPIRED_WORTHLESS if 0) |

**Success:** The contract moves to **Closed**; P&L appears under **Tax / P&L**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "No settlement price for this contract yet — add it before closing the position at expiry." | Bhavcopy not stored | Retry after the 16:45 bhavcopy job has run; there is no manual price field |
| Clicked **Reject** by mistake | Request rejected; position stays "EXPIRY ?" | No in-app way to re-open it (DOCUMENTATION_GAPS.md) |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| Asset page shows Current value ₹0 and a loss equal to everything invested (Bonds, NPS, Others) | These classes have no price source; the page adds only holdings with a value | Read Invested; no fix in the app |
| An older transaction isn't listed on an asset page | Only the newest 200 per asset class are loaded | Use **Overview → Transactions** with filters |
| "Validation failed" when saving an entry | Server rule broken, e.g. account/ISIN/PRAN over 20 characters or notes over 500 | Shorten the field |
| "Forbidden" when saving or deleting | The portfolio isn't yours (e.g. a family portfolio created by someone else) | Use a portfolio you own |
| Detail page (Gold, Crypto, Post Office) jumps back to the list | It was opened by a direct link or refreshed | Open it again from the list |
| A withdrawal removed the whole deposit | Amount-only entries are 1 unit; withdrawal removes one whole entry | No partial withdrawal exists; delete the withdrawal entry if you want the deposit kept on the page |
<!-- END TROUBLESHOOTING -->
