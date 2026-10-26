## Connections

Two pages that link EveryPaisa to outside services. **AI connectors** (Planning → AI connectors, the user menu → **AI connectors**, or the Settings card **Manage AI connectors**; route `/settings/ai-connectors`) lets your own ChatGPT or Claude read your data, read-only. **Connectors** (Tools → Connectors, route `/connectors`, page title "Broker Connectors") links brokers and the Account Aggregator.

### Connect ChatGPT or Claude (AI connectors) <!-- F-CONN-001 -->
**What it does:** Gives you the EveryPaisa connector address and step-by-step instructions to add it as a custom connector in ChatGPT or Claude. The actual approval happens on F-CONN-005 when the chatbot calls back.

**Why it exists:** The page text: "Let your own ChatGPT or Claude answer questions about your money using your EveryPaisa data. It can only read what you choose, never change anything, and you can revoke it any time."

**Where to find it:** **Planning → AI connectors** (route `/settings/ai-connectors`), header "AI connectors — Use your own ChatGPT or Claude with your EveryPaisa data."

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. On Free the connect card is behind a lock card with **View plans**. Not while managing a family member's account (R-MANAGER): "AI connectors work on your own account only. Switch back to your own account."

**Steps**
1. Click **Connect ChatGPT** or **Connect Claude**. The address is copied (toast "Connector address copied") and the chatbot's connector settings open in a new tab.
2. Follow the three steps shown, e.g. for Claude: "In Claude, open Settings > Connectors and choose Add custom connector." → "Paste the address we copied for you and name it EveryPaisa." → "Click Connect, sign in to EveryPaisa if asked, choose what to share and Approve."
3. The chatbot opens the approval page (F-CONN-005).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect ChatGPT** / **Connect Claude** | Buttons | Copy address, open the chatbot's settings, show steps | Behind the lock card below Plus |
| Connector address + copy button ("Copy connector address") | Text + icon button | Copies the address (toast "Copied") | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None on this card (see F-CONN-003, F-CONN-004).

**Results:** Nothing changes until you approve the chatbot.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not copy. Copy the address below by hand." | Clipboard blocked | Select and copy the address |
| "Not found" in the Connected list | AI connectors are switched off on this server (MCP_ENABLED/API_PUBLIC_URL) | Contact the operator |

**Limitations:** "Custom connectors need a paid ChatGPT or Claude plan." ChatGPT may need developer mode on.

**How it works:** The address is the API's public origin + `/mcp` (from the web build setting, else the page's own origin). ChatGPT settings open at chatgpt.com, Claude at claude.ai.

**Related features:** F-CONN-005, F-CONN-002, D-CONN-003, W-CONN-001.

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:21`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:53`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:82`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:89`, `apps/web/src/pages/settings/aiConnectorSetup.ts:6`, `apps/web/src/pages/settings/aiConnectorSetup.ts:23`, `packages/api/src/routes/connect.routes.ts:14`

### Connected chatbots: revoke and recent activity <!-- F-CONN-002 -->
**What it does:** Lists every chatbot connected to your account with when it was connected and last used and what it may read; lets you revoke it and see its last 20 lookups.

**Why it exists:** The code comment: list and revoke are "Ungated on purpose: a downgraded user must always be able to see and revoke."

**Where to find it:** **AI connectors → Connected**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Each card shows the chatbot (ChatGPT or Claude), "Connected <date> - last used <date>" or "Not used yet", and badges for shared areas ("Overview only" when none) and "+N family".
2. Click **Recent activity** to see lines like "<tool> - one person - N rows - <date>" ("failed" when a lookup failed; "No lookups yet.").
3. Click **Revoke**, then **Revoke access** in "Revoke <chatbot>?" ("It will lose access to your EveryPaisa data straight away. You can connect it again later."). Toast "Access revoked".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Edit sharing** | Button | F-CONN-003 | Hidden below Plus |
| **Revoke** → **Revoke access** | Buttons | Ends the connection | — |
| **Recent activity** | Link | Expands activity | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A revoked chatbot is refused on its very next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not load your connections." | Load failed (or connectors switched off) | Reload |
| "Could not revoke. Try again." / "Connection not found" | Failure or already revoked | Reload |
| "Could not load activity." | Load failed | Retry |

**Limitations:** Activity shows the tool name, number of people and rows only, never the data itself. Only the last 20 lookups.

**How it works:** GET `/api/connect/connections` lists unrevoked grants, newest first. DELETE `/api/connect/connections/<id>` marks the grant revoked (audit `mcp_revoked`). Activity reads `mcp_tool_called` audit rows for that grant (20 newest). The chatbot's token is checked on every call with no caching.

