---
id: F-INS-018
title: "Insurance documents from Gmail"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INS-007]
related: [F-INS-002, F-INS-017]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Insurance documents from Gmail

`F-INS-018` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows what the Gmail search found and what became of it: **Policies found (N)** to review and add, **Renewals to confirm (N)** with proposed changes, **Password protected** PDFs grouped by sender, **Needs your check (N)** for readings that didn't match the document, and **All documents (N)** folded. Premium receipts and claim letters for a policy you have are recorded on it automatically.

**Why it exists:** "Premium receipts and claim letters are recorded on the matching policy. A policy that isn't here yet is suggested below — check it, then add it." (card text)

**Where to find it:** **Asset Classes → Insurance**, **Insurance documents from Gmail** card (hidden with no documents).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Under **Policies found**, click **Review and add**. **Add this policy** opens filled from the document ("Check each figure against the document before adding."); the policy number comes from the document. Click **Add policy**. Or click **Not mine**.
2. Under **Renewals to confirm**, click **Update the policy** (toast "Policy updated from the renewal notice") or **Ignore** (toast "Renewal notice ignored").
3. Under **Password protected**, type the PDF password, keep **Remember it (encrypted) for future PDFs** ticked if you want, and click **Open**. The toast "Opened N PDFs" appears.
4. Under **Needs your check**, click **Add the policy myself** (policy documents and renewal notices) or **Dismiss**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Review and add** | Button | Opens the add form filled from the document | — |
| **Not mine** / **Dismiss** | Button | Dismisses the document | Disabled while saving |
| **Update the policy** / **Ignore** | Buttons | Apply or ignore a renewal | Disabled while saving |
| **Open** | Button | Tries the password on that sender's PDFs | Disabled with no password |
| **Remember it (encrypted) for future PDFs** | Checkbox | Saves the password | Ticked by default |
| **Add the policy myself** | Button | Opens the add form | Shown for policy documents and renewal notices with a policy number |
| **Filed in Documents under the policy holder** | Link | Opens `/documents` | Shown for filed documents |

**Fields and rules:** **PDF password** — required to click **Open**; up to 200 characters (server).

**Settings and toggles here:** [S-INS-007](../settings/insurance.md#s-ins-007) **Remember it (encrypted) for future PDFs**.

**Results:** Approved documents create policies; linked receipts create premium payments (unless already recorded); claim letters create or advance claims; renewals update premium, sum assured, end date or next due date; linked documents are filed into Documents.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not open the PDF" | Wrong password, or too many attempts (rate-limited like personal data reveals) | Check the insurer's email for the password; wait a minute |
| "This renewal notice was already answered" / "has nothing left to change" | Answered already | None |
| "This document is linked to a policy" | Tried to dismiss a linked document | None |

**Limitations:** Reading uses an AI model on a redacted copy of the text and needs the operator's model key; when the monthly reading budget is reached, documents stay "Not read yet." and are retried nightly. A document whose reading doesn't match its text is never applied automatically.

**How it works:** Each found PDF becomes an insurance document read by a language model; every amount, date, policy number and name must appear in the PDF text or the document goes to **Needs your check**. Matching is by policy-number fingerprint. Only the latest renewal notice of a policy proposes changes, and end date and next due date only move later. Endpoints: `GET /api/insurance/documents`, `POST …/:docId/approve|dismiss|password|renewal`.

**Related features:** [F-INS-002](F-INS-002.md), [F-INS-017](F-INS-017.md), [D-INS-003](../dependencies.md#d-ins-003).

**Sources:** `apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:119`, `apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:56`, `apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:205`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:235`, `packages/api/src/services/insurance/insuranceDocPipeline.ts:9`, `packages/api/src/services/insurance/insuranceDocMatching.ts:348`, `packages/api/src/services/insurance/insuranceRenewal.ts:141`, `packages/api/src/ingestion/insurance/insuranceDocReader.ts:5`, `packages/api/src/routes/insurance.routes.ts:78`
