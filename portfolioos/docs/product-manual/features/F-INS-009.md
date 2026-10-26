---
id: F-INS-009
title: "Nominees"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-012]
related: [F-INS-001, F-INS-020, F-INS-021]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Nominees

`F-INS-009` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Nominees** card lists who receives the money (name, relation, share and appointee for a minor). **Add** / **Edit** opens the **Nominees** dialog for up to 10 nominees.

**Why it exists:** "Without a nominee registered with the insurer, your family may need a succession or legal-heir certificate before a claim is paid." (card text)

**Where to find it:** Policy page (route `/insurance/:id`), **Nominees** card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add** (or **Edit**). The **Nominees** dialog opens.
2. Fill **Name**, **Relation** (suggestions: Spouse, Son, Daughter, Father, Mother, Brother, Sister) and **Share %**.
3. Tick **Under 18** for a minor and fill **Appointee** and **Appointee's relation**.
4. Click **Add nominee** for more rows; the bin removes a row.
5. Click **Save nominees**. The toast "Nominees saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** / **Edit** | Button | Opens the dialog | Never |
| **Add nominee** | Button | Adds a row | Hidden at 10 rows |
| Bin (aria "Remove nominee N") | Button | Removes a row | — |
| **Under 18** | Checkbox | Shows appointee fields | — |
| **Save nominees** | Button | Saves; "Saving…" | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Rows without a name are dropped | Up to 100 | Empty | — |
| **Relation** | Text with suggestions | Yes for a named nominee | Up to 50 | Empty | "Add how <name> is related to the policyholder." |
| **Share %** | Text | All or none | Up to 3 digits and 2 decimals; all shares must total 100 | Empty | "Give every nominee a share, or leave all shares blank." / "Shares add up to N% — they need to total 100%." / "\"x\" isn't a percentage." |
| **Appointee** | Text | Yes for a minor | Up to 100 | Empty | "<name> is a minor — add an appointee to receive the money for them." |
| **Appointee's relation** | Text | No | Up to 50 | Empty | — |

**Settings and toggles here:** [S-INS-012](../settings/insurance.md#s-ins-012) **Under 18**.

**Results:** Nominees are saved on the policy; the nominee warning on the Insurance page clears; the **Family insurance sheet** lists them.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save" | Server error or a server-side rule | Read the message; fix and save again |

**Limitations:** Recording a nominee here does not register it with the insurer.

**How it works:** Saved with `PATCH /api/insurance/policies/:id` (`nominees`). The server repeats the checks: at most 10 nominees, a relation for each, an appointee for a minor, shares all-or-none totalling 100.

**Related features:** [F-INS-001](F-INS-001.md), [F-INS-020](F-INS-020.md), [F-INS-021](F-INS-021.md).

**Sources:** `apps/web/src/components/insurance/NomineesCard.tsx:15`, `apps/web/src/components/insurance/NomineesCard.tsx:75`, `apps/web/src/components/insurance/NomineesCard.tsx:191`, `packages/api/src/services/insurance/insurance.service.ts:244`, `packages/api/src/services/insurance/insurance.service.ts:283`
