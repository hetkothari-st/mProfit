---
id: F-FNO-008
title: "Connect, log in to and disconnect a broker"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-FNO-009]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Connect, log in to and disconnect a broker

`F-FNO-008` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The header shows a chip for each supported broker — **Kite (Zerodha)**, **Upstox**, **Angel One** — with **connect** (not set up), **login** (set up, no live session) or a tick and **×** (connected; tooltip "Forget credentials"). **connect** opens the **Connect broker** dialog where you paste API credentials once; **login** opens the broker's login in a popup (Angel logs in without a popup).

**Why it exists:** Lets the app pull F&O trades from your broker account. Dialog text: "Paste API credentials once. After this, sync runs without re-entering anything (Kite needs a daily 2-click login)."

**Where to find it:** **Asset Classes → F & O** header (route `/fo`). Broker sessions can also be refreshed from **Tools → Connectors** ([D-ASSET-009](../dependencies.md#d-asset-009)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); credentials belong to your own account.

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

**Related features:** [F-FNO-009](F-FNO-009.md), [D-ASSET-009](../dependencies.md#d-asset-009).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:46`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:329`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1696`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1761`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1888`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:44`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:324`, `packages/api/src/controllers/brokerOauth.controller.ts:120`, `packages/api/src/routes/fo.routes.ts:36`
