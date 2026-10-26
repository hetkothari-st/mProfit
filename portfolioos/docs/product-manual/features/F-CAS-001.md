---
id: F-CAS-001
title: "Request CAS helper"
module: "CAS"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CAS-002, F-IMPORT-001, F-MAIL-006]
---

[← CAS](../modules/cas.md) · [Index](../INDEX.md)

# Request CAS helper

`F-CAS-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** You choose a provider and optionally type a PAN, email and date range; **Generate Request** returns a link **Open provider portal**, a list of **Instructions** (the values to type there) and **Next steps**.

**Why it exists:** A code comment explains: CAMS and KFintech have no public API to request a CAS; both use a web form and email a password-protected PDF, so the app provides structured guidance and deep links.

**Where to find it:** **Tools → CAS** (route `/cas`), card **Request CAS**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) (nothing is saved).

**Steps**
1. Choose a **Provider**: CAMS, KFintech, NSDL (e-CAS) or CDSL (e-CAS); each option shows its coverage.
2. Optional: type **PAN (optional)** (converted to capitals), **Email (optional)**, **From date** and **To date**.
3. Click **Generate Request**. A box appears below with **Open provider portal**, **Instructions** and **Next steps**.
4. Click **Open provider portal** (opens in a new tab) and submit the provider's form with the listed values.
5. When the PDF arrives by email, it is imported automatically if Gmail is connected ([F-MAIL-006](F-MAIL-006.md)); otherwise upload it on **Tools → Import**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Provider** | Select | Provider to request from | — |
| **PAN (optional)** | Text | PAN to list in the instructions | Max 10 characters |
| **Email (optional)** | Email | Email to list in the instructions | — |
| **From date** / **To date** | Date | Period to list | — |
| **Generate Request** | Button | Builds the instructions | Disabled while building |
| **Open provider portal** | Link | Opens the provider's page in a new tab | Shown after generating |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Provider | Select | Yes | CAMS, KFINTECH, NSDL, CDSL | CAMS | — |
| PAN | Text | No | Exactly 10 characters when given | Empty | "Validation failed" |
| Email | Email | No | Valid email when given | Empty | "Validation failed" |
| From date / To date | Date | No | YYYY-MM-DD; period is listed only when both are given | Empty | — |

**Settings and toggles here:** None.

**Results:** Nothing is saved or sent. **Instructions** list "PAN: …" and "Email: …" when given, "Statement type: DETAILED", "Period: <from> to <to>" (or "Period: All transactions" unless both dates are set) and "PDF password will be your PAN in uppercase (most providers)".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Validation failed" | PAN not 10 characters, or invalid email | Correct the field or clear it |

**Limitations:** **Next steps** say "If an IMAP mailbox is configured, EveryPaisa will auto-import the PDF" and "Otherwise, upload the PDF via Imports → CAS PDF and provide the PDF password"; IMAP setup is no longer available in the app (Gmail is the supported route) and the Import page has a single upload box, not a "CAS PDF" option. The statement type is always "Detailed". The dates are not checked against each other.

**How it works:** `GET /api/cas/providers` returns a fixed list; `POST /api/cas/request` validates the input and returns the portal URL for the provider plus the text lines. No request is made to the provider.

**Related features:** [F-CAS-002](F-CAS-002.md), [F-IMPORT-001](F-IMPORT-001.md), [F-MAIL-006](F-MAIL-006.md), [D-IMPORT-002](../dependencies.md#d-import-002).

**Sources:** `apps/web/src/pages/cas/CasPage.tsx:26`, `apps/web/src/pages/cas/CasPage.tsx:42`, `apps/web/src/pages/cas/CasPage.tsx:97`, `apps/web/src/pages/cas/CasPage.tsx:108`, `packages/api/src/controllers/cas.controller.ts:73`, `packages/api/src/controllers/cas.controller.ts:106`, `packages/api/src/controllers/cas.controller.ts:115`
