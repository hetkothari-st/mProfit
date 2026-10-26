---
id: F-SUCC-004
title: "Nominees"
module: "Succession"
status: Live
roles: "R-PLUS+ (add/edit); any plan (remove/revoke)"
settings: [S-SUCC-007, S-SUCC-008, S-SUCC-009, S-SUCC-010, S-SUCC-011]
related: [F-SUCC-001, F-SUCC-005, F-SUCC-008]
---

[← Succession](../modules/succession.md) · [Index](../INDEX.md)

# Nominees

`F-SUCC-004` · Live · Roles: [R-PLUS](../roles.md#r-plus)+ (add/edit); any plan (remove/revoke)

**What it does:** Lists up to 10 nominees (name, relationship, **Verifier** badge, email with confirmation state, what they can see, whether amounts are shown) and lets you add, edit, remove or (after release) revoke one nominee's access.

**Why it exists:** Inferred from behavior: each nominee can be given exactly the categories, documents and level of detail the owner chooses.

**Where to find it:** **Planning → Succession → Nominees** card.

**Who can use it:** Adding and editing need [R-PLUS](../roles.md#r-plus) or above; removing and revoking work on any plan.

**Steps**
1. Click **Add nominee**. The dialog "Add nominee" opens.
2. Enter **Name**, **Email**, **Relationship** (placeholder "Spouse"), **Priority**.
3. Tick **What they can see** categories; if **Documents** is ticked, tick **Documents to share** from your vault.
4. Tick **Show amounts (balances, values). Off means they see only what exists and where.** and/or **Verifier: asked to confirm before access opens. Only one per plan.**
5. Click **Save**, then confirm it's you. Toast "Saved".
6. Use **Edit**, **Remove** (toast "Nominee removed") or, after release, **Revoke** (toast "Access withdrawn").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add nominee** | Button | Opens the dialog | Disabled below PLUS |
| **Edit** | Button | Opens "Edit nominee" | Disabled below PLUS |
| **Remove** | Button | Deletes the nominee; their links and sessions end | — |
| **Revoke** | Button | Ends this nominee's access | Shown only after release |
| **Save** / **Cancel** | Buttons (dialog) | Save / close | **Save** disabled until name, a valid-looking email, relationship and ≥ 1 category are set |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–120 characters | Empty | — |
| **Email** | Email | Yes | Valid email, lower-cased; unique per plan | Empty | "This email is already a nominee." |
| **Relationship** | Text | Yes | 1–60 characters | Empty | — |
| **Priority** | Number | Yes | 1–20 | 1 | — |
| **What they can see** | Checkboxes | ≥ 1 | Investments, Bank accounts, Insurance, Loans & credit cards, Property, Vehicles, Provident fund & NPS, Documents, Personal letter | Insurance + Bank accounts | "Pick at least one category" |
| **Documents to share** | Checkboxes | No | ≤ 50; only your own documents | None | — |
| Nominees per plan | — | — | ≤ 10 | — | "You can add up to 10 nominees." |

**Settings and toggles here:** [S-SUCC-007](../settings/succession.md#s-succ-007) **What they can see**, [S-SUCC-008](../settings/succession.md#s-succ-008) **Show amounts**, [S-SUCC-009](../settings/succession.md#s-succ-009) **Verifier**, [S-SUCC-010](../settings/succession.md#s-succ-010) **Priority**, [S-SUCC-011](../settings/succession.md#s-succ-011) **Documents to share**.

**Results:** On a running plan a new nominee (or one whose email changed) gets a "<you> named you as a trusted contact" email with **Confirm**; on a released plan they also get access at once. Until they confirm, the list shows "⚠ email not confirmed yet". Making someone the verifier removes the badge from anyone else.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nominee not found" | Already removed | Refresh |
| "No documents in your vault yet." | Documents ticked but vault empty | Upload in **Documents** ([D-SUCC-001](../dependencies.md#d-succ-001)) |

**Limitations:** A replaced will document is offered in the picker only where it is already shared, so it can be unticked. Changing a nominee's email cancels their old links and unsent emails.

**How it works:** `POST/PUT /api/legacy/nominees[/:id]` (LEGACY_TRANSFER + grant), `DELETE /api/legacy/nominees/:id` (grant only), `POST /api/legacy/revoke` with `nomineeId`. Names and emails are stored encrypted; document ids that are not yours are dropped.

**Related features:** [F-SUCC-001](F-SUCC-001.md), [F-SUCC-005](F-SUCC-005.md), [F-SUCC-008](F-SUCC-008.md), [D-SUCC-001](../dependencies.md#d-succ-001).

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:170`, `apps/web/src/pages/legacy/NomineeDialog.tsx:11`, `apps/web/src/pages/legacy/NomineeDialog.tsx:38`, `packages/api/src/schemas/legacy.schemas.ts:18`, `packages/api/src/services/legacy/plan.service.ts:28`, `packages/api/src/services/legacy/plan.service.ts:133`, `packages/api/src/services/legacy/plan.service.ts:159`, `packages/api/src/services/legacy/plan.service.ts:210`, `packages/shared/src/legacy.ts:22`
