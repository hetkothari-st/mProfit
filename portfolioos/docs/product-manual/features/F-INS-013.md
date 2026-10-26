---
id: F-INS-013
title: "Claims in progress"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-012]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Claims in progress

`F-INS-013` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** On the Insurance page, lists every claim not yet closed across all policies, those needing a push first (Ombudsman, then complaint, then waiting), with the next-step reason and amount claimed. Hidden when there are none.

**Why it exists:** "Every claim still in progress, those needing a push first." (code comment)

**Where to find it:** **Asset Classes → Insurance**, **Claims in progress** panel.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Read each row; click its title to open the policy at **Claims**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "<insurer> — <claim>" | Link | Opens `/insurance/:id#claims` | Never |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** A claim with next action "Nothing to do" (for example settled in full, or with the Ombudsman) is not listed.

**How it works:** Built from the claims returned with the policy list.

**Related features:** [F-INS-012](F-INS-012.md).

**Sources:** `apps/web/src/components/insurance/OpenClaimsPanel.tsx:15`, `apps/web/src/components/insurance/OpenClaimsPanel.tsx:28`