**Related features:** F-CONN-003, F-CONN-006.

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:94`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:137`, `apps/web/src/pages/settings/AiConnectionExtras.tsx:64`, `packages/api/src/routes/connect.routes.ts:30`, `packages/api/src/services/mcp/oauth.service.ts:323`, `packages/api/src/services/mcp/oauth.service.ts:337`, `packages/api/src/services/mcp/oauth.service.ts:394`

### Edit what a chatbot can read <!-- F-CONN-003 -->
**What it does:** Changes which areas, and which family members' data, an already-connected chatbot may read.

**Why it exists:** The code comment: "Widening what a chatbot reads is like approving it, so it needs the plan."

**Where to find it:** **AI connectors → (connection) → Edit sharing**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Edit sharing**. "Edit what <chatbot> can read" opens.
2. Tick or untick areas under "Choose what <chatbot> can read", and people under "Whose data".
3. Click **Save**. Toast "Sharing updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Area checkboxes (11) | Checkboxes | S-CONN-001 | — |
| Person checkboxes | Checkboxes | S-CONN-002 | Disabled for people who have not opted in |
| **Save** / **Cancel** | Buttons | Save / close | Save disabled while saving |

**Fields and rules:** Not applicable — checkboxes only. Server errors: "Unknown sharing area", "One of these people cannot be shared".

**Settings and toggles here:** S-CONN-001 **Choose what <chatbot> can read**; S-CONN-002 **Whose data**.

**Results:** Takes effect on the chatbot's next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "One of these people cannot be shared" | Adding someone who has not opted in | Ask them to turn on S-CONN-003 |
| "Could not save. Try again." / "This feature requires the PLUS plan or higher" | Failure / plan lapsed | Retry / upgrade |

**Limitations:** On Free you can no longer narrow sharing either; only revoke is available.

**How it works:** PATCH `/api/connect/connections/<id>` (requires the AI_CONNECTOR plan feature). People already on the connection who have since opted out or left are dropped quietly; adding someone new who cannot be shared is refused. Audit `mcp_sharing_changed`.

**Related features:** F-CONN-002, F-CONN-004, F-CONN-005.

**Sources:** `apps/web/src/pages/settings/AiConnectionExtras.tsx:19`, `apps/web/src/pages/connect/SharingToggles.tsx:15`, `packages/api/src/routes/connect.routes.ts:71`, `packages/api/src/services/mcp/oauth.service.ts:159`, `packages/api/src/services/mcp/oauth.service.ts:374`

### Allow family to include me in their AI connectors <!-- F-CONN-004 -->
**What it does:** Your consent for relatives who can already see your data in EveryPaisa to let their own chatbot read it too.

**Why it exists:** The code comment: "being included in a relative's connector is the relative's plan, not this user's" — so the consent is free on every plan.

**Where to find it:** **AI connectors**, bottom card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Tick or untick "Allow family to include me in their AI connectors" ("When on, family members who can already see your data in EveryPaisa may also let their own ChatGPT or Claude read it. Off by default.").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Opt-in checkbox | Checkbox | Saves immediately | Disabled while loading or saving |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-CONN-003 **Allow family to include me in their AI connectors** — on: you can be shared by relatives; off (default): you cannot.

**Results:** Turning it off removes you from relatives' chatbots on their next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save. Try again." | Failure | Retry |

**Limitations:** Managed profiles (relatives without their own login) don't need this; the person keeping their books can share them.

**How it works:** GET/PUT `/api/connect/family-opt-in` reads/writes `User.aiConnectorFamilyOptIn`; audit `mcp_sharing_changed`.

**Related features:** F-CONN-003, F-CONN-005.

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:27`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:126`, `packages/api/src/routes/connect.routes.ts:60`, `packages/api/src/services/mcp/oauth.service.ts:367`

### Approve a chatbot connection <!-- F-CONN-005 -->
**What it does:** The page your chatbot sends you to when you click Connect in it. You choose what it can read and click **Approve**, or **Cancel**; either way the browser returns to the chatbot.

**Why it exists:** The code comment: "The user picks what to share; Approve or Cancel sends the browser back to the chatbot with a code or access_denied."

**Where to find it:** Opened by the chatbot (route `/connect/authorize?req=…`), outside the normal app layout. Signed-out visitors sign in first and come back.

**Who can use it:** Approve: R-PLUS, R-FAMILY, R-PRO. Cancel: any signed-in person. Not R-MANAGER.

