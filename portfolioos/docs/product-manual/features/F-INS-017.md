---
id: F-INS-017
title: "Find my insurance documents in Gmail"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INS-006]
related: [F-INS-018]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Find my insurance documents in Gmail

`F-INS-017` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** A per-Gmail-account permission. Turned on, EveryPaisa searches that inbox only for emails from insurers, or with an insurance subject such as "policy document" or "premium receipt", that have a PDF attached, and collects policy documents, premium receipts, renewal notices and claim letters. Each account shows "Off", "Searching… N document(s) found so far", "On · last searched <date>" or "Last search failed: …". **Scan now** starts a search immediately.

**Why it exists:** To fill in policies and premiums from the insurer's own documents, with explicit permission: "Nothing else in your inbox is read. You can turn it off at any time." (card text)

**Where to find it:** **Asset Classes → Insurance**, **Find my insurance documents in Gmail** card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with a Gmail account connected ([D-INS-006](../dependencies.md#d-ins-006)).

**Steps**
1. If no Gmail account is connected, click **Connect Gmail first** (goes to `/ingestion`).
2. Click **Turn on** for an account. The toast "Searching your Gmail for insurance documents" appears and the first search looks back three years.
3. Click **Scan now** to search again; the line updates every 5 seconds while running.
4. Click **Turn off** to stop (toast "Insurance search turned off"); any search in progress is cancelled.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail first** | Link | Opens `/ingestion` | Shown with no Gmail account |
| **Turn on** / **Turn off** | Button | Gives or withdraws permission | Disabled while saving |
| **Scan now** | Button | Starts a search | Shown when on; disabled while a search runs |

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-INS-006](../settings/insurance.md#s-ins-006) **Find my insurance documents in Gmail** (per account).

**Results:** Found PDFs are read and matched ([F-INS-018](F-INS-018.md)). Each change of permission is written to the audit log. With permission on, a nightly search runs at 05:30 IST.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not change the setting" / "Could not start the search" | Server error, or the account is no longer active | Reconnect Gmail |
| "Insurance search is not turned on for this account" | Scan requested with permission off | Turn it on first |

**Limitations:** Only Gmail accounts connected through Google sign-in are listed.

**How it works:** `GET /api/insurance/gmail-fetch`, `PUT /api/insurance/gmail-fetch/:mailboxId` (`enabled`), `POST …/scan`. A search is an INSURANCE-kind Gmail scan job; later searches start where the last completed one ended (overlapping by a day). Nightly at 05:30 IST (`ENABLE_INSURANCE_CRONS`), for each permitted account, waiting documents are retried and a new search starts.

**Related features:** [F-INS-018](F-INS-018.md), [D-INS-006](../dependencies.md#d-ins-006).

**Sources:** `apps/web/src/components/insurance/InsuranceGmailFetchCard.tsx:58`, `apps/web/src/components/insurance/InsuranceGmailFetchCard.tsx:67`, `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:23`, `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:58`, `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:150`, `packages/api/src/jobs/insuranceJobs.ts:18`
