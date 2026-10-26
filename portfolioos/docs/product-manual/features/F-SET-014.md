---
id: F-SET-014
title: "Loan rates admin"
module: "Settings"
status: Live
roles: "R-ADMIN"
settings: [S-SET-009]
related: [F-AUTH-008, F-SET-003, F-SET-015]
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Loan rates admin

`F-SET-014` · Live · Roles: [R-ADMIN](../roles.md#r-admin)

**What it does:** Lets an administrator review and correct the lender interest rates shown on the EMI calculator's Live rates tab: approve or reject suspicious readings, set or clear a manual rate, and re-read bank pages.

**Why it exists:** The page description: "Daily lender rates behind the EMI calculator's Live rates tab. A rate you set here wins over the bank page until you clear it."

**Where to find it:** **Tools → Settings → Loan rates → Open loan rates** (card shown only to administrators), route `/settings/loan-rates`.

**Who can use it:** [R-ADMIN](../roles.md#r-admin) with two-factor sign-in on and used for this session. Others see "Admins only."

**Steps**
1. Review **Needs review (N)**: each suspicious reading shows lender, type, rate and when it was read. Click **Approve**, or **Reject** then confirm "Reject this reading?" ("It will not be shown to users.").
2. Filter cards with **Lender**.
3. On a lender card, click **Run now** (automatic sources only) to read the bank page again, or **Run all now** at the top ("Started - refresh in a minute").
4. Click **Set rate**, fill **Basis**, **Tenor** (MCLR only), **From (% p.a.)**, **To (% p.a., optional)**, **With effect from (optional)**, **Note (where this rate comes from)**, then **Save rate**.
5. **Clear override** removes your rate after "Clear this override?" ("Users will see the bank page figure again.").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Run all now** | Button | Re-reads every source | Disabled while running |
| **Approve** / **Reject** | Buttons | Review a suspect reading | Disabled while another review runs |
| **Lender** | Select | Filter (All or a lender) | — |
| Mode badge, **Stale** badge | Badges | Source mode; stale data | Stale only when stale |
| **Run now** | Button | Re-read one source | Only for AUTO sources |
| **Set rate** / **Save rate** / **Cancel** | Buttons | Manual override | — |
| **Clear override** | Button | Remove override | Only where an override exists |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Basis | Select | Yes | One of the rate bases | Current basis, else MCLR for MCLR sources / Other | — |
| Tenor | Select | MCLR only | MCLR tenors | 1Y | — |
| From (% p.a.) | Decimal | Yes | 1–2 digits, up to 3 decimals | Empty | "Use a rate like 8.50" |
| To (% p.a., optional) | Decimal | No | Same | Empty | "Use a rate like 8.50" |
| With effect from | Date | No | YYYY-MM-DD | Empty | — |
| Note | Text | Yes | 3–500 characters | Empty | Browser required/min-length check; server "Validation failed" |

**Settings and toggles here:** [S-SET-009](../settings/settings.md#s-set-009) **Rate override** — set: your rate is shown to users; cleared: the bank page rate is shown.

**Results:** Users of the EMI calculator see the approved or overridden rates ([D-SET-003](../dependencies.md#d-set-003)). Every write is audited.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use admin tools." | Admin without two-factor | Turn it on ([F-SET-003](F-SET-003.md)) |
| "Sign out and sign in again with your authenticator code to use admin tools." | Session not signed in with a code | Sign out and in again |
| "Too many runs - please wait a minute" | More than 3 runs a minute | Wait |
| "That didn't work" / "Couldn't save the rate" / "Couldn't load loan rates" | Other failures | Retry |

**Limitations:** The Settings card is shown by checking your role in the browser; the server is what enforces access.

**How it works:** `/api/admin/loan-rates` routes require sign-in, the ADMIN role, then a two-factor session. Run calls are limited to 3 per minute per admin. Reads and writes go to the loan-rate tables owned by the loan module (B04).

**Related features:** [F-SET-003](F-SET-003.md), [D-SET-003](../dependencies.md#d-set-003).

**Sources:** `apps/web/src/pages/settings/SettingsPage.tsx:176`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:45`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:83`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:97`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:154`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:318`, `packages/api/src/routes/adminLoanRates.routes.ts:17`, `packages/api/src/controllers/loanRates.controller.ts:19`, `packages/api/src/middleware/rateLimit.ts:231`, `packages/api/src/lib/professionalMfa.ts:29`

**What this area doesn't do**
- You can't change your email, password or "I am" role here.
- There is no setting for the security notice emails ([F-AUTH-008](F-AUTH-008.md)); they always send.
- There is no SMTP/app-password form (the API exists but no page uses it, [F-SET-015](F-SET-015.md)).
- There is no data export button on this page.
- There is no list of signed-in devices or sessions.
