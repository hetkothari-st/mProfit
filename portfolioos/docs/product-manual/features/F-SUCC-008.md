---
id: F-SUCC-008
title: "Nominee view of shared information"
module: "Succession"
status: Live
roles: "R-NOMINEE"
settings: [S-SUCC-007, S-SUCC-008, S-SUCC-011]
related: [F-SUCC-004, F-SUCC-006]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Nominee view of shared information

`F-SUCC-008` · Live · Roles: [R-NOMINEE](../roles.md#r-nominee)

**What it does:** After release, a nominee opens their link, receives a one-time code by email, and sees "<owner>'s financial information": the owner's letter, one section per allowed category (items with last 4 digits, nominee names, notes and — if allowed — amounts), "How to claim" checklists, shared documents to download, and **Download PDF**.

**Why it exists:** Release email text: "<owner> set up EveryPaisa Succession so that you would not be left in the dark about their finances."

**Where to find it:** Email link `/legacy/access/:token`.

**Who can use it:** [R-NOMINEE](../roles.md#r-nominee) (holds the access link and the emailed code). Read-only.

**Steps**
1. Open the link; "Shared financial information" appears. Click **Send code**.
2. Enter the 6-digit code ("We sent a code to <masked email>. It expires in 10 minutes.") and click **Open** (or **Resend**).
3. Read the sections; open **How to claim**; click **Download PDF** or a document's **Download**.
4. If the link has expired, click **Email me a fresh link**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Send code** / **Resend** | Buttons | Emails a code | Disabled while busy |
| **Open** | Button | Opens the view | Disabled until 6 digits |
| **Email me a fresh link** | Button | Mails a new link to the nominee's address | Shown after an error |
| **Download PDF** | Button | Downloads "legacy-information.pdf" | — |
| **Download** (per document) | Button | Downloads the document | — |
| **How to claim** | Expander | Shows the claim checklist | Hidden for categories without one |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Code | Digits | Yes | Exactly 6 digits; 10-minute expiry; 5 wrong tries lock 30 minutes | Empty | "Enter the 6-digit code" / "That code didn't match." / "That code has expired. Request a new one." / "Too many attempts. Try again in 30 minutes." |

**Settings and toggles here:** [S-SUCC-007](../settings/succession.md#s-succ-007), [S-SUCC-008](../settings/succession.md#s-succ-008), [S-SUCC-011](../settings/succession.md#s-succ-011) (decided by the owner).

**Results:** A 30-minute session kept in this tab only. Every view, PDF and document download is audit-logged to the owner's account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link is no longer valid." | Access ended or link expired (90 days) | **Email me a fresh link** — "If this link was sent to you, a fresh one is on its way to the same email address." |
| "Session expired. Open your link again." | 30-minute session ended | Open the link again |
| "We couldn't send the code. Try again shortly." | Email failed | Retry |

**Limitations:** "Total of listed assets" sums Investments, Bank accounts, Property, Vehicles and Provident fund & NPS only, and only when amounts are allowed. Investments list every holding in portfolios the owner created (including family-shared ones they created). Access link and code requests are limited to 15 per 15 minutes.

**How it works:** `POST /api/legacy-public/access/:token/otp|session|reissue`, then `GET /api/legacy-view`, `/pdf`, `/documents/:id` with the `X-Legacy-Session` header — a nominee session can reach nothing else. Data is read in the owner's security context, only for allowed categories; with amounts off, no figure is sent.

**Related features:** [F-SUCC-004](F-SUCC-004.md), [F-SUCC-006](F-SUCC-006.md), [D-SUCC-001](../dependencies.md#d-succ-001).

**Sources:** `apps/web/src/pages/legacy/LegacyAccessPage.tsx:28`, `apps/web/src/pages/legacy/LegacyAccessPage.tsx:60`, `apps/web/src/pages/legacy/LegacyAccessPage.tsx:101`, `packages/api/src/controllers/legacy.controller.ts:105`, `packages/api/src/middleware/legacySession.ts:10`, `packages/api/src/services/legacy/view.service.ts:25`, `packages/api/src/services/legacy/view.service.ts:111`, `packages/api/src/services/legacy/tokens.service.ts:22`, `packages/shared/src/legacy.ts:35`
