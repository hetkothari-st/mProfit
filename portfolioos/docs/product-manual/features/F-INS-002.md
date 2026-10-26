---
id: F-INS-002
title: "Add a policy"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-001, S-INS-002, S-INS-003, S-INS-004, S-INS-005]
related: [F-INS-003, F-INS-007, F-INS-018, F-INS-019, F-INS-022]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Add a policy

`F-INS-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Opens the **Add a policy** dialog to record a policy: an optional catalogue pick that fills insurer, plan and type, then insurer, policy number, type, plan name, policyholder, cover, premium, frequency, start and end dates, next premium due, grace period, critical illness cover and an optional policy PDF.

**Why it exists:** Every reminder, schedule, tax figure and coverage verdict is worked out from these terms, so they are captured once here. Inferred from behavior.

**Where to find it:** **Asset Classes → Insurance → Add policy** (route `/insurance`); also **Add policy** next steps on **Coverage check** ([F-INS-019](F-INS-019.md)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add policy**. The **Add a policy** dialog opens with type **Term life** and frequency **Yearly**.
2. Optionally type in **Pick the plan (optional)** ("Search 24+ Indian insurance products — LIC, HDFC Life, Star Health, Niva Bupa…") and pick a product. Insurer, plan name and type fill in and a brief with **Brochure** and insurer-site links appears.
3. Fill **Insurer**, **Policy number**, **Policyholder**, **Cover / sum assured (₹)**, **Premium (₹)**, **Paid** and **Start date**.
4. Optionally fill **Maturity / end date**, **Next premium due**, **Grace period (days)** and **Critical illness cover**.
5. Optionally click **Attach a PDF** to keep the policy document with it.
6. Click **Add policy**. The toast "Policy added" appears and the card is added to the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Pick the plan (optional)** search | Search box with list | Filters the built-in catalogue by insurer, plan or type; picking fills insurer, plan name and type | Hidden when editing or adding from a Gmail document |
| Clear catalogue pick (title "Clear catalog selection") | Button | Removes the pick (fields stay as filled) | Shown only after a pick |
| **Brochure** / insurer site link | Links | Open the product brochure PDF / insurer site in a new tab | Shown only with a catalogue pick |
| **Attach a PDF** | File picker (PDF) | Holds a file to upload after saving | Hidden when adding from a Gmail document |
| Bin (aria "Remove attached file") | Button | Drops the held file | Shown only with a file attached |
| **Cancel** | Button | Closes without saving | Never |
| **Add policy** | Button | Validates and saves; label becomes "Saving…" | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Insurer** | Text | Yes | 1–200 characters (server) | Empty | "Required" |
| **Policy number** | Text | Yes (new) | 3–40 letters or digits once spaces and punctuation are removed; up to 100 characters typed | Empty | "Required"; server: "Enter the policy number as printed on the policy (3–40 letters or digits)" |
| **Type** | Select: Term life, Whole life, ULIP, Endowment, Health, Motor, Home, Travel, Personal accident | Yes | — | Term life | — |
| **Plan name** | Text | No | Up to 300 characters | Empty | — |
| **Policyholder** | Text | Yes | 1–200 characters | Empty | "Required" |
| **Cover / sum assured (₹)** | Text | Yes | Digits with optional decimals | Empty | "Enter an amount, like 5000000" |
| **Premium (₹)** | Text | Yes | Digits with optional decimals | Empty | "Enter an amount, like 25000" |
| **Paid** | Select: Monthly, Quarterly, Half-yearly, Yearly, Single premium | Yes | — | Yearly | — |
| **Start date** | Date | Yes | — | Empty | "Required" |
| **Maturity / end date** | Date | No | Must be after the start date | Empty | "Must be after the start date" |
| **Next premium due** | Date | No | Hidden for Single premium | Empty (the server uses today) | — |
| **Grace period (days)** | Number text | No | 0–90; hidden for Single premium | Blank = the usual grace (shown as placeholder "Usual: 30 days", "Usual: 15 days" or "Usual: none") | "Days, from 0 to 90" |
| **Critical illness cover** | Select: Not recorded, "Yes — included or added as a rider", No | No | Shown only for life, health and personal-accident types | Not recorded | Server: "Only life, health and accident policies include critical illness cover" |
| **Critical illness cover (₹)** | Text | No | Digits; shown only when Yes | Empty | "Enter an amount, like 1000000" |

**Settings and toggles here:** [S-INS-001](../settings/insurance.md#s-ins-001) **Type** (decides grace defaults, which cards and claim guides apply); [S-INS-002](../settings/insurance.md#s-ins-002) **Paid** (sets the premium schedule); [S-INS-003](../settings/insurance.md#s-ins-003) **Next premium due** (premiums before it count as paid); [S-INS-004](../settings/insurance.md#s-ins-004) **Grace period (days)**; [S-INS-005](../settings/insurance.md#s-ins-005) **Critical illness cover**.

**Results:** A policy is saved with the policy number encrypted and only its last 4 kept readable. Its next premium due date is computed and stored, reminders start from the next daily scan, and any Gmail documents waiting for this policy number are linked to it at once. An attached PDF is uploaded to your document vault under this policy.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You already have this policy saved for this insurer" | A policy with the same insurer and the same policy number (ignoring spaces and punctuation) exists | Open the existing policy instead |
| "Policy saved, but the document didn't upload: …" | The policy saved; the PDF upload failed | Upload it again from **Policy documents** on the policy page |
| "Could not add the policy" or the server message under the form | Server validation failed | Correct the field named in the message |

**Limitations:** Nominees, contacts, claims, health-cover details, the linked vehicle and the policy status are not on this form (nominees and contacts are edited on the policy page; health-cover details, vehicle link and status have no screen here). The catalogue lists 23 products although its search placeholder says "24+".

**How it works:** `POST /api/insurance/policies`. The server normalises the number (upper case, letters and digits only), stores it encrypted with a keyed fingerprint and the last 4, and rejects a second policy whose (insurer, fingerprint) already exists. "Next premium due" is stored as the date from which premiums are tracked (`premiumsTrackedFrom`, today when blank): earlier due dates count as already paid. The next unpaid due date is computed from the schedule ([F-INS-007](F-INS-007.md)) and stored. After saving, the server runs document matching ([F-INS-018](F-INS-018.md)) for your account. The PDF goes to `POST` documents with owner type `INSURANCE_POLICY` and category `policy_document`.

**Related features:** [F-INS-003](F-INS-003.md), [F-INS-007](F-INS-007.md), [F-INS-018](F-INS-018.md), [F-INS-022](F-INS-022.md), [D-INS-003](../dependencies.md#d-ins-003) (document vault).

**Sources:** `apps/web/src/components/insurance/PolicyFormDialog.tsx:160`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:186`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:241`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:358`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:139`, `apps/web/src/components/insurance/InsuranceCatalogPicker.tsx:93`, `packages/api/src/controllers/insurance.controller.ts:66`, `packages/api/src/controllers/insurance.controller.ts:159`, `packages/api/src/services/insurance/insurance.service.ts:484`, `packages/api/src/services/insurance/insurance.service.ts:221`, `packages/api/src/services/insurance/insurance.service.ts:482`, `packages/shared/src/insurance/premiumSchedule.ts:89`