**Steps**
1. Read "<chatbot> wants read-only access to your EveryPaisa data" and "Verified address: <host>".
2. On Free: "Connecting your own ChatGPT or Claude needs the Plus plan." with **See plans** and **Cancel**.
3. Otherwise tick areas (S-CONN-001) and people (S-CONN-002), read the four promises (read-only; account, card, policy and ID numbers shown as last 4 characters; data goes to OpenAI/Anthropic under your account; revocable in Settings > AI connectors).
4. Click **Approve** or **Cancel**. The browser goes back to the chatbot.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Area and person checkboxes | Checkboxes | What to share | Hidden below Plus |
| **Approve** | Button | Grants access | Hidden below Plus; disabled while saving |
| **Cancel** | Button | Declines | Disabled while saving |
| **See plans** | Link button | Opens Pricing | Only below Plus |
| **Go to Settings > AI connectors** | Link | Shown with an expired/missing request | — |

**Fields and rules:** Not applicable — checkboxes only.

**Settings and toggles here:** S-CONN-001 (defaults: nine areas on, Will and succession and Documents off; a reconnect keeps the previous choice); S-CONN-002 (nobody by default; a reconnect keeps previous shareable people).

**Results:** Approve: a connection (grant) is created or updated; you get an in-app alert and an email "<chatbot> connected to your EveryPaisa" ("Not you? Revoke it in Settings > AI connectors."). Cancel: the chatbot is told access was denied.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This connection request has expired. Start again from your chatbot." | More than 10 minutes, or already answered | Reconnect from the chatbot |
| "This link is missing its connection request. Start again from your chatbot." | Opened without `?req=` | Reconnect from the chatbot |
| "This connection request was already answered." | Double click | Reconnect if needed |
| "Could not save your choice. Try again." | Other failure | Retry |

**Limitations:** The chatbot's name shown is derived from where the approval code is sent (chatgpt.com/chat.openai.com → ChatGPT, claude.ai/claude.com → Claude), never from what the client calls itself. Only callback addresses on the server's allow-list can register.

**How it works:** The chatbot calls `/oauth/authorize`, which stores a 10-minute request and redirects to this page. GET `/api/connect/requests/<reqId>` returns the client name, host, current sharing and shareable people. POST `/decision` validates input, claims the request (single use), and on approval creates/updates the grant and a 60-second one-time code bound to the chatbot's PKCE challenge, then redirects to the chatbot's callback. Audit `mcp_connected` or `mcp_sharing_changed`.

**Related features:** F-CONN-001, F-CONN-006, F-PLAN-001, W-CONN-001.

**Sources:** `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:24`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:34`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:71`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:92`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:105`, `packages/api/src/routes/connect.routes.ts:53`, `packages/api/src/services/mcp/oauth.service.ts:104`, `packages/api/src/services/mcp/oauth.service.ts:172`, `packages/api/src/services/mcp/notice.service.ts:12`, `packages/shared/src/aiConnector.ts:13`, `packages/shared/src/aiConnector.ts:39`

### Broker connectors (Zerodha, Upstox, Angel One) <!-- F-CONN-007 -->
**What it does:** Stores your own broker developer-app keys and logs in to the broker so trades and positions can be synced (the sync itself runs from the F&O page, D-CONN-001).

**Why it exists:** The page description: "OAuth-linked brokers for automatic trade & holdings sync".

**Where to find it:** **Tools → Connectors** (route `/connectors`), one card per broker.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. While managing a family member's account the credentials are saved for that person.

**Steps**
1. On a card showing **Not configured**, click **Configure** and fill the fields (S-CONN-004). Click **Save**. Toast "<broker> configured".
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

**Settings and toggles here:** S-CONN-004 **Broker setup fields**.

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

**Related features:** F-CONN-008, D-CONN-001, W-CONN-002.

