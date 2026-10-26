
## Gold & Silver

The **Gold & Silver** page tracks physical gold, Sovereign Gold Bonds (SGB), gold ETFs and physical silver, values them from a live metal-price feed, and keeps photos of jewellery and coins.

### Gold & Silver holdings with live valuation <!-- F-GOLD-001 -->
**What it does:** Shows the live rate bar (F-GOLD-002), cards **Invested**, **Current value** (with a pulsing "live" dot) and **Unrealised P&L** (with %), a holdings table (Name, Type — Physical Gold / Gold Bond / Gold ETF / Silver, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with photo thumbnails (up to 3, then "+N"; click to enlarge), edit and delete. Clicking a holding opens its detail page (F-GOLD-004).

**Why it exists:** Value metal holdings at today's rate. Page description: "Track physical gold, sovereign gold bonds, gold ETFs, and silver".

**Where to find it:** **Asset Classes → Gold & Silver** (route `/gold`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER on the managed person's data; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Gold & Silver**. Values refresh every 10 seconds.
2. Click a holding row for its detail page; click a photo thumbnail to enlarge it.
3. Delete a transaction with the bin → **Yes**; edit with the pencil (F-GOLD-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Holding row | Click | Opens `/gold/<id>` | — |
| Photo thumbnail ("View photo") | Button | Enlarges the photo | No photos |
| **Download** | Button | Report filtered to Physical Gold, Gold Bond, Gold ETF, Silver (D-ASSET-001) | — |
| **Add** / **Add first entry** | Button | Opens "Add Gold / Silver" | — |
| Edit (pencil) / Delete (bin) → **Yes** / **No** | Icons + buttons | Edit or delete a transaction | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this table (purity pickers: F-GOLD-002).

**Results:** Read only (delete rebuilds the holding).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No gold & silver yet" / "Add a transaction to start tracking this asset class." | No entries | **Add first entry** |
| Gold ETF value far too high | The name doesn't contain a recognised ticker, so the page falls back to the server value, which prices ETF units as grams of gold | Put the ticker (e.g. GOLDBEES) in the name (DOCUMENTATION_GAPS.md) |

**Limitations:** The page's live value and the server's stored value (used by the dashboard, reports and net worth) differ: the server values physical gold at the 24K price whatever the carat, ignores silver purity, and values Gold ETF units at the per-gram gold price (DOCUMENTATION_GAPS.md). Recognised gold ETF tickers: GOLDBEES, GOLDIETF, AXISGOLD, HDFCGOLD, KOTAKGOLD, SETFGOLD, LICMFGOLD, QGOLDHALF.

**How it works:** Live prices from `GET /api/assets/commodities/live` every 10 s. Per holding: Physical gold = 24K price per gram × (carat ÷ 24) × grams, carat read from a "22K"-style tag in the name (default 24); SGB = 24K price × units; Gold ETF = that ticker's NAV × units; Silver = silver price per gram × purity factor (999 → 1, 925 → 0.925, 800 → 0.8, read from a leading "999/925/800" in the name) × grams. If no live value can be made, the server value is used; P&L = value − cost.

**Related features:** F-GOLD-002, F-GOLD-003, F-GOLD-004, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/GoldPage.tsx:10`, `apps/web/src/pages/assetClasses/GoldPage.tsx:24`, `apps/web/src/pages/assetClasses/GoldPage.tsx:39`, `apps/web/src/pages/assetClasses/GoldPage.tsx:45`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:173`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:371`, `packages/api/src/priceFeeds/router.service.ts:65`, `packages/api/src/services/holdings/holdingsProjection.ts:478`

### Live gold and silver rate bar <!-- F-GOLD-002 -->
**What it does:** A sticky bar at the top shows the current **Gold** and **Silver** price per gram ("/g") at a purity you pick, and "Live · updated <just now | Ns ago | N min ago>" (or "Loading…", or "Live feed unavailable" in red).

**Why it exists:** Quick reference price, at the same purity factors used to value holdings ("the price the top bar shows for 22K is the price a 22K holding is valued at" — code comment).

**Where to find it:** **Asset Classes → Gold & Silver**, top (route `/gold`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Pick a purity in the selector next to **Gold** or **Silver**. The price updates and the choice is remembered on this device.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Gold purity (aria "Gold purity") | Select | 24K · 999, 22K · 916, 18K · 750, 14K · 585 | — |
| Silver purity (aria "Silver purity") | Select | 999 Fine, 925 Sterling, 800 | — |

**Fields and rules:** None.

**Settings and toggles here:** S-GOLD-001 **Gold purity** — the karat whose price is shown; default 24K; remembered on this device only. S-GOLD-002 **Silver purity** — default 999 Fine; this device only. Neither changes how holdings are valued.

**Results:** Display only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Live feed unavailable" | The live request failed and no earlier data | Wait; retried twice and polled every 10 s |
| Price "—" | Neither live nor stored price available | — |

**Limitations:** If storage is blocked (private mode), the choice applies but isn't remembered.

**How it works:** Price = base × factor to 2 decimals (gold factor = karat ÷ 24; silver 1 / 0.925 / 0.8). The server keeps a 15-second in-memory cache: gold from CoinGecko PAX Gold (INR ÷ 31.1035 g), then gold-api XAU × USD/INR, then Yahoo GC=F; silver from gold-api XAG × FX, Yahoo SI=F × FX, or SILVERBEES. If both live sources fail it returns the last stored daily price (updated 23:30 IST). A cold start waits at most 4 seconds.

**Related features:** F-GOLD-001.

**Sources:** `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:37`, `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:131`, `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:177`, `apps/web/src/lib/metalPurity.ts:31`, `packages/api/src/priceFeeds/commodity.service.ts:33`, `packages/api/src/priceFeeds/commodity.service.ts:303`, `packages/api/src/controllers/assets.controller.ts:153`, `packages/api/src/jobs/priceJobs.ts:347`

### Add, edit and delete a gold or silver entry <!-- F-GOLD-003 -->
**What it does:** The "Add Gold / Silver" / "Edit Gold / Silver Entry" dialog records a buy or sale (and for SGBs, interest and maturity), pre-fills today's price, and lets you attach up to 5 photos.

**Why it exists:** Metal holdings are tracked through entries; photos document jewellery and coins. Inferred from behavior and UI text "Click to add photos of your jewellery, coins, etc."

**Where to find it:** **Gold & Silver** → **Add**, a transaction pencil, or the detail page's edit (routes `/gold`, `/gold/:holdingId`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio** and **Type**: **Physical Gold** ("tracked in grams"), **Sovereign Gold Bond (SGB)** ("units"), **Gold ETF** ("units"), **Physical Silver** ("grams").
2. Pick **Transaction** (Buy/Sell; SGB also **Interest received (2.5%)** and **Maturity / Redemption**) and **Date**.
3. Physical metal: pick the **Carat** (24K/22K/18K/14K) or **Purity** (999/925/800 purity).
4. Type **Name / Description**; for SGB/ETF optionally **ISIN**.
5. Enter **Weight (grams)** or **Units** and the price. When adding, the price fills from the live rate (marked "live"); typing your own clears the mark.
6. SGB buy: optional **Interest Rate (% p.a.)** ("RBI pays 2.5% p.a. semi-annually") and **Maturity Date** ("8 years from issue date").
7. Optionally **Add photo**. Click **Add entry** ("Entry added") or **Save changes** ("Entry updated").
8. Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Type** cards | Radio | Asset type; switching resets transaction, purity and (when adding) price | — |
| Carat / Purity buttons | Toggle | Purity | Physical gold/silver only |
| "live" / "Fetching…" | Indicator | Price came from the live feed | Adding only |
| **Add photo** / camera tile | Button | Picks images | 5 photos reached |
| Photo × | Button | Removes a pending photo, or deletes a saved one | — |
| **Add entry** / **Save changes** ("Saving…") | Button | Saves, then uploads pending photos | While saving |
| **Cancel** / **Delete** → **Yes, delete** | Buttons | Close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Name / Description | Text | Yes | the carat/purity is added as a prefix for physical metal ("22K Gold bracelet") | — | "Enter a name or description" |
| ISIN | Text | No | SGB/ETF only; max 20 (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Weight (grams) / Units (SGB interest: Units held) | Number | Yes | > 0, step 0.001 | — | "Must be > 0" |
| Price per gram (₹) / Issue / Market Price (₹/unit) / NAV / Price (₹/unit) / Interest per unit (₹) | Number | Yes | ≥ 0 | live price when adding | — |
| Interest Rate (% p.a.) | Number | No | 0–100, SGB buy only | — | — |
| Maturity Date | Date | No | SGB buy only | — | — |
| Notes | Text area | No | max 500 (server); placeholder "Storage location, purchase source, etc." | — | — |
| Photos | Files | No | JPEG, PNG, WebP, HEIC/HEIF; max 5 per entry in the form | — | "Max 5 photos per entry" |

**Settings and toggles here:** None.

**Results:** The entry is saved, the holding rebuilt, then photos uploaded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |
| "Failed to delete photo" | Server refused | Retry |
| A photo silently missing after save | Upload failed; failures are ignored | Add it again from the detail page (DOCUMENTATION_GAPS.md) |

**Limitations:** Changing the carat on an existing entry renames it ("24K …" → "22K …"), which can split it into a separate holding. SGB interest entries do not change value. Files of other types are silently skipped.

**How it works:** `POST/PATCH /api/transactions` then `POST /api/transactions/:id/photos` per photo. The server checks the file's real type from its first bytes ("That file is not a JPEG, PNG, WebP or HEIC image."), stores it encrypted in the database, and limits size to `MAX_UPLOAD_SIZE_MB` (default 50 MB).

**Related features:** F-GOLD-001, F-GOLD-004.

**Sources:** `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:29`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:46`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:210`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:255`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:283`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:330`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:487`, `packages/api/src/controllers/transactionPhotos.controller.ts:78`, `packages/api/src/config/env.ts:58`

### Gold holding detail page <!-- F-GOLD-004 -->
**What it does:** A page per metal holding: photo carousel (previous/next, dots, "N / M", **Delete photo**), type and portfolio, purity badge and name, ISIN, **Current Valuation** (live), price per gram/unit with premium % over your average cost, **Unrealised** P&L, a two-point **Cost · Value** chart, **The Ledger** (Invested "across N lots", Weight/Units, Avg Cost, Live Price, Held For, XIRR or Activity), **First Acquired**, **Last Activity**, **Net Position** (bought − sold), and a **Transactions** timeline with edit/delete and photo thumbnails.

**Why it exists:** A record of one piece or lot with its photos and value. Inferred from behavior.

**Where to find it:** Click a holding on **Gold & Silver** (route `/gold/:holdingId`).

**Who can use it:** Same as F-GOLD-001.

**Steps**
1. Open a holding from the list.
2. With no photos, click **Add Photo** to attach one (to the newest transaction).
3. Hover a transaction to edit (pencil) or delete (bin → confirm bin, or **Cancel**).
4. **Gold & Silver** (back) returns to the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Gold & Silver** (back) | Button | Returns to `/gold` | — |
| **Add Photo** | Button | Uploads one image to the newest transaction | Hidden once any photo exists |
| **Previous photo** / **Next photo** / dots | Buttons | Browse photos | One photo or fewer |
| **Delete photo** | Button | Deletes the shown photo | — |
| **Edit transaction** / **Delete transaction** → **Confirm delete transaction** / **Cancel** | Icons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Photo and transaction changes are saved; deleting the last transaction returns you to the list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/gold` | Opened by a direct link or after refresh — the page only works when opened from the list | Open it from the list (DOCUMENTATION_GAPS.md) |
| "Add a transaction before uploading a photo" | No transaction found | — |
| Photo shows "Unavailable" | The image could not be loaded | Delete and re-add |

**Limitations:** Stats come from the list's snapshot and don't refresh after an edit until you reopen. Only the newest 200 transactions of that class are searched. Once one photo exists there is no further **Add Photo** button here; add more through the edit form (max 5).

**How it works:** Transactions are filtered by the holding's asset key. Live value as in F-GOLD-001 (refresh every 60 s). Held For = server holding period, else days since the first transaction ("Ny Nmo"). XIRR shown when the server returns a reliable one.

**Related features:** F-GOLD-001, F-GOLD-003.

**Sources:** `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:318`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:337`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:343`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:356`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:390`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:401`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:518`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:626`

### What this area doesn't do
- No making charges, GST or wastage in the cost; no hallmark/HUID field.
- No price history chart (only cost vs today).
- No platinum or other metals.

## Crypto

The **Cryptocurrency** page (sidebar **Crypto**, an optional class added with **Add asset class**) tracks coins with live INR and USD prices from CoinGecko.

### Crypto holdings with live prices <!-- F-CRYPTO-001 -->
**What it does:** Shows a live ticker strip (first 8 coins with a price: symbol, 24h change %, INR price), cards **Invested**, **Current value** (INR and USD, "live"), **Unrealised P&L** (with %), **Coins held** ("N with live prices"), a **Your Coins** grid (one card per holding: current value in INR and USD, Qty, P&L %, 24h change; sorted by value) and a **Transactions** table (Date, Coin, Type, Qty, Price, Amount) with edit and delete.

**Why it exists:** Track crypto at market prices. Page description: "Track Bitcoin, Ethereum, and other digital assets with live prices".

**Where to find it:** **Asset Classes → Crypto** (route `/crypto`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Crypto**. Prices refresh every 15 seconds while the tab is visible.
2. Click a coin card to open its detail page (F-CRYPTO-003).
3. Delete a transaction: bin → **Yes**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Coin card | Button | Opens `/crypto/<id>` | — |
| **Download** | Button | Report filtered to Crypto (D-ASSET-001) | — |
| **Add Crypto** / **Add your first coin** | Button | Opens "Add Cryptocurrency" | — |
| Edit (pencil) / Delete → **Yes** / **No** | Icons | Edit or delete a transaction | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No crypto holdings yet" / "Track Bitcoin, Ethereum, Solana and more with live INR + USD prices." | No entries | **Add your first coin** |
| A coin shows no live price | It was typed as free text, not picked from search | Edit and pick it from search |

**Limitations:** Live prices exist only for coins in the app's coin list (13 seeded: Bitcoin, Ethereum, Solana, Cardano, XRP, Dogecoin, Polkadot, Polygon, Chainlink, Avalanche, BNB, Tether, USD Coin, plus any coin added for analytics). Staking rewards don't add to the holding.

**How it works:** Live data from `GET /api/assets/crypto/live` (server caches 10 s; falls back to the last stored price). A holding is matched to a coin by the CoinGecko id stored in its ISIN field. Value = units × live INR price, else the server's stored value. The server also re-prices crypto holdings every 2 minutes.

**Related features:** F-CRYPTO-002, F-CRYPTO-003, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/CryptoPage.tsx:192`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:197`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:224`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:253`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:360`, `packages/api/src/priceFeeds/crypto.service.ts:9`, `packages/api/src/priceFeeds/crypto.service.ts:232`, `packages/api/src/jobs/priceJobs.ts:351`

### Add, edit and delete a crypto entry <!-- F-CRYPTO-002 -->
**What it does:** The "Add Cryptocurrency" / "Edit Crypto Entry" dialog records a Buy, Sell, Staking Reward, Transfer In or Transfer Out, with coin search, exchange, network, wallet and a one-click live price.

**Why it exists:** Crypto is tracked through entries. Inferred from behavior.

**Where to find it:** **Crypto** → **Add Crypto**, a transaction pencil, or the detail page pencil (routes `/crypto`, `/crypto/:holdingId`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add Crypto**. Pick **Portfolio** and **Transaction**.
2. Type in **Coin** ("Search Bitcoin, ETH, SOL…") and pick a result. "Linked to CoinGecko · live prices enabled" appears; typing free text shows "Free-text coin name. Live prices only available when matched from search."
3. Optionally choose **Exchange / Platform**, **Network / Chain**, **Wallet Address / Account ID**.
4. Enter **Date**, **Quantity**, **Price ₹** — or click the "Live price: ₹… Use this →" bar.
5. Click **Add entry** ("Crypto entry added") or **Save changes** ("Crypto entry updated"). Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Transaction buttons | Radio | Buy, Sell, Staking Reward, Transfer In, Transfer Out | — |
| Coin search + result list | Search | Links the coin | Results need at least 1 character |
| Clear (×) | Button | Clears the coin | Empty |
| "Live price … Use this →" | Button | Copies the live INR price into Price | Only for a linked coin with a price |
| **Add entry** / **Save changes** / **Cancel** / **Delete** → **Yes, delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Coin | Search text | Yes | — | — | "Select or enter a coin" |
| Exchange / Platform | Select | No | Coinbase, Binance, WazirX, CoinDCX, Kraken, KuCoin, Bybit, Upbit, Mudrex, Self-custody, Other | — select — | — |
| Network / Chain | Select | No | Bitcoin, Ethereum, Binance Smart Chain, Solana, Polygon, Avalanche, Cardano, Polkadot, Tron, Other | — select — | — |
| Wallet Address / Account ID | Text | No | — | — | — |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Quantity | Number | Yes | > 0, step 0.00000001 | — | "Must be > 0" |
| Price ₹ | Number | Yes | ≥ 0 | — | — |
| Notes | Text area | No | exchange, network, wallet and notes are stored together; max 500 characters (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Saved as a transaction; the coin's holding is rebuilt (Buy and Transfer In add units at the price entered; Sell and Transfer Out remove; Staking Reward is listed but adds nothing).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / "Validation failed" | Server refused (e.g. text over 500 characters) | Shorten notes/wallet |
| Duplicate message | Same entry already recorded | — |

**Limitations:** Transfer In counts as a purchase at the price you type. Search only finds coins in the app's coin list.

**How it works:** Saved with assetClass CRYPTOCURRENCY, isin = CoinGecko id, narration = "Exchange: … | Network: … | Wallet: … | <notes>". Server search: coin list rows whose id, symbol or name contain the text (max 12 shown).

**Related features:** F-CRYPTO-001, F-CRYPTO-003.

**Sources:** `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:29`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:47`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:90`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:167`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:295`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:352`, `apps/web/src/pages/assetClasses/cryptoUtils.ts:26`, `packages/api/src/priceFeeds/crypto.service.ts:327`

### Coin detail page <!-- F-CRYPTO-003 -->
**What it does:** A page per coin holding: symbol and portfolio badges, a **CoinGecko** link, **Current Value** (INR, USD, price per coin, 24h change), **Unrealised P&L**, stats **Invested**, **Quantity**, **Avg cost**, **XIRR** and **Held for** when available, a **Source** box (Exchange, Network, Wallet from the latest transaction), and **Transactions** with an edit pencil.

**Why it exists:** One coin's position and history. Inferred from behavior.

**Where to find it:** Click a coin card on **Crypto** (route `/crypto/:holdingId`).

**Who can use it:** Same as F-CRYPTO-001.

**Steps**
1. Open a coin card. Prices refresh every 15 s.
2. Click a transaction's pencil to edit it (delete from inside the form).
3. **Cryptocurrency** (back) returns.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cryptocurrency** (back) | Button | Returns to `/crypto` | — |
| **CoinGecko** | Link | Opens the coin on coingecko.com in a new tab | Free-text coins |
| Edit (pencil) | Icon | Opens the crypto form | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/crypto` | Opened by a direct link or refresh | Open it from the list (DOCUMENTATION_GAPS.md) |
| "No transactions found." | None matched | — |

**Limitations:** The transactions list includes this coin's entries from every portfolio, while the figures are for one portfolio's holding. Stats don't refresh after an edit until reopened.

**How it works:** Transactions (newest 200 crypto) filtered by CoinGecko id, else exact name.

**Related features:** F-CRYPTO-001, F-CRYPTO-002.

**Sources:** `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:44`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:58`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:70`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:135`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:228`

### What this area doesn't do
- No exchange or wallet API import; no tax (VDA 30%/1% TDS) computation here.
- No coin outside the app's coin list can be searched or live-priced.
