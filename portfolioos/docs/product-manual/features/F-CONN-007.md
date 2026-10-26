---
id: F-CONN-007
title: "Broker connectors (Zerodha, Upstox, Angel One)"
module: "Connections"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-CONN-004]
related: [F-CONN-008]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Broker connectors (Zerodha, Upstox, Angel One)

`F-CONN-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Stores your own broker developer-app keys and logs in to the broker so trades and positions can be synced (the sync itself runs from the F&O page, [D-CONN-001](../dependencies.md#d-conn-001)).

**Why it exists:** The page description: "OAuth-linked brokers for automatic trade & holdings sync".

**Where to find it:** **Tools → Connectors** (route `/connectors`), one card per broker.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). While managing a family member's account the credentials are saved for that person.

**Steps**
1. On a card showing **Not configured**, click **Configure** and fill the fields ([S-CONN-004](../settings/connections.md#s-conn-004)). Click **Save**. Toast "<broker> configured".
2. Angel One logs in straight away. For Zerodha or Upstox, the card now shows **Needs login**: copy the **Server redirect URI** shown into the broker's developer console, then click **Connect**. A popup opens the broker's login; after login it shows "Login successful — closing window…" and the toast "Connected: <broker>" appears.
3. Connected cards show **Connected**, "Last sync: …" and "Token expires: …"; use **Refresh** to renew, **Reconfigure** to change keys, or **Disconnect** (confirm "Disconnect <broker>?").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Configure** | Button | Opens the setup form | Only when not configured |
| **Save** / **Cancel** | Buttons | Save keys / close | Save disabled until required fields are filled |
| **Connect** | Button | Broker login (popup) / Angel inline login | Configured but not connected |
| **Refresh** | Button | Renews the session | Only when connected |
| **Reconfigure** | Button | Re-opens the form | Configured |
| **Disconnect** | Button | Deletes the stored credential after a browser confirm | Configured |
| **Docs** | Link | Broker API docs (new tab) | — |
| Status badge | Badge | Loading…, Not configured, Connected, Needs login | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| API key | Text | Yes | Non-empty | Empty | "apiKey required" |
| API secret (Zerodha, Upstox) | Password | Yes | Non-empty | Empty | "Kite apiSecret required" / "Upstox apiSecret required" |
| Redirect URI (Upstox) | Text | Yes | A URL | Empty | "Upstox redirectUri required" |
| Client code, Login PIN/password (Angel) | Text, password | Yes | Non-empty | Empty | "Angel clientCode required" / "Angel password required" |
| TOTP seed (Base32) (Angel) | Password | Yes | At least 8 characters | Empty | "Angel TOTP seed required" |

**Settings and toggles here:** [S-CONN-004](../settings/connections.md#s-conn-004) **Broker setup fields**.

**Results:** A stored, encrypted credential and (after login) a broker session token with an expiry.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Popup blocked — allow popups for this site" | Browser blocked the login popup | Allow popups and click **Connect** again |
| "OAuth state expired — start login again" | Took longer than 10 minutes to log in | **Connect** again |
| "Kite session expired — login again" / "Upstox refresh failed — login again" | Broker session ended | **Connect** again |
| "Set up broker credentials first" | Refresh before setup | **Configure** |
| "OAuth failed" or the broker's message | Login failed in the popup | Check keys and the redirect URI |

**Limitations:** You need your own broker developer app. The Upstox field hint says to paste the value "from "Server redirect" below", but that box appears only after the first save. Disconnect uses a plain browser confirm.

**How it works:** POST `/api/fo/brokers/setup` encrypts and stores the keys (one credential per broker per user). POST `/oauth/start` returns the broker login URL with a random state valid 10 minutes; the broker redirects to `/api/fo/brokers/<id>/callback` (no session; the state authenticates it), which exchanges the code and posts the result to the opener window. GET `/brokers/status` reports configured/connected (a live, unexpired token).

**Related features:** [F-CONN-008](F-CONN-008.md), [D-CONN-001](../dependencies.md#d-conn-001), [W-CONN-002](../workflows/W-CONN-002.md).

**Sources:** `apps/web/src/pages/connectors/ConnectorsPage.tsx:41`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:63`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:168`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:211`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:505`, `packages/api/src/routes/fo.routes.ts:36`, `packages/api/src/controllers/brokerOauth.controller.ts:28`, `packages/api/src/controllers/brokerOauth.controller.ts:63`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:23`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:30`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:324`
