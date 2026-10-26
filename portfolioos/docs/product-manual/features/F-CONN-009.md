---
id: F-CONN-009
title: "Account Aggregator (Finvu) consent"
module: "Connections"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-CONN-010, F-PLAN-001]
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Account Aggregator (Finvu) consent

`F-CONN-009` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Starts an RBI Account Aggregator consent through Finvu for mutual funds and equities, lists your consents with status and dates, and lets you revoke an approved one. In demo mode it creates a test consent you can approve with one click.

**Why it exists:** The card text: "Pull mutual funds, deposits and equities directly from the user's linked banks via the RBI-regulated Account Aggregator framework."

**Where to find it:** **Tools → Connectors → Account Aggregator (Finvu)** (bottom of the page).

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (server-enforced). The card itself has no lock for Free users.

**Steps**
1. Check the badge: **Demo mode**, **Configured** or **Token missing**.
2. Click **Connect via Finvu** (or **Re-initiate consent** when one is approved). A popup opens Finvu ("Consent flow opened in a popup. Approve in your bank app to continue."). In demo mode: "[Demo] Consent initiated — click Simulate approval to mark it approved."
3. Approve in Finvu. The list refreshes every 10 seconds; **Refresh** forces it.
4. Pending rows offer **Open Finvu** (or **Simulate approval** in demo). Approved rows offer **Revoke**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect via Finvu** / **Re-initiate consent** | Button | Starts a consent | Disabled when not configured or while starting |
| **Refresh** | Button | Reloads consents | Disabled while loading |
| **Simulate approval** | Button | Marks a demo consent approved | Demo mode, pending rows only |
| **Open Finvu** | Link | Re-opens the consent page | Not demo, pending rows with a redirect address |
| **Revoke** | Button | Revokes an approved consent | Approved rows only |

**Fields and rules:** Not applicable — the consent asks for MUTUAL_FUNDS and EQUITIES.

**Settings and toggles here:** None.

**Results:** A consent row (Initiated, Pending, Approved, Rejected, Expired, Revoked) with Initiated/Approved/Expires dates and FI types.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (toast) | Free plan | Upgrade |
| "Set FINFACTOR_API_TOKEN in the API env to enable consent flows." | Not configured | Contact the operator |
| "Popup blocked — allow popups for this site and retry" | Popup blocked | Allow popups |
| "Consent created — check Finvu for the redirect URL." | Finvu returned no redirect | Use **Open Finvu** later |

**Limitations:** The card says "Once approved, holdings sync automatically", but data notifications from Finvu are only logged; importing the data is a manual step elsewhere ([D-CONN-002](../dependencies.md#d-conn-002)). For a Free user the consents list silently stays empty while its requests are refused. Consent approval status depends on Finvu's webhook ([F-CONN-010](F-CONN-010.md)).

**How it works:** GET `/api/integrations/finfactor/status` (ungated) returns configured/demo flags. Everything else requires the AA_FINVU_AUTOIMPORT (Plus) feature: POST `/consent/initiate`, GET `/consent`, POST `/consent/<handle>/revoke`, POST `/consent/<handle>/approve-demo` (demo mode only: "consent demo-approve is only available in demo mode"). Status changes from Finvu arrive on the consent webhook.

**Related features:** [F-CONN-010](F-CONN-010.md), [D-CONN-002](../dependencies.md#d-conn-002), [F-PLAN-001](F-PLAN-001.md).

**Sources:** `apps/web/src/pages/connectors/FinvuConsentCard.tsx:59`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:65`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:138`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:173`, `packages/api/src/routes/finfactor.routes.ts:38`, `packages/api/src/routes/finfactor.routes.ts:42`, `packages/api/src/controllers/finfactor.controller.ts:211`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:110`

**What this area doesn't do**
- Chatbots can never add, change or delete anything — the connector is read-only.
- AI connectors does not include the in-app AI Assistant chat ([D-CONN-003](../dependencies.md#d-conn-003)).
- Broker connectors do not import anything on this page; sync runs from the F&O page.
- There is no Account Aggregator support for bank-account statements on this card (consents ask for mutual funds and equities).
