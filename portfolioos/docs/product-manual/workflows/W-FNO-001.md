[Index](../INDEX.md)

# Connect Zerodha and sync today's F&O trades

`W-FNO-001` · Futures & Options

**Goal:** Bring F&O trades in from Kite.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with a Kite developer app.
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
| Earlier days' trades missing | Sync fetches today only | Import contract notes ([D-ASSET-012](../dependencies.md#d-asset-012)) |