**Sources:** `apps/web/src/pages/connectors/ConnectorsPage.tsx:41`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:63`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:168`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:211`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:505`, `packages/api/src/routes/fo.routes.ts:36`, `packages/api/src/controllers/brokerOauth.controller.ts:28`, `packages/api/src/controllers/brokerOauth.controller.ts:63`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:23`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:30`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:324`

### Legacy broker connections (deprecated) <!-- F-CONN-008 -->
**What it does:** Lists broker accounts linked through an older paste-token flow, lets you sync them once more or remove them.

**Why it exists:** The card text: "These were linked via the older paste-token flow. Reconnect via the OAuth cards above to keep them in sync."

**Where to find it:** **Tools → Connectors → Legacy connections** (badge "deprecated"), shown only if you have any.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Each row shows label/provider, status (CONNECTED/ERROR/…), user id, "Last synced …" or "Never synced", and any last error.
2. Click the refresh icon ("Sync now"); toast "Synced N trades".
3. Click the bin icon ("Remove"), confirm "Remove this legacy connection?"; toast "Removed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Sync now (icon) | Button | Syncs | Disabled while syncing |
| Remove (icon) | Button | Removes after confirm | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Synced trades are imported; removed connections disappear.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Server error message as a toast | Sync failed | Reconnect via the broker cards above |

**Limitations:** No way to add new legacy connections in the UI.

**How it works:** GET `/api/connectors`, POST `/api/connectors/<id>/sync`, DELETE `/api/connectors/<id>`.

**Related features:** F-CONN-007.

**Sources:** `apps/web/src/pages/connectors/ConnectorsPage.tsx:336`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:347`, `packages/api/src/routes/connectors.routes.ts:15`

### Account Aggregator (Finvu) consent <!-- F-CONN-009 -->
**What it does:** Starts an RBI Account Aggregator consent through Finvu for mutual funds and equities, lists your consents with status and dates, and lets you revoke an approved one. In demo mode it creates a test consent you can approve with one click.

**Why it exists:** The card text: "Pull mutual funds, deposits and equities directly from the user's linked banks via the RBI-regulated Account Aggregator framework."

**Where to find it:** **Tools → Connectors → Account Aggregator (Finvu)** (bottom of the page).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (server-enforced). The card itself has no lock for Free users.

**Steps**
1. Check the badge: **Demo mode**, **Configured** or **Token missing**.
2. Click **Connect via Finvu** (or **Re-initiate consent** when one is approved). A popup opens Finvu ("Consent flow opened in a popup. Approve in your bank app to continue."). In demo mode: "[Demo] Consent initiated — click Simulate approval to mark it approved."
3. Approve in Finvu. The list refreshes every 10 seconds; **Refresh** forces it.
4. Pending rows offer **Open Finvu** (or **Simulate approval** in demo). Approved rows offer **Revoke**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect via Finvu** / **Re-initiate consent** | Button | Starts a consent | Disabled when not configured or while starting |
| **Refresh** | Button | Reloads consents | Disabled while loading |
| **Simulate approval** | Button | Marks a demo consent approved | Demo mode, pending rows only |
| **Open Finvu** | Link | Re-opens the consent page | Not demo, pending rows with a redirect address |
| **Revoke** | Button | Revokes an approved consent | Approved rows only |

**Fields and rules:** Not applicable — the consent asks for MUTUAL_FUNDS and EQUITIES.

**Settings and toggles here:** None.

**Results:** A consent row (Initiated, Pending, Approved, Rejected, Expired, Revoked) with Initiated/Approved/Expires dates and FI types.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (toast) | Free plan | Upgrade |
| "Set FINFACTOR_API_TOKEN in the API env to enable consent flows." | Not configured | Contact the operator |
| "Popup blocked — allow popups for this site and retry" | Popup blocked | Allow popups |
| "Consent created — check Finvu for the redirect URL." | Finvu returned no redirect | Use **Open Finvu** later |

**Limitations:** The card says "Once approved, holdings sync automatically", but data notifications from Finvu are only logged; importing the data is a manual step elsewhere (D-CONN-002). For a Free user the consents list silently stays empty while its requests are refused. Consent approval status depends on Finvu's webhook (F-CONN-010).

**How it works:** GET `/api/integrations/finfactor/status` (ungated) returns configured/demo flags. Everything else requires the AA_FINVU_AUTOIMPORT (Plus) feature: POST `/consent/initiate`, GET `/consent`, POST `/consent/<handle>/revoke`, POST `/consent/<handle>/approve-demo` (demo mode only: "consent demo-approve is only available in demo mode"). Status changes from Finvu arrive on the consent webhook.

**Related features:** F-CONN-010, D-CONN-002, F-PLAN-001.

**Sources:** `apps/web/src/pages/connectors/FinvuConsentCard.tsx:59`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:65`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:138`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:173`, `packages/api/src/routes/finfactor.routes.ts:38`, `packages/api/src/routes/finfactor.routes.ts:42`, `packages/api/src/controllers/finfactor.controller.ts:211`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:110`

**What this area doesn't do**
- Chatbots can never add, change or delete anything — the connector is read-only.
- AI connectors does not include the in-app AI Assistant chat (D-CONN-003).
- Broker connectors do not import anything on this page; sync runs from the F&O page.
- There is no Account Aggregator support for bank-account statements on this card (consents ask for mutual funds and equities).
