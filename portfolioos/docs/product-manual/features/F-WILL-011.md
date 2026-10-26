---
id: F-WILL-011
title: "Step 8: Preview and generate the PDF"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: []
related: [F-WILL-001, F-WILL-010, F-WILL-012]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Step 8: Preview and generate the PDF

`F-WILL-011` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Shows a summary and the full text of the will as it will print, asks you to tick the acknowledgement, and generates the PDF as a new numbered version.

**Why it exists:** Code comment: "A preview is what the user consents to, so it is never served from cache".

**Where to find it:** Wizard step **Preview** (`/will/:id/preview`).

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

**Steps**
1. Wait for "Preparing your preview...". Read the summary and document.
2. Tick: "I understand that EveryPaisa is not a law firm, that this will is produced from a fixed template, and that I should have it reviewed by a qualified advocate before I sign it."
3. Click **Generate PDF**. "Version N is ready" appears with next steps.
4. Click **Download PDF**, **Next: sign and store** or **Back to Will Maker**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Acknowledgement checkbox | Checkbox | Consent | Resets whenever the preview reloads |
| **Generate PDF** | Button | Generates the version | Disabled until ticked, with blockers, or while generating |
| **Download PDF** / **Next: sign and store** / **Back to Will Maker** | Buttons | After generation | — |
| **Go to Review** / **Reload preview** / **Retry** | Buttons | Recovery actions | Shown only in those states |

**Fields and rules:** Acknowledgement required ("Please confirm you have read the note about legal review").

**Settings and toggles here:** None.

**Results:** The draft becomes **Generated**; any earlier generated or signed version becomes superseded ("replaced by version N"); open review reminders close; the PDF is stored in your documents.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix the items on the Review step first." | Blockers | **Go to Review** |
| "Your preview is from an earlier day - reload it to see the will with today's date before you generate." | The date changed | **Reload preview** |
| "Your will changed since this preview. Reload the preview to see the latest version before you generate." | Revision changed | **Reload preview** |
| "Couldn't prepare the preview" / "Couldn't create your will" | Server error | **Retry** |

**Limitations:** Generation is limited to 5 per minute. The PDF footer reads "Prepared with EveryPaisa Will Maker from a fixed template. Not legal advice - have it reviewed by a qualified advocate."

**How it works:** `GET /api/will/drafts/:id/preview` (audit "will_viewed") and `POST /api/will/drafts/:id/generate` with revision, acknowledgement and the preview date. The server re-checks rules, renders the PDF with the running head "Last Will and Testament of <name>", stores it as a document named "will-v<N>.pdf", seals a snapshot, and writes the audit row "will_generated".

**Related features:** [F-WILL-010](F-WILL-010.md), [F-WILL-012](F-WILL-012.md), [D-WILL-002](../dependencies.md#d-will-002).

**Sources:** `apps/web/src/pages/will/steps/PreviewStep.tsx:18`, `apps/web/src/pages/will/steps/PreviewStep.tsx:48`, `apps/web/src/pages/will/steps/PreviewStep.tsx:129`, `packages/api/src/routes/will.routes.ts:60`, `packages/api/src/services/will/willGenerate.service.ts:72`, `packages/api/src/services/will/willGenerate.service.ts:116`, `packages/shared/src/will/wire.ts:120`
