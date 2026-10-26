---
id: F-ADV-009
title: "Explain in plain English (AI narration)"
module: "Investment Advisor"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-ADV-007]
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Explain in plain English (AI narration)

`F-ADV-009` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Explain in plain English** asks an AI model to rewrite the card's reasoning in 2–4 plain sentences, shown under **In plain English** with the note "AI-generated summary of the reasoning above. If the two ever disagree, the reasoning above is what the system actually used." and a **How we use AI** link.

**Why it exists:** Code comment: "This layer is decorative by construction… All this service adds is a friendlier paraphrase of that rationale."

**Where to find it:** **Overview → Advisor →** a card's footer.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) — only when the operator has switched narration on.

**Steps**
1. Click **Explain in plain English**. A spinner shows while it writes.
2. The narration appears, or a short message explains why not.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Explain in plain English** | Button | Generates narration | Hidden when narration is disabled on the server or already exists; disabled while generating |
| **How we use AI** | Link | Opens `/legal/ai-use` ([D-ADV-002](../dependencies.md#d-adv-002)) | Shown with narration |

**Fields and rules:** None.

**Settings and toggles here:** None user-facing (operator switch, see the settings reference operator table).

**Results:** The narration is saved on the recommendation and shown on every later visit.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You've used up plain-English explanations for now. The reasoning above still stands." | Your monthly AI budget is used up | Wait for the next month |
| "Plain-English explanations are turned off right now." | Narration disabled on the server | None |
| "Narration referenced figures absent from the rationale and was discarded: …" | The model invented a figure; it was rejected | Try again or rely on the reasoning |
| "Could not write a plain-English version right now." | Model call failed | Retry later |

**Limitations:** Whether narration is available, its cost and its wording depend on server configuration and the live model; not observed in this code-only run.

**How it works:** `POST /api/advisor/recommendations/:id/prose`. Gate: requires both an Anthropic key and `ENABLE_LLM_ADVISOR_PROSE=true`. Budget: checks the same monthly INR ledger used by email parsing and insights; spend is recorded on success and failure (estimated at USD 3 per million input and USD 15 per million output tokens, converted at the `llm.usd_inr_fx` setting, default 90). The model sees only the category, the reasoning text and the trade legs; its reply is limited to 900 characters and is discarded if it contains any figure or fund name not in the reasoning. Model: `llm.advisor_model` app setting, else `LLM_ADVISOR_MODEL`.

**Related features:** [F-ADV-007](F-ADV-007.md), [D-ADV-002](../dependencies.md#d-adv-002), [D-ADV-005](../dependencies.md#d-adv-005).

**Sources:** `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:328`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:420`, `apps/web/src/pages/advisor/widgets/RecommendationCard.tsx:533`, `packages/api/src/services/advisor/advisorProse.service.ts:49`, `packages/api/src/services/advisor/advisorProse.service.ts:120`, `packages/api/src/services/advisor/advisorProse.service.ts:190`, `packages/api/src/services/advisor/advisorProse.service.ts:303`, `packages/api/src/config/env.ts:128`
