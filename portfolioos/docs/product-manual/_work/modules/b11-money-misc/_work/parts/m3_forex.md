## Forex

The **Forex** page (sidebar **Asset Classes → Forex**, route `/forex`) covers money held or moved in foreign currencies: live reference rates, foreign-currency cash balances, currency-pair trading positions with their speculative P&L, foreign shares, and outward remittances under the Liberalised Remittance Scheme (LRS) with tax collected at source (TCS). Forex is an optional asset class: it appears in the sidebar only after you add it with **Add asset class** (D-FX-001). Nothing here is plan-gated.

### Live FX rates <!-- F-FX-001 -->
**What it does:** The **Live FX rates** panel shows the latest stored rate for each INR pair (USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY → INR) and six cross pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF), each with its source badge — **RBI**, **FRANKFURTER**, **YAHOO** or **DERIVED**. **Refresh** fetches new rates from the sources now.

**Why it exists:** Page description: "Live RBI reference rates with Yahoo fallback."

**Where to find it:** **Asset Classes → Forex**, top of the page.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open **Forex**. Rates load; "Updating…" shows during each 30-second refresh.
2. Click **Refresh** to fetch from the sources. The toast "Refreshed N rates" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Runs a rate sync now | Disabled while running |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** New rates are stored for today and used everywhere (cash INR equivalents, LRS, foreign holdings).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No rates yet — hit refresh." | No rates stored yet | Click **Refresh** |
| "FX refresh failed" | All sources failed | Try later; the hourly job retries |

**Limitations:** INR rates show 4 decimals, cross rates 6. Rates fetched from exchangerate-api are labelled **FRANKFURTER**. Any signed-in user's **Refresh** runs the same app-wide sync.

**How it works:** `GET /api/forex/ticker` reads the latest stored rate per pair; the page re-reads every 30 seconds. `POST /api/forex/ticker/refresh` runs `syncFxRates`: RBI's reference page for USD/EUR/GBP/JPY, then exchangerate-api, then Frankfurter, then Yahoo for anything missing and the cross pairs, then derived rates. The same sync runs hourly (`0 * * * *`, IST) under `ENABLE_PRICE_CRONS`, and at startup if rates are older than 6 hours.

**Related features:** F-FX-002, F-FX-003, D-FX-002.

**Sources:** @@W/pages/forex/ForexRateTicker.tsx#refetchInterval: 30_000@@, @@W/pages/forex/ForexRateTicker.tsx#Refreshed ${res.updated} rates@@, @@W/pages/forex/ForexRateTicker.tsx#No rates yet — hit refresh.@@, @@A/priceFeeds/fx.service.ts#const PRIMARY_INR_PAIRS@@, @@A/priceFeeds/fx.service.ts#const CROSS_PAIRS@@, @@A/priceFeeds/fx.service.ts#export async function syncFxRates@@, @@A/priceFeeds/fx.service.ts#await upsertRate(code, 'INR', today, rate, 'FRANKFURTER');@@, @@A/controllers/forex.controller.ts#export async function refreshTicker@@, @@A/jobs/priceJobs.ts#cron.schedule('0 * * * *', runFxJob@@, @@A/jobs/startupSync.ts#await maybeRun('FX', 6 * HOUR_MS@@

### Foreign currency balances <!-- F-FX-002 -->
**What it does:** The **Cash** tab lists foreign-currency balances (for example Wise, a foreign bank or a forex card) with currency, account label and last 4 digits, bank, balance in that currency and its INR equivalent at the latest rate, plus a total in INR.

**Why it exists:** Empty-state text: "Track USD/EUR/GBP balances in Wise, foreign bank, or forex card accounts."

