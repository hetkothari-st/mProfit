[Index](../INDEX.md)

# PPF & EPF

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **PPF & EPF** page (sidebar **Asset Classes → PPF & EPF**, route `/provident-fund`, page title **Provident Fund**) tracks Public Provident Fund and Employees' Provident Fund money in two ways. **Manual entries** — contributions, interest credits, withdrawals and opening balances — are ordinary transactions that build the PPF and EPF holdings on the page. **Auto-fetch accounts** link an EPFO UAN or a PPF account at one of seven banks so the passbook can be pulled from the portal (server-side, with you typing the captcha and OTP), uploaded as a PDF, or sent by the EveryPaisa browser extension. The old addresses `/ppf` and `/epf` open this page. Nothing here is plan-gated.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PF-001](../features/F-PF-001.md) | Provident Fund page and holdings | Live | Shows your PPF and EPF holdings across all portfolios with a summary strip (Invested, Current value, Unrealised P&L), the holdings, a … |
| [F-PF-002](../features/F-PF-002.md) | Add or edit an EPF entry | Live | The Add EPF Entry dialog records one EPF entry: employer, optional UAN, entry type (Contribution (monthly), Annual interest credit, … |
| [F-PF-003](../features/F-PF-003.md) | Add or edit a PPF entry | Live | The Add PPF Entry dialog records one PPF entry: bank / post office, optional PPF account number, entry type (Annual / partial deposit, … |
| [F-PF-004](../features/F-PF-004.md) | Link a PF account for auto-fetch | Live | Registers an EPF UAN (institution EPFO) or a PPF account at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank or Bank … |
| [F-PF-005](../features/F-PF-005.md) | Auto-fetch accounts and refresh nudges | Live | Lists linked accounts (holder name, last 4 digits, type, institution, balance when known, last refresh date) with Passbook and Refresh … |
| [F-PF-006](../features/F-PF-006.md) | Refresh from the EPFO portal | Partial | Refresh Provident Fund asks for the UAN and Password, starts a server-side fetch of the passbook, and relays the portal's captcha image and … |
| [F-PF-007](../features/F-PF-007.md) | Upload a passbook PDF | Partial | Upload Passbook PDF imports an EPFO passbook PDF without the live portal. |
| [F-PF-008](../features/F-PF-008.md) | Reset the EPFO password | Partial | Reset your EPFO password collects the UAN, the mobile number registered with EPFO and a new password that meets EPFO's rules, and is meant … |
| [F-PF-009](../features/F-PF-009.md) | Browser extension pairing | Live | The Browser Extension page pairs the EveryPaisa browser extension with your account using an 8-character code valid for 5 minutes, and … |
| [F-PF-010](../features/F-PF-010.md) | PF refresh-due alerts | Live | Once a day, creates a "Refresh EPF account" / "Refresh PPF account" alert for each active linked account not refreshed for 30 days or more … |

Settings for this module: [settings/ppf-epf.md](../settings/ppf-epf.md)

### What this area doesn't do

- You can't delete or unlink a linked auto-fetch account, or remove saved portal credentials.
- Fetched or uploaded passbooks don't update the PF holdings or the balance shown on the account.
- Interest rates are not looked up; the hints are fixed text.
- There is no PPF maturity or extension reminder.
