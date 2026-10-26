---
id: F-INS-020
title: "Family insurance sheet"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-009, F-INS-010]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Family insurance sheet

`F-INS-020` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** One printable page of your active policies grouped as **Life cover**, **Health cover** and **Other cover**: for each, the cover, type, **Policyholder**, **Policy number** (last 4 only), **Nominee**, **To claim** contacts, **Agent**, **Premium** and **Matures** / **Cover ends**.

**Why it exists:** "Everything your family needs to make a claim, on one page. Print it and keep it with your important papers." (page description)

**Where to find it:** **Asset Classes → Insurance → Family sheet** (route `/insurance/emergency-sheet`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open **Family sheet**. Click **Print**; only the sheet prints.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Policies** | Link | Back | Never |
| **Print** | Button | Opens the browser print dialog | Disabled with no active policies |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "No active policies yet. Add one and it will appear here." — add a policy.

**Limitations:** Full policy numbers are not printed ("Full policy numbers are in the policy documents and on each policy's page in EveryPaisa."). When you have no helpline saved, the insurer's customer-care number from its website is printed instead.

**How it works:** Uses the same policy list as the Insurance page; printing hides everything except the sheet.

**Related features:** [F-INS-009](F-INS-009.md), [F-INS-010](F-INS-010.md).

**Sources:** `apps/web/src/pages/insurance/EmergencySheetPage.tsx:82`, `apps/web/src/pages/insurance/EmergencySheetPage.tsx:34`, `apps/web/src/pages/insurance/EmergencySheetPage.tsx:142`