**Where to find it:** **Asset Classes → Forex → Cash** (default tab).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Add balance**. **Add forex balance** opens with currency USD and balance 0.
2. Fill **Currency**, **Balance**, optionally **Account label** (placeholder "Wise USD"), **Account number**, **Bank**, **Country**, **Notes**.
3. Click **Create**. The toast "Balance saved" appears.
4. To change it, click the pencil, edit and click **Save** (toast "Balance updated").
5. To delete, click the bin and confirm "Delete <currency> <balance>?" (toast "Deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add balance** | Button | Opens the dialog | — |
| Pencil / bin | Buttons | Edit / delete a row | — |
| **Cancel** / **Create** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Currency** | Select: USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY | Yes | 3 letters | USD | — |
| **Balance** | Text | Yes | Decimal, may be negative | 0 | "Decimal expected" |
| **Account label** | Text | No | Up to 120 | Empty | — |
| **Account number** | Password-style text | No | Up to 64; encrypted, last 4 shown | Empty | — |
| **Bank** | Text | No | Up to 160 | Empty | — |
| **Country** | Text | No | Up to 80 | Empty | — |
| **Notes** | Text | No | Up to 2000 | Empty | — |

**Settings and toggles here:** S-FX-001 **Currency**.

**Results:** The balance is stored; the INR column and total use the latest rate on each refresh (not stored).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" / "Update failed" / "Delete failed" (or the server message) | Server error | Try again |
| INR equivalent "—" | No stored rate for that currency | Click **Refresh** on the rates panel |

**Limitations:** Defect: editing a balance clears its saved account number unless you re-type it — the label says "(leave blank to keep existing)", but a blank box is sent as "clear" (see DOCUMENTATION_GAPS.md). The full account number can't be shown in the app. The total only adds currencies with a rate. Balances are not counted in holdings, the dashboard or net worth.

**How it works:** `GET/POST/PATCH/DELETE /api/forex/balances`. The account number is encrypted (AES-256-GCM) with only the last 4 digits stored readable; lists never return it. Sorted by currency, then label.

**Related features:** F-FX-001.

**Sources:** @@W/pages/forex/ForexCashTab.tsx#export function ForexCashTab@@, @@W/pages/forex/ForexCashTab.tsx#const schema = z.object({@@, @@W/pages/forex/ForexCashTab.tsx#function inrEquiv@@, @@W/pages/forex/ForexCashTab.tsx#(leave blank to keep existing)@@, @@W/pages/forex/ForexCashTab.tsx#accountNumber: v.accountNumber || null,##2@@, @@W/pages/forex/constants.ts#export const SUPPORTED_CCY@@, @@A/services/forex/forex.service.ts#export async function createForexBalance@@, @@A/services/forex/forex.service.ts#if (patch.accountNumber === null || patch.accountNumber === '')@@

### FX pair positions <!-- F-FX-003 -->
**What it does:** The **FX pairs** tab lists currency-pair positions (for example USDINR or EURUSD) recorded as transactions, with live value from the stored rates, the summary strip and the transactions table, and below them the realised P&L table (F-FX-004).

**Why it exists:** Tab description: "Currency pair positions (USDINR, EURUSD, …). Speculative business income — bypasses CG FIFO."

**Where to find it:** **Asset Classes → Forex → FX pairs**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **FX pairs**. Click **Add** to record a buy or sell in the shared transaction form (D-FX-003). The pair is identified by a code such as USDINR or EURUSD, stored in the transaction's ISIN field.
2. Edit or delete transactions from the table.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** | Button | Opens the transaction form for FOREX_PAIR | — |
| Edit / delete on rows | Buttons | As in other asset pages | — |

**Fields and rules:** As the shared transaction form (D-FX-003).

**Settings and toggles here:** None.

**Results:** Positions appear with live value.

**Errors and troubleshooting:** As the shared asset page.

**Limitations:** Live value on this tab is quantity × the base currency's INR rate for both 3-letter and 6-letter codes; a pair with no INR rate for its base shows no live value.

**How it works:** Shared asset page with asset class FOREX_PAIR; the server values a 6-letter pair at base→quote and converts to INR.

**Related features:** F-FX-004, D-FX-003.

**Sources:** @@W/pages/forex/ForexPairsTab.tsx#export function ForexPairsTab@@, @@W/pages/forex/ForexPairsTab.tsx#function computeLiveValue@@, @@A/priceFeeds/router.service.ts#case 'FOREX_PAIR': {@@

### Forex pair P&L by financial year <!-- F-FX-004 -->
**What it does:** The **Speculative business income (FOREX_PAIR P&L)** table shows, per portfolio, pair and financial year, buy and sell quantity, realised P&L and open position, with "Net realised across all pairs".

**Why it exists:** FX pair trades are speculative business income and skip the capital-gains engine (code comment).

**Where to find it:** **Asset Classes → Forex → FX pairs**, below the positions.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "No realised P&L yet. Record matching BUY + SELL transactions on a pair to see speculative business income aggregated by FY."

**Limitations:** Defect: buys and sells are grouped by the financial year of each trade, so a position bought in one year and sold in the next shows no realised P&L. Realised P&L uses average buy and sell prices over the matched quantity, not FIFO lots as the comment says.

**How it works:** `GET /api/forex/pairs/:portfolioId/pnl` per portfolio (refused with 403 for someone else's portfolio). Realised = (average sell − average buy) × min(buy qty, sell qty).

**Related features:** F-FX-003.

**Sources:** @@W/pages/forex/ForexPairsTab.tsx#function ForexPairPnlSection@@, @@A/services/forex/forex.service.ts#export async function computeForexPairPnL@@, @@A/services/forex/forex.service.ts#const key = `${portfolioId}|${pair}|${financialYearOf(t.tradeDate)}`;@@, @@A/services/forex/forex.service.ts#const realised = avgSell.minus(avgBuy).times(matchedQty);@@, @@A/controllers/forex.controller.ts#export async function pairPnl@@

### Foreign equities <!-- F-FX-005 -->
**What it does:** The **Foreign equities** tab lists US and international shares (for example AAPL, MSFT) recorded as transactions, valued with the Yahoo price feed and converted to INR.

**Why it exists:** Tab description: "US/international shares (AAPL, MSFT, …). Yahoo price feed + INR conversion at trade time."

**Where to find it:** **Asset Classes → Forex → Foreign equities**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Foreign equities**, then **Add** to record a trade in the shared transaction form.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** | Button | Opens the transaction form for FOREIGN_EQUITY | — |

**Fields and rules:** As the shared transaction form (D-FX-003).

**Settings and toggles here:** None.

**Results:** Holdings with value in INR.

**Errors and troubleshooting:** As the shared asset page.

**Limitations:** Current value uses the latest rate of the currency on the newest trade.

**How it works:** Shared asset page with FOREIGN_EQUITY; current value = quantity × Yahoo price × latest rate to INR.

**Related features:** D-FX-003.

**Sources:** @@W/pages/forex/ForeignStocksTab.tsx#export function ForeignStocksTab@@, @@A/services/holdings/holdingsProjection.ts#if (meta.assetClass === 'FOREIGN_EQUITY') {@@

### LRS utilisation <!-- F-FX-006 -->
**What it does:** The **LRS utilisation** card shows "FY <year> · $used of $250000.00 used", a bar (green, amber above 80%, red at 100%) and "N% of annual LRS limit (USD 250,000 per individual / FY)". Above 80% it warns: "Above 80% — verify before further remittances. TCS at 20% applies above ₹7L cumulative this FY."

**Why it exists:** Code comment: the LRS limit is USD 250,000 per individual per financial year.

**Where to find it:** **Asset Classes → Forex → LRS & TCS**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls:** **Record remittance** (F-FX-007).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** Usage converts the year's INR total to USD at today's USD/INR rate (₹83 if none is stored), not the rate on each remittance date, so the percentage moves with the rupee. The TCS figures are informational; the 20% above ₹7 lakh rule is fixed in code.

**How it works:** `GET /api/forex/lrs/utilisation` sums the INR equivalent of remittances dated in the current financial year; warning at 80%.

**Related features:** F-FX-007.

**Sources:** @@W/pages/forex/LrsTab.tsx#LRS utilisation@@, @@W/pages/forex/LrsTab.tsx#Above 80%@@, @@A/services/forex/forex.service.ts#const LRS_ANNUAL_LIMIT_USD@@, @@A/services/forex/forex.service.ts#const LRS_WARNING_THRESHOLD_PCT@@, @@A/services/forex/forex.service.ts#export async function getLrsUtilisation@@, @@A/services/forex/forex.service.ts#?? new Decimal(83)@@

### Record or delete an LRS remittance <!-- F-FX-007 -->
**What it does:** **Record LRS remittance** saves an outward remittance (date, purpose, currency, amount, optional FX rate, bank, reference, TCS deducted, notes); the **Remittances** table lists them (date, purpose, bank, foreign amount, INR equivalent, TCS) with delete. If the remittance would take the year over USD 250,000, the dialog shows **LRS limit warning** with **Adjust** and **Confirm anyway**.

**Why it exists:** Empty-state text: "Outward remittances under the Liberalised Remittance Scheme will appear here for ITR Schedule FA reporting."

**Where to find it:** **Asset Classes → Forex → LRS & TCS → Record remittance**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Record remittance**. The dialog opens with today's date, purpose **INVESTMENT** and currency **USD**.
2. Fill **Amount**, and also **FX rate (optional)** and **TCS deducted** (see Limitations); optionally **Bank**, **Reference**, **Notes**.
3. Click **Record**. The toast "Remittance recorded" appears.
4. If the limit warning appears, click **Confirm anyway** to save it regardless, or **Adjust** to edit.
5. To delete, click the bin and confirm "Delete remittance?" (toast "Deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Record remittance** | Button | Opens the dialog | — |
| **Record** | Button | Saves | Disabled while saving |
| **Adjust** / **Confirm anyway** | Buttons | Dismiss the warning / save past the limit | Shown with the warning |
| Bin | Button | Deletes after confirmation | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date** | Date | Yes | YYYY-MM-DD | Today | Zod default message |
| **Purpose** | Select: INVESTMENT, EDUCATION, TRAVEL, GIFT, MAINTENANCE, MEDICAL, OTHER | Yes | — | INVESTMENT | — |
| **Currency** | Select (11 currencies) | Yes | — | USD | — |
| **Amount** | Text | Yes | Decimal | Empty | Zod default message |
| **FX rate (optional)** | Text | In practice yes | Decimal; blank should mean the latest stored rate | Empty (placeholder "auto") | none shown |
| **Bank** | Text | No | Up to 160 | Empty | — |
| **Reference** | Text | No | Up to 200 | Empty | — |
| **TCS deducted** | Text | In practice yes | Decimal (placeholder "0") | Empty | none shown |
| **Notes** | Text | No | Up to 2000 | Empty | — |

**Settings and toggles here:** S-FX-002 **Purpose**; S-FX-003 **Currency (remittance)**.

**Results:** The remittance is stored with its INR equivalent (amount × rate) and counts toward the year's utilisation.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **Record** does nothing | **FX rate (optional)** or **TCS deducted** left empty: the form treats an empty box as invalid and shows no message (defect) | Type the rate and the TCS amount (0 if none) |
| "No FX rate available for <ccy>→INR" | No stored rate and none typed | Refresh rates or type the rate |
| "LRS limit exceeded: this remittance would push FY … usage to USD … (limit 250000). Resend with forceConfirmed=true to override." | Over the yearly limit | **Confirm anyway** or adjust |

**Limitations:** Defect: the form only submits when both optional boxes are filled. Remittances can't be edited. The utilisation uses today's USD rate (F-FX-006).

**How it works:** `POST /api/forex/lrs` (server: currency 3 letters, decimals, purpose list); with no FX rate the latest stored rate is used. The over-limit check projects this remittance in USD at today's USD/INR rate. `DELETE /api/forex/lrs/:id` also reverses any TCS-credit usage linked to it.

**Related features:** F-FX-006, F-FX-008.

**Sources:** @@W/pages/forex/LrsTab.tsx#const lrsSchema = z.object({@@, @@W/pages/forex/LrsTab.tsx#fxRate: z.string().regex@@, @@W/pages/forex/LrsTab.tsx#tcsDeducted: z.string().regex@@, @@W/pages/forex/LrsTab.tsx#Confirm anyway##2@@, @@W/pages/forex/LrsTab.tsx#Delete remittance?@@, @@A/services/forex/forex.service.ts#export async function createLrsRemittance@@, @@A/services/forex/forex.service.ts#LRS limit exceeded@@, @@A/services/forex/forex.service.ts#export async function deleteLrsRemittance@@, @@apps/web/node_modules/react-hook-form/dist/index.esm.mjs#set(_formValues, name, shouldSkipSetValueAs ? defaultValue : getFieldValue(field._f))@@

### TCS credits <!-- F-FX-008 -->
**What it does:** When TCS credits exist, the **TCS credits** table lists them (FY, collector, TAN, amount).

**Why it exists:** To keep the TCS collected on remittances for the tax return (inferred from the fields).

**Where to find it:** **Asset Classes → Forex → LRS & TCS**, below remittances.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** There is no screen to add, link or delete a TCS credit, so the table stays empty in normal use; the remittance form doesn't link to a credit.

**How it works:** `GET /api/forex/tcs`; create and delete exist only in the API (F-FX-009).

**Related features:** F-FX-007, F-FX-009.

**Sources:** @@W/pages/forex/LrsTab.tsx#TCS credits@@, @@A/services/forex/forex.service.ts#export async function listTcsCredits@@

### What this area doesn't do

- You can't edit a remittance or add a TCS credit from the app.
- Foreign cash balances are not counted in holdings, the dashboard or net worth (no other service reads them).
- There are no rate alerts or historical rate charts.
