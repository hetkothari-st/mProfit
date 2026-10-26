
## Futures & Options

The **Futures & Options** page (sidebar **F & O**) tracks derivative contracts separately from your stock holdings: open and closed positions, live mark-to-market, the trade tape, F&O business P&L by financial year, and closing positions on expiry day. Trades arrive from a connected broker or from imported contract notes.

### F&O summary and expiring-soon banner <!-- F-FNO-001 -->
**What it does:** Shows four cards — **Open positions** (count), **Realized P&L**, **Unrealized P&L**, **Expiring 7d** (count, amber when above zero) — and, when any open contract expires within 7 days, an amber banner "**Expiring soon:** <underlying> (<date>), …".

**Why it exists:** A quick read of derivative exposure and upcoming expiries. Inferred from behavior and the page description "Open positions, P&L, expiry lifecycle, broker sync."

**Where to find it:** **Asset Classes → F & O** (route `/fo`). The page works on the portfolio given in `?portfolioId=`; without it, on your first portfolio.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate); R-ADMIN as their plan. Only your own positions are shown (family view does not add other members' F&O).

**Steps**
1. Open **Asset Classes → F & O**. The cards load and refresh every 5 seconds while the tab is visible.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report dialog for holdings filtered to Futures and Options (D-ASSET-001) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Cards missing | No portfolio yet, or the summary request failed | Create a portfolio; reload |

**Limitations:** There is no portfolio picker on the page; to see another portfolio you need a link with `?portfolioId=`. Realized P&L sums every position (open and closed); Unrealized sums only OPEN positions.

**How it works:** `GET /api/fo/summary?portfolioId=` reads your DerivativePosition rows: open = status OPEN; realized = sum of realizedPnl over all; unrealized = sum of unrealizedPnl over open; "expiring soon" = open positions whose expiry is 0–7 days away (rounded up to whole days).

**Related features:** F-FNO-002, F-FNO-005, F-FNO-006.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:149`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:221`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:374`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:396`, `packages/api/src/controllers/fo.controller.ts:75`

### Open and closed positions <!-- F-FNO-002 -->
**What it does:** The **Open (n)** and **Closed (n)** tabs split positions into a **Futures Ledger** (Contract, Side, Expiry with a days-left badge, Net Qty, Lot, Avg Entry, LTP or "awaiting LTP", Notional, Realized, Unrealized, Status) and an **Options Chain** (Underlying, Type CE/PE, Strike, Payoff glyph, Expiry, Net Qty, Lot, Premium, LTP, Outlay, Realized, Unrealized, Status), each with Notional/Premium Outlay, Realized, Unrealized and Net P&L totals. Clicking a contract row lists its trades. Below them a **Trade Tape** shows your latest 50 F&O trades.

**Why it exists:** Futures and options need contract-level views (strike, expiry, lots), not the average-cost view used for stocks. Inferred from code comments.

**Where to find it:** **Asset Classes → F & O** → **Open** / **Closed** tabs (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; own positions only.

**Steps**
1. Click **Open (n)** (default) or **Closed (n)**.
2. Click a contract row to expand its trades (Date, Side, Qty, Price, Net, Broker); click again to collapse.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open (n)** / **Closed (n)** | Tabs | Switch position lists | — |
| Contract row | Click | Expand/collapse its trades | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No open F&O positions" / "Sync your broker or import contract notes to populate positions." | No open position | Sync a broker (F-FNO-008) or import contract notes (D-ASSET-012) |
| "No closed positions" | Nothing closed yet | — |
| "awaiting LTP" | No live or end-of-day price matched the contract | Wait for **Sync prices** or the 16:45 bhavcopy job |
| "No transactions on file for this contract." | No trade matched by underlying, expiry, strike and type | Check the contract was imported |

**Limitations:** Open = status OPEN or "EXPIRY ?" (pending expiry approval); Closed = CLOSED, EXPIRED_WORTHLESS or EXERCISED; statuses are shown as these raw words. The trade tape under both tabs shows all trades, not only those of the listed positions.

**How it works:** Positions come from `GET /api/fo/positions?portfolioId=` (refetched every 5 s while visible), trades from `GET /api/fo/trades?portfolioId=`. A contract's trades are matched by the leading letters of the trade's instrument name (underlying), expiry, and for options strike and Call/Put. Positions are rebuilt from F&O transactions by the server (not the stock holding engine); unrealized P&L = Σ over open lots (mark − entry) × signed quantity.

**Related features:** F-FNO-003, F-FNO-006, F-FNO-007.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:214`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:297`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:653`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:688`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:698`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1023`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1218`, `packages/api/src/services/fo/derivativePosition.service.ts:233`

### F&O trades tab <!-- F-FNO-003 -->
**What it does:** The **Trades** tab shows the full **Trade Tape**: every F&O trade in the portfolio, newest first, with Date, Side (BUY/SELL), Instrument, Strike, Expiry, Qty, Price, Net and Broker.

**Why it exists:** An audit trail of every derivative trade. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** → **Trades** (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Trades**. The tape loads (scrollable, sticky header).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Trades** | Tab | Shows the tape | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No F&O trades yet" / "Sync your broker or import a contract note to see trades here." | No F&O transactions | Sync or import |

**Limitations:** Only the newest 500 F&O trades are returned. No filtering, search or edit/delete of F&O trades on this page.

**How it works:** `GET /api/fo/trades?portfolioId=` returns your FUTURES/OPTIONS transactions for that portfolio, newest first, at most 500.

**Related features:** F-FNO-002, D-ASSET-012.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:442`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1430`, `packages/api/src/controllers/fo.controller.ts:45`, `packages/api/src/controllers/fo.controller.ts:57`

### F&O Tax / P&L statement <!-- F-FNO-004 -->
**What it does:** The **Tax / P&L** tab shows one card per financial year ("FY <year>": total P&L, "Turnover: … · Trades: N", note "Non-speculative §43(5) · ITR-3") and a table of closed contracts: Underlying, Type, Strike, Expiry, Side (INTRADAY or POSITIONAL), FY, Realized P&L, Turnover, Trades.

**Why it exists:** F&O profit is taxed as business income under section 43(5), not capital gains, and needs ICAI turnover for tax-audit checks. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** → **Tax / P&L** (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. (The separate Schedule 43 report needs Pro/Advisor — D-ASSET-010.)

**Steps**
1. Click **Tax / P&L**. The statement loads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Tax / P&L** | Tab | Loads the statement | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realized P&L yet" / "P&L is computed once you close positions or hold past expiry." | No closed trades | — |

**Limitations:** Not a filing document; use the reports area for Schedule 43.

**How it works:** `GET /api/fo/pnl?portfolioId=` replays each contract's trades first-in-first-out into close events. Turnover follows the current ICAI note: futures = Σ |realized per trade|; options = Σ |realized P&L| only. Intraday equity would be speculative; F&O is non-speculative.

**Related features:** D-ASSET-010.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:465`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1508`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1545`, `packages/api/src/services/fo/foPnl.service.ts:1`, `packages/api/src/controllers/fo.controller.ts:62`

### Expiry-day close approvals <!-- F-FNO-005 -->
**What it does:** On expiry day a server job turns each open contract expiring that day into an "Expiry close" request (status shown as "EXPIRY ?") and raises an alert "<underlying> <type> expires today". The **Expiry** tab lists pending requests ("Expiry close <date>", "<n> contracts · settlement <price | pending>") with **Reject** and **Approve**. Approving books a closing trade at the settlement price; an option settling at 0 is marked EXPIRED_WORTHLESS.

**Why it exists:** Positions held to expiry never get a closing trade from the broker; this books one so P&L is complete. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** → **Expiry** (route `/fo`); alert in the bell (D-ASSET-006).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, for their own portfolios.

**Steps**
1. On expiry day after 17:30 IST, open **F & O → Expiry**.
2. Check the settlement price, then click **Approve** ("Approved") or **Reject** ("Rejected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Expiry** | Tab | Lists pending requests | — |
| **Approve** | Button | Books the closing trade at settlement | — |
| **Reject** | Button | Marks the request rejected | — |

**Fields and rules:** None.

**Settings and toggles here:** S-FNO-001 **Auto-approve expiry close** — on: the job approves automatically when a settlement price exists; off (default): requests wait for you. It has no control in the app. S-FNO-002 **Default equity tax treatment** is stored by the same endpoint but not read anywhere.

**Results:** Approve: a SELL (long) or BUY (short) transaction at settlement, the position rebuilt and closed. Reject: request marked REJECTED; the position keeps status "EXPIRY ?".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No settlement price for this contract yet — add it before closing the position at expiry." | Bhavcopy price for the contract not stored | Wait for the 16:45 bhavcopy; there is no field to type it |
| "No pending expiry approvals" / "Expiry close requests appear here on expiry day after settlement is published." | Nothing pending | — |
| "Approve failed" / "Reject failed" | Server error or not your portfolio | Reload |

**Limitations:** A rejected request leaves the position as "EXPIRY ?" under **Open** indefinitely; the job only scans OPEN positions expiring that day, so it is never re-offered (DOCUMENTATION_GAPS.md). The list shows up to 100 requests across all your portfolios.

**How it works:** `jobs/foExpiryClose.job.ts` runs Mon–Fri 17:30 IST as a system task (unless `ENABLE_FO_EXPIRY_CRON=false`), finds OPEN positions with expiry today, reads the stored contract settlement price, creates an ExpiryCloseJob (PENDING_REVIEW), sets the position to PENDING_EXPIRY_APPROVAL, creates an `FO_EXPIRY_TODAY` alert, and auto-approves only when the portfolio setting is on and a price exists. `POST /api/fo/expiry-jobs/:id/approve|reject` check the portfolio is yours.

**Related features:** F-FNO-001, D-ASSET-006, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:494`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:521`, `packages/api/src/jobs/foExpiryClose.job.ts:30`, `packages/api/src/services/fo/foExpiry.service.ts:25`, `packages/api/src/services/fo/foExpiry.service.ts:65`, `packages/api/src/services/fo/foExpiry.service.ts:101`, `packages/api/src/controllers/fo.controller.ts:241`, `packages/api/src/controllers/fo.controller.ts:268`, `packages/api/prisma/schema.prisma:2863`

### Live F&O prices <!-- F-FNO-006 -->
**What it does:** While the page is open and visible, it asks the server every 5 seconds to re-mark open positions from NSE live derivative quotes. A chip shows "waiting for first poll", "fetching", or "Live · <matched>/<total> · <n>s ago" (green all matched, amber some, red none). **Sync prices** triggers a refresh immediately. If nothing matches, a one-time message explains: "Live feed: 0/<total> matched. NSE returned no live data — check API logs (host may be IP-blocked, or markets are closed)." or "…AssetKey shape mismatch — open API logs to see missed keys."

**Why it exists:** Unrealized P&L needs a current mark during market hours. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** header (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Keep the page open; marks update automatically.
2. Click **Sync prices** (tooltip "Pull live MTM from NSE quote-derivative") to refresh now.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Live status chip | Indicator | Shows last poll result | — |
| **Sync prices** | Button | Refreshes marks now | No portfolio, or a refresh is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Open positions' LTP and unrealized P&L update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Live refresh failed" | Server error | Retry |
| Red chip "Live · 0/N" | NSE blocked or market closed | Rely on the end-of-day bhavcopy |

**Limitations:** Polling pauses when the browser tab is hidden. Outside these page polls, a server job also marks positions every minute 09:00–15:59 IST Mon–Fri and from the bhavcopy at 16:45 (D-ASSET-007).

**How it works:** `POST /api/fo/refresh-live?portfolioId=` loads your OPEN positions, fetches NSE quotes once per underlying (server caches each underlying 5 s), and updates mtmPrice/unrealized; returns `{ updated, total, missedKeys, sampleHits }`.

**Related features:** F-FNO-002, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:164`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:193`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:206`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1626`, `packages/api/src/controllers/fo.controller.ts:185`, `packages/api/src/services/fo/derivativePosition.service.ts:352`, `packages/api/src/jobs/priceJobs.ts:372`

### Recompute positions <!-- F-FNO-007 -->
**What it does:** The circular-arrow button (tooltip "Recompute derivative positions"; text "Recompute" on small screens) rebuilds every F&O position in the portfolio from its transactions and shows "Positions recomputed".

**Why it exists:** Repairs positions after imports or edits. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** header (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, for portfolios they own.

**Steps**
1. Click the recompute button. It spins; then "Positions recomputed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Recompute (icon) | Button | Rebuild positions | No portfolio, or running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** All derivative positions for the portfolio are rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Recompute failed" / "Forbidden" | Not your portfolio or server error | Check the portfolio |

**Limitations:** None known.

**How it works:** `POST /api/fo/recompute` with `{ portfolioId }`; the server checks ownership and replays every F&O asset.

**Related features:** F-FNO-002.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:244`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:358`, `packages/api/src/controllers/fo.controller.ts:195`

### Connect, log in to and disconnect a broker <!-- F-FNO-008 -->
**What it does:** The header shows a chip for each supported broker — **Kite (Zerodha)**, **Upstox**, **Angel One** — with **connect** (not set up), **login** (set up, no live session) or a tick and **×** (connected; tooltip "Forget credentials"). **connect** opens the **Connect broker** dialog where you paste API credentials once; **login** opens the broker's login in a popup (Angel logs in without a popup).

**Why it exists:** Lets the app pull F&O trades from your broker account. Dialog text: "Paste API credentials once. After this, sync runs without re-entering anything (Kite needs a daily 2-click login)."

**Where to find it:** **Asset Classes → F & O** header (route `/fo`). Broker sessions can also be refreshed from **Tools → Connectors** (D-ASSET-009).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; credentials belong to your own account.

**Steps**
1. Click **connect** on a broker chip. The **Connect broker** dialog opens.
2. Choose **Broker**, read the help line, and fill the fields for that broker.
3. Click **Save & continue**. Kite and Upstox then open a login popup; Angel logs in directly. "<Broker> configured" appears, then "<Broker> login complete".
4. Later, click **login** on the chip when the session has expired.
5. To remove, click **×**, confirm "Disconnect <Broker>?". "Disconnected" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **connect** | Link | Opens the dialog | Shown only when not set up |
| **login** | Link | Starts broker login | Shown when set up but no live session |
| **×** | Link | Deletes stored credentials after a browser confirm | Shown when connected |
| **Connect broker** | Button | Opens the dialog for Kite | Shown only if the status list is empty |
| **Broker** | Select | Kite (Zerodha) / Upstox / Angel One; switching clears the form | — |
| **Save & continue** | Button | Saves credentials, then logs in | Until required fields are filled, or while saving |
| **Cancel** | Button | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| API key | Text | Yes | — | empty | Button stays disabled |
| API secret (Kite) / Client secret (Upstox) | Password | Kite, Upstox | — | empty | Button stays disabled |
| Redirect URI | Text | Upstox | "Register this exact URL on the Upstox dashboard before saving." | Filled with the server's callback URL | "Upstox redirectUri required" |
| Client code | Text | Angel | — | empty | Button stays disabled |
| Password / PIN | Password | Angel | — | empty | Button stays disabled |
| TOTP secret (base32) | Password | Angel | at least 8 characters after removing spaces | empty | Button stays disabled |

**Settings and toggles here:** None.

**Results:** Credentials are stored encrypted per user and broker; a successful login stores an access token. Disconnect deletes the stored credential.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Popup blocked — allow popups and retry." | Browser blocked the login window | Allow popups for the site |
| "Could not start login" / "Login failed" | Broker or setup problem | Check the keys and redirect URL |
| "Save failed" | Server rejected the credentials | Re-enter |
| "Disconnect failed" | Server error | Retry |

**Limitations:** Kite needs a fresh login every day. The popup result is accepted from any window without an origin check (DOCUMENTATION_GAPS.md).

**How it works:** `POST /api/fo/brokers/setup` encrypts API key, secret (Angel: the password) and TOTP seed and upserts BrokerCredential; Angel logs in immediately (`needsLogin: false`). `POST /api/fo/brokers/:id/oauth/start` returns a login URL; the broker redirects to `/api/fo/brokers/:id/callback` (public, authenticated by a random state token), whose page posts `broker_oauth_result` to the opener and closes. Status (`GET /api/fo/brokers/status`, refetched every 60 s) reports configured, connected (token present and not expired), and expiry. `DELETE /api/fo/brokers/:id` deletes the credential.

**Related features:** F-FNO-009, D-ASSET-009.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:46`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:329`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1696`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1761`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1888`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:44`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:324`, `packages/api/src/controllers/brokerOauth.controller.ts:120`, `packages/api/src/routes/fo.routes.ts:36`

### Sync broker trades <!-- F-FNO-009 -->
**What it does:** **Sync Kite** pulls today's F&O trades from your Zerodha account into the current portfolio and shows "Synced — N new trades". If Kite is not set up, it says "Connect Kite (Zerodha) first." and opens the dialog, resuming the sync after saving; if the session expired, it says "Login to Kite (Zerodha)." and opens the login popup, then syncs.

**Why it exists:** Saves typing trades by hand. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** → **Sync Kite** (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a Zerodha API app.

**Steps**
1. Click **Sync Kite**. A spinner shows.
2. Follow any connect/login prompt.
3. "Synced — N new trades" appears; positions and trades refresh.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sync Kite** | Button | Syncs Zerodha | No portfolio, or a sync is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** New trades become F&O transactions (each with a stable source hash, so re-syncing the same day adds nothing twice); touched positions are rebuilt; margin is stored when the broker returns it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Kite (Zerodha) first." | No active credential | Fill the dialog |
| "Login to Kite (Zerodha)." | No access token | Complete the popup login |
| "Sync zerodha failed" (or server message) | Broker error | Retry later |

**Limitations:** N counts every trade the broker returned for today, including ones already stored (re-syncing shows the same N but adds nothing). Only today's trades are fetched; earlier days must be imported from contract notes. The page has a sync button only for Zerodha: connected Upstox or Angel One accounts cannot be synced from anywhere in the app (DOCUMENTATION_GAPS.md). There is no scheduled automatic sync.

**How it works:** `POST /api/fo/sync-broker` `{ brokerId, portfolioId }` → checks ownership → the broker connector's `syncDay` (Kite `/trades`, NFO/BFO only) → each trade ingested as a transaction → positions recomputed.

**Related features:** F-FNO-008, F-FNO-002.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:253`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343`, `packages/api/src/controllers/fo.controller.ts:204`, `packages/api/src/services/fo/foBrokerSync.service.ts:31`, `packages/api/src/services/fo/foBrokerSync.service.ts:97`, `packages/api/src/ingestion/fno/broker-connector/types.ts:16`

### What this area doesn't do
- No manual F&O trade entry form on this page (use imports or the Transactions page).
- No portfolio selector; no option-chain or margin screen (the endpoints exist but nothing calls them).
- No automatic broker sync; no Upstox/Angel sync button.
- No way to type a settlement price for expiry close.
