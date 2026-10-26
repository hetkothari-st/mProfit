---
id: F-EMI-008
title: "Share a calculator link"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: []
related: [F-EMI-001, F-EMI-006]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Share a calculator link

`F-EMI-008` · Live · Roles: All signed-in

**What it does:** **Share** copies a link to the calculator with every input of the Calculate and Compare tabs and the current tab. Opening the link restores the same state.

**Why it exists:** Inferred from behavior: to send a loan scenario to someone or bookmark it, without saving anything to an account.

**Where to find it:** **Tools → EMI Calculator → Share** (header button, route `/emi`).

**Who can use it:** All signed-in users; the person opening the link must also be signed in.

**Steps**
1. Click **Share**. The toast "Link copied" appears.
2. Paste the link. The recipient sees the same inputs after signing in.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share** | Button | Copies the link | Never |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Your clipboard holds the link. The address bar always holds the same state, so copying it works too.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't copy - copy the address bar instead" | Clipboard blocked by the browser | Copy the address bar |
| "This calculator link couldn't be opened - showing the default loan instead" | Link from another version, edited or truncated | Re-share from the source |

**Limitations:** The link carries all your inputs in readable encoded form; do not share it if the figures are private.

**How it works:** State is JSON, base64url-encoded into `?v=1&tab=…&s=…&c=…`; on open it is validated (string fields up to 40 characters, up to 50 prepayments and rate changes, 2–3 offers). The address bar is updated 0.4 s after each change without adding history entries.

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-006](F-EMI-006.md).

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:53`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:31`, `apps/web/src/pages/emi/emiUrl.ts:5`, `apps/web/src/pages/emi/emiUrl.ts:15`, `apps/web/src/pages/emi/emiUrl.ts:37`, `apps/web/src/pages/emi/emiUrl.ts:47`
