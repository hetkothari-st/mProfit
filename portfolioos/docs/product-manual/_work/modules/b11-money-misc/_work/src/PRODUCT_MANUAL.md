# EveryPaisa User Manual — Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting (B11 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Insurance (`/insurance`, `/insurance/:id`, `/insurance/coverage`, `/insurance/emergency-sheet`, `/insurance/help`), PPF & EPF (`/provident-fund`, `/provident-fund/extension`, `/ppf`, `/epf`), Forex (`/forex`), Goals (`/goals`), Income (`/income`), Cash Activity (`/cashflows`), Accounting (`/accounting`)

## Contents
- [Insurance](#insurance)
- [PPF & EPF](#ppf--epf)
- [Forex](#forex)
- [Goals](#goals)
- [Income](#income)
- [Cash Activity](#cash-activity)
- [Accounting](#accounting)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Insurance

The **Insurance** area (sidebar **Asset Classes → Insurance**, route `/insurance`) keeps every policy you hold — term, whole life, ULIP, endowment, health, motor, home, travel and personal accident — with its premiums, nominees, claim contacts and claims. EveryPaisa works out when each premium falls due from the policy's start date and frequency, reminds you before it is due and during the grace period, tracks claims against the regulator's time limits, and shows what the premiums are worth at tax time. Three companion pages hang off it: **Coverage check** (`/insurance/coverage`), **Family insurance sheet** (`/insurance/emergency-sheet`) and **Help and rights** (`/insurance/help`). Nothing in this area is plan-gated.

### Insurance page overview <!-- F-INS-001 -->
**What it does:** Shows your policies as certificate-style cards, with a three-figure summary on top — **Life cover** (sum assured of active term, whole life, ULIP and endowment policies), **Health cover** (sum assured of active health policies) and **Premiums a year** (yearly premium outgo of active policies). Below the summary come the **Coming up** panel (F-INS-006), **Claims in progress** (F-INS-013), **Tax on your premiums** (F-INS-014), a nominee warning, the active policy cards, and a **Lapsed, matured and closed** section for any policy whose status is not Active. The Gmail cards (F-INS-017, F-INS-018) sit above the summary.

**Why it exists:** The page header states it: "Your policies, what's due, and who to call when you need to claim."

**Where to find it:** **Asset Classes → Insurance** (route `/insurance`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate). R-MANAGER sees and changes the managed person's policies. In family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) the page still shows only your own policies.

**Steps**
1. Open **Asset Classes → Insurance**. While loading, three grey placeholder cards show.
2. With no policies, the empty state "No policies yet" offers **Add your first policy**.
3. Read the summary and panels. Click any policy card to open its page (F-INS-008).
4. Use the header buttons: **Coverage check**, **Family sheet** (only once you have at least one policy), **Help and rights**, the report download button, and **Add policy**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Coverage check** | Link button | Opens `/insurance/coverage` (F-INS-019) | Never |
| **Family sheet** | Link button | Opens `/insurance/emergency-sheet` (F-INS-020) | Hidden when you have no policies |
| **Help and rights** | Link button | Opens `/insurance/help` (F-INS-021) | Never |
| Download report button | Button | Insurance report (D-INS-002) | Never |
| **Add policy** / **Add your first policy** | Button | Opens **Add a policy** (F-INS-002) | Never |
| Policy card | Link | Opens `/insurance/:id` | Never |
| Pencil (aria "Edit <insurer> <plan>") | Icon button | Opens **Edit policy** (F-INS-003) | Never |
| Bin (aria "Delete <insurer> <plan>") | Icon button | Turns the card into a delete confirmation (F-INS-004) | Spinner while deleting |
| Eye button | Toggle | Shows or hides the full policy number (F-INS-005) | Disabled while loading |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this page itself; the Gmail search toggle (S-INS-006) and tax settings (S-INS-008, S-INS-009, S-INS-010) live in cards on this page and are described with their features.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A matured or lapsed policy still shows in the active list | The app has no control to change a policy's status (see Limitations) | Delete the policy, or keep it and ignore its reminders |
| Amber banner "… has no nominee recorded." | An active life or personal-accident policy has no nominee | Add nominees on the policy page (F-INS-009) |

**Limitations:** A policy's status (Active, Lapsed, Surrendered, Matured, Claimed) can only be changed through the API: neither the add/edit form nor any other screen sends a status, so the **Lapsed, matured and closed** section stays empty in normal use (see DOCUMENTATION_GAPS.md). **Premiums a year** counts a single-premium policy as ₹0. Cover figures are shown in compact form (for example "₹1.5 Cr").

**How it works:** The page calls `GET /api/insurance/policies`, which returns your policies newest-added first, each with its 5 latest premium payments, all claims (newest first) and any linked vehicle. The policy number is never sent — only its last 4 digits and a "has number" flag. Each policy carries `premiumDue`, computed on the server from the stored next due date and the grace period (F-INS-007). **Premiums a year** converts each premium with monthly × 12, quarterly × 4, half-yearly × 2, annual × 1, single × 0. The nominee warning lists active term, whole life, ULIP, endowment and personal-accident policies with no nominee. Card colours come from the insurer's brand; unknown insurers get a colour per policy type.

**Related features:** F-INS-002, F-INS-005, F-INS-006, F-INS-008, F-INS-013, F-INS-014, F-INS-017, F-INS-018, D-INS-002.

**Sources:** @@W/pages/insurance/InsuranceListPage.tsx#function CoverSummary@@, @@W/pages/insurance/InsuranceListPage.tsx#Life cover@@, @@W/pages/insurance/InsuranceListPage.tsx#Coverage check@@, @@W/pages/insurance/InsuranceListPage.tsx#Lapsed, matured and closed@@, @@W/lib/insurance.ts#export function needsNominee@@, @@S/insurance/premiumSchedule.ts#export function premiumToAnnual@@, @@A/services/insurance/insurance.service.ts#export async function listPolicies@@, @@A/services/insurance/insurance.service.ts#export function toPolicyDto@@, @@W/components/insurance/PolicyCard.tsx#export function PolicyCard@@

### Add a policy <!-- F-INS-002 -->
**What it does:** Opens the **Add a policy** dialog to record a policy: an optional catalogue pick that fills insurer, plan and type, then insurer, policy number, type, plan name, policyholder, cover, premium, frequency, start and end dates, next premium due, grace period, critical illness cover and an optional policy PDF.

**Why it exists:** Every reminder, schedule, tax figure and coverage verdict is worked out from these terms, so they are captured once here. Inferred from behavior.

**Where to find it:** **Asset Classes → Insurance → Add policy** (route `/insurance`); also **Add policy** next steps on **Coverage check** (F-INS-019).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

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

**Settings and toggles here:** S-INS-001 **Type** (decides grace defaults, which cards and claim guides apply); S-INS-002 **Paid** (sets the premium schedule); S-INS-003 **Next premium due** (premiums before it count as paid); S-INS-004 **Grace period (days)**; S-INS-005 **Critical illness cover**.

**Results:** A policy is saved with the policy number encrypted and only its last 4 kept readable. Its next premium due date is computed and stored, reminders start from the next daily scan, and any Gmail documents waiting for this policy number are linked to it at once. An attached PDF is uploaded to your document vault under this policy.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You already have this policy saved for this insurer" | A policy with the same insurer and the same policy number (ignoring spaces and punctuation) exists | Open the existing policy instead |
| "Policy saved, but the document didn't upload: …" | The policy saved; the PDF upload failed | Upload it again from **Policy documents** on the policy page |
| "Could not add the policy" or the server message under the form | Server validation failed | Correct the field named in the message |

**Limitations:** Nominees, contacts, claims, health-cover details, the linked vehicle and the policy status are not on this form (nominees and contacts are edited on the policy page; health-cover details, vehicle link and status have no screen here). The catalogue lists 23 products although its search placeholder says "24+".

**How it works:** `POST /api/insurance/policies`. The server normalises the number (upper case, letters and digits only), stores it encrypted with a keyed fingerprint and the last 4, and rejects a second policy whose (insurer, fingerprint) already exists. "Next premium due" is stored as the date from which premiums are tracked (`premiumsTrackedFrom`, today when blank): earlier due dates count as already paid. The next unpaid due date is computed from the schedule (F-INS-007) and stored. After saving, the server runs document matching (F-INS-018) for your account. The PDF goes to `POST` documents with owner type `INSURANCE_POLICY` and category `policy_document`.

**Related features:** F-INS-003, F-INS-007, F-INS-018, F-INS-022, D-INS-003 (document vault).

**Sources:** @@W/components/insurance/PolicyFormDialog.tsx#function validate@@, @@W/components/insurance/PolicyFormDialog.tsx#const input: UpdatePolicyInput = {@@, @@W/components/insurance/PolicyFormDialog.tsx#Pick the plan (optional)@@, @@W/components/insurance/PolicyFormDialog.tsx#Premiums before this date count as already paid.@@, @@W/components/insurance/PolicyFormDialog.tsx#ownerType: 'INSURANCE_POLICY'@@, @@W/components/insurance/InsuranceCatalogPicker.tsx#Search 24+@@, @@A/controllers/insurance.controller.ts#const createPolicySchema@@, @@A/controllers/insurance.controller.ts#await matchInsuranceDocuments(req.user.id);@@, @@A/services/insurance/insurance.service.ts#export async function createPolicy@@, @@A/services/insurance/insurance.service.ts#function assertPolicyNumber@@, @@A/services/insurance/insurance.service.ts#const DUPLICATE_POLICY@@, @@S/insurance/premiumSchedule.ts#export function defaultGraceDays@@

### Edit a policy <!-- F-INS-003 -->
**What it does:** Opens **Edit policy** with the saved values (the policy number box is empty and shows "Saved, ending 1234 — type to replace"). Saving updates the policy and, when a schedule field changed, recomputes the next premium due.

**Why it exists:** Premiums, cover and dates change at renewal; this keeps the schedule and reminders right. Inferred from behavior.

**Where to find it:** Pencil on a policy card (route `/insurance`), or **Edit** on the policy page (route `/insurance/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the pencil on a card or **Edit** on the policy page. **Edit policy** opens with saved values.
2. Change any field. Leave **Policy number** blank to keep the saved number, or type a new one to replace it.
3. Change **Next premium due** only if the insurer says otherwise — the hint reads "Change only if the insurer says otherwise — earlier premiums then count as paid."
4. Click **Save changes**. The toast "Policy updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Closes without saving | Never |
| **Save changes** | Button | Saves; label "Saving…" | Disabled while saving |

**Fields and rules:** Same fields and rules as F-INS-002 except: **Policy number** is optional (blank keeps it); **Next premium due** is sent only if you changed it; the catalogue picker is not shown; **Attach a PDF** is shown.

**Settings and toggles here:** S-INS-001, S-INS-002, S-INS-003, S-INS-004, S-INS-005 (as in F-INS-002).

**Results:** The policy is updated. If type, frequency, start date, end date, grace period or next premium due changed, the next due date is recomputed from the recorded payments.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You already have this policy saved for this insurer" | The new number or insurer collides with another saved policy | Check the number |
| "Could not update the policy" | Server error | Try again |

**Limitations:** The catalogue picker is shown only when adding; a PDF attached while editing is uploaded after the save. Status cannot be changed (see F-INS-001).

**How it works:** `PATCH /api/insurance/policies/:id` with only the fields sent. A new number is re-encrypted with a new fingerprint and last 4. Changing **Next premium due** moves `premiumsTrackedFrom`, so earlier unpaid premiums become "untracked" (treated as paid).

**Related features:** F-INS-002, F-INS-007.

**Sources:** @@W/components/insurance/PolicyFormDialog.tsx#Saved, ending@@, @@W/components/insurance/PolicyFormDialog.tsx#Change only if the insurer says otherwise@@, @@W/components/insurance/PolicyFormDialog.tsx#if (form.nextPremiumDue && (form.nextPremiumDue !== openedNextDue@@, @@A/services/insurance/insurance.service.ts#export async function updatePolicy@@, @@A/services/insurance/insurance.service.ts#const scheduleChanged@@

### Delete a policy <!-- F-INS-004 -->
**What it does:** Deletes a policy together with its premium payments and claims, after confirmation.

**Why it exists:** Removes a policy you no longer hold or added by mistake. Inferred from behavior.

**Where to find it:** Bin on a policy card (route `/insurance`) or the bin button (aria "Delete policy") on the policy page.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. On a card, click the bin. The card turns red and asks "Delete <insurer> — <plan>, with its premiums and claims?"
2. Click **Delete** (or **Keep it** to cancel). The toast "Policy deleted" appears.
3. On the policy page, the bin opens a browser confirmation "Delete this policy, with its premiums and claims?"; confirming returns you to `/insurance`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Deletes | Disabled while deleting |
| **Keep it** | Button | Cancels | Never |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The policy, its premium payments and claims are removed; reminders for it stop.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not delete the policy" | Server error | Try again |

**Limitations:** There is no undo.

**How it works:** `DELETE /api/insurance/policies/:id` after checking the policy is yours.

**Related features:** F-INS-001, F-INS-008.

**Sources:** @@W/pages/insurance/InsuranceListPage.tsx#with its premiums and claims?@@, @@W/pages/insurance/InsuranceDetailPage.tsx#Delete this policy, with its premiums and claims?@@, @@A/services/insurance/insurance.service.ts#export async function deletePolicy@@

### Show the full policy number <!-- F-INS-005 -->
**What it does:** Policy numbers are shown masked as "●●●● 1234". The eye button fetches and shows the full number; clicking again hides it.

**Why it exists:** The number is needed when calling the insurer, but is kept encrypted and masked by default; each reveal is logged. Stated in code comments.

**Where to find it:** On each policy card and in the header of the policy page (**Policy no.**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the eye button (label "Show policy number"). The full number appears.
2. Click it again ("Hide policy number") to mask it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Show policy number" / "Hide policy number" | Icon toggle | Reveals or hides | Disabled while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The number is shown only in that card or header; it is not cached. An audit log entry (`pii_view`) is written for each reveal.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No policy number is saved. Edit the policy to add it." | No number on file | Edit the policy and add it |
| "Could not show the policy number. Try again in a minute." | More than 5 reveals in a minute, or the number could not be decrypted | Wait a minute; if it persists the server key may have changed (operator) |

**Limitations:** At most 5 reveals per minute per account.

**How it works:** `POST /api/insurance/policies/:id/reveal`, rate-limited to 5 per minute per user; the server decrypts, writes an `AuditLog` row with action `pii_view`, and replies with `Cache-Control: no-store`. A legacy plaintext number is encrypted on the way.

**Related features:** F-INS-001, F-INS-008.

**Sources:** @@W/components/insurance/PolicyNumberReveal.tsx#const NOT_SAVED_MSG@@, @@W/components/insurance/PolicyNumberReveal.tsx#Could not show the policy number@@, @@A/routes/insurance.routes.ts#piiLimiter, asyncHandler(revealPolicyNumberHandler)@@, @@A/middleware/rateLimit.ts#export const piiLimiter@@, @@A/services/insurance/insurance.service.ts#action: 'pii_view'@@

### Coming up and recording a premium payment <!-- F-INS-006 -->
**What it does:** The **Coming up** panel lists active policies with a premium due within 30 days or overdue, most at risk first, each with what to do and a **Record payment** button. With nothing urgent it says "Nothing due in the next 30 days." and names the next premium. **Record payment** opens **Record premium payment**, prefilled with today's date, the policy's premium and the period of the premium that is next due.

**Why it exists:** Shows "Premiums due within 30 days, and anything overdue" — the same list the daily reminders are drawn from (code comment).

**Where to find it:** **Asset Classes → Insurance**, **Coming up** panel; also the banner **Record payment** on a policy page when a premium is urgent.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Read each row: insurer and plan, a status line (for example "Due in 12 days", "Premium due today", "Overdue — 5 days of grace left", "May have lapsed", "Cover has ended") and a sentence of what to do.
2. Click **Record payment**. **Record premium payment** opens prefilled.
3. Check **Paid on**, **Amount (₹)**, **Covers from** and **Until**; click **Record payment**. The toast "Premium recorded" appears and the row leaves the panel once the premium is covered.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Policy name link | Link | Opens the policy page | Never |
| **Record payment** | Button | Opens **Record premium payment** | Never |
| **Cancel** | Button | Closes the dialog | Never |
| **Record payment** (dialog) | Button | Saves; "Saving…" | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Paid on** | Date | Yes | — | Today | "Required" (not displayed under the field; the dialog just doesn't save) |
| **Amount (₹)** | Text | Yes | Digits with optional decimals | The policy's premium | "Enter the amount paid, like 25000" |
| **Covers from** | Date | Yes | — | The due date of the next premium | "Required" (not displayed) |
| **Until** | Date | Yes | Not before **Covers from** | **Covers from** + one premium period | "Ends before it starts" |

**Settings and toggles here:** None.

**Results:** A premium payment is saved and the policy's next due date moves to the next unpaid premium. Reminders already sent for the paid premium are not repeated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not record the payment" | Server error | Try again |
| The premium still shows as due after recording | The payment's **Covers from** month differs from the due date's month, so it was not matched to that premium | Record it with **Covers from** in the due month, or use **Mark paid** in the schedule (F-INS-007) |

**Limitations:** Only active policies appear. The "Required" errors for **Paid on** and the period dates are set but not shown under those fields.

**How it works:** States come from the shared premium rules: **Due soon** within 30 days (red at 7 days or fewer), **In grace** after the due date until the grace period ends, **Lapse risk** after that (or immediately for a policy with no grace). Sorting: lapse risk, in grace, due soon, then by due date. Saving calls `POST /api/insurance/policies/:id/premiums`; the server stores the payment and recomputes `nextPremiumDue` in the same transaction.

**Related features:** F-INS-007, F-INS-022.

**Sources:** @@W/components/insurance/ComingUpPanel.tsx#export function ComingUpPanel@@, @@W/components/insurance/ComingUpPanel.tsx#Premiums due within 30 days, and anything overdue@@, @@W/lib/insurance.ts#export function premiumDueMeta@@, @@W/lib/insurance.ts#export function nextPremiumPrefill@@, @@W/components/insurance/RecordPremiumDialog.tsx#function validate@@, @@S/insurance/premiumSchedule.ts#export const DUE_SOON_DAYS = 30;@@, @@A/services/insurance/insurance.service.ts#export async function addPremiumPayment@@

### Premium schedule <!-- F-INS-007 -->
**What it does:** The **Premiums** card on a policy page lists every premium from the start date to the next three upcoming ones (newest first, first 12 shown), each with due date, period, amount and status **Paid <date>**, **Not recorded** (overdue) or **Upcoming**, plus payments that don't line up with any due date under **Other recorded payments**. The header totals what is recorded and counts overdue premiums; it also states the grace period.

**Why it exists:** "Every premium, paid or not, from the same shared schedule the server uses for reminders — so this table and the 'next due' everywhere else agree." (code comment)

**Where to find it:** Policy page (route `/insurance/:id`), **Premiums** card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open a policy. Scroll to **Premiums**.
2. Click **Mark paid** on a row to record that premium (opens **Record premium payment** prefilled with that row's period), or **Record** in the header for any payment.
3. Click the bin on a paid row to remove that payment (no confirmation). The toast "Payment removed" appears.
4. Click **Show all N** / **Show fewer** to expand the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Record** | Button | Opens **Record premium payment** (empty period) | Never |
| **Mark paid** | Button | Opens it prefilled for that row | Shown on unpaid rows |
| Bin (aria "Remove the payment for <date>") | Button | Deletes that payment | Disabled while removing |
| **Show all N** / **Show fewer** | Button | Toggles the list length | Shown with more than 12 rows |
| **What the grace period means** | Link | Opens `/insurance/help#grace-period` | Shown for non-single premiums |
| **IRDAI rules** | Link | Opens the regulator's circular | Shown when the grace period is the default |

**Fields and rules:** Not applicable — see F-INS-006 for the payment dialog.

**Settings and toggles here:** S-INS-003 (premiums due before it show as "earlier premium … aren't tracked here and count as paid"); S-INS-004 grace period.

**Results:** Recording or removing a payment changes the policy's next due date and its reminders.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not remove the payment" | Server error | Try again |
| A payment appears under **Other recorded payments** | Its **Covers from** month matches no due date | Remove it and record it with the right period |

**Limitations:** A payment is matched to a due date only when its **Covers from** falls in the same calendar month. A single-premium policy shows only the payments recorded. At most 600 rows are generated.

**How it works:** Due dates are counted from the start date (start + n × 1, 3, 6 or 12 months; a 31st start date is clamped per month, not drifting). No premium falls due on or after the end date. Unpaid premiums before **Next premium due** (as first entered) are "untracked" and treated as paid. Default grace: 30 days for life and health policies paid in instalments, 15 days if monthly, none for single premiums and other policy types; your **Grace period (days)** overrides it. The page builds the schedule from all payments returned by `GET /api/insurance/policies/:id`.

**Related features:** F-INS-006, F-INS-022, F-INS-016.

**Sources:** @@W/components/insurance/PremiumScheduleCard.tsx#const SHOW_FIRST = 12;@@, @@W/components/insurance/PremiumScheduleCard.tsx#Other recorded payments@@, @@W/components/insurance/PremiumScheduleCard.tsx#Mark paid@@, @@S/insurance/premiumSchedule.ts#export function buildPremiumSchedule@@, @@S/insurance/premiumSchedule.ts#iso10(p.periodFrom).slice(0, 7) === dueDate.slice(0, 7)@@, @@S/insurance/premiumSchedule.ts#export function defaultGraceDays@@, @@A/services/insurance/insurance.service.ts#export async function removePremiumPayment@@

### Policy page <!-- F-INS-008 -->
**What it does:** Shows one policy in full: a certificate-style header (insurer, plan, type, policyholder, **Sum assured** or **Cover**, masked policy number), an urgent banner when a premium is due soon or overdue, key facts (**Premium**, **Next premium**, **Started**, **Matures** / **Cover ends**, **Grace period**, **Critical illness**, linked **Vehicle**), the catalogue brief when the plan is recognised, **Nominees**, **Who to call**, **Claims**, **Health cover** (health policies with details on file), **From your imported statements**, **Premiums**, **Surrender value** (savings policies) and **Policy documents**.

**Why it exists:** One place to find cover, what's due, nominees and claim contacts for a policy. Inferred from the page's sections.

**Where to find it:** Click a policy card on **Asset Classes → Insurance** (route `/insurance/:id`). `/insurance/:id#claims` scrolls to **Claims**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click a policy card. The page loads (grey placeholders while loading).
2. Use **All policies** to go back, **Edit** to edit (F-INS-003), the bin to delete (F-INS-004).
3. If a premium is urgent, click **Record payment** in the banner.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All policies** | Link | Back to `/insurance` | Never |
| **Edit** | Button | Opens **Edit policy** | Never |
| Bin (aria "Delete policy") | Button | Deletes after confirmation | Disabled while deleting |
| **Record payment** (banner) | Button | Opens **Record premium payment** for the next premium | Shown when the premium is due soon, in grace or at lapse risk |
| Vehicle link | Link | Opens `/vehicles/:id` | Shown when a vehicle is linked |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Policy not found. Back to your policies" | Wrong id, or the policy was deleted / belongs to someone else | Use the link back |

**Limitations:** The **Health cover** panel (members, room rent, co-pay, pre-existing wait, sub-limits) appears only when health-cover details are on file, and no screen in this area sets them. A vehicle can be linked to a motor policy only from outside this module.

**How it works:** `GET /api/insurance/policies/:id` returns the policy with all premium payments and claims. The catalogue brief is shown when insurer and plan name match a catalogue product. The critical-illness hint shows when the catalogue lists critical illness as an add-on and your policy has it "Not recorded".

**Related features:** F-INS-003 to F-INS-016, D-INS-003, D-INS-004.

**Sources:** @@W/pages/insurance/InsuranceDetailPage.tsx#export function InsuranceDetailPage@@, @@W/pages/insurance/InsuranceDetailPage.tsx#function KeyFacts@@, @@W/pages/insurance/InsuranceDetailPage.tsx#function HealthCoverPanel@@, @@W/pages/insurance/InsuranceDetailPage.tsx#Policy not found.@@, @@W/pages/insurance/InsuranceDetailPage.tsx#location.hash === '#claims'@@, @@A/services/insurance/insurance.service.ts#export async function getPolicy@@

### Nominees <!-- F-INS-009 -->
**What it does:** The **Nominees** card lists who receives the money (name, relation, share and appointee for a minor). **Add** / **Edit** opens the **Nominees** dialog for up to 10 nominees.

**Why it exists:** "Without a nominee registered with the insurer, your family may need a succession or legal-heir certificate before a claim is paid." (card text)

**Where to find it:** Policy page (route `/insurance/:id`), **Nominees** card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

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

**Settings and toggles here:** S-INS-012 **Under 18**.

**Results:** Nominees are saved on the policy; the nominee warning on the Insurance page clears; the **Family insurance sheet** lists them.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save" | Server error or a server-side rule | Read the message; fix and save again |

**Limitations:** Recording a nominee here does not register it with the insurer.

**How it works:** Saved with `PATCH /api/insurance/policies/:id` (`nominees`). The server repeats the checks: at most 10 nominees, a relation for each, an appointee for a minor, shares all-or-none totalling 100.

**Related features:** F-INS-001, F-INS-020, F-INS-021.

**Sources:** @@W/components/insurance/NomineesCard.tsx#const RELATIONS@@, @@W/components/insurance/NomineesCard.tsx#function save()@@, @@W/components/insurance/NomineesCard.tsx#Add nominee@@, @@A/services/insurance/insurance.service.ts#const MAX_NOMINEES = 10;@@, @@A/services/insurance/insurance.service.ts#they need to total 100%@@

### Who to call <!-- F-INS-010 -->
**What it does:** The **Who to call** card holds your own contacts for the policy — **Insurer helpline**, **Claims email**, **Claims web page**, **TPA** and **TPA helpline** (health only), **Agent or advisor**, **Agent's phone**, **Agent's email** — and, for recognised insurers, the insurer's published directory (customer care, claim numbers, WhatsApp, emails, claim page, complaints) with when it was checked.

**Why it exists:** "The numbers someone needs in the moment they have to claim." (code comment)

**Where to find it:** Policy page (route `/insurance/:id`), **Who to call** card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add** (or **Edit**). The **Who to call** dialog opens.
2. Fill any fields; click save. The toast "Contacts saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** / **Edit** | Button | Opens the dialog | Never |
| Phone numbers | `tel:` links | Dial; 1800 numbers marked "toll-free", 1860 "charges apply" | — |
| Directory links | Links | Open the insurer's pages | Shown for recognised insurers |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Claims email**, **Agent's email** | Text | No | Valid email | Empty | "\"x\" isn't an email address." |
| **Claims web page** | Text | No | Must start with https:// | Empty | "The claims page should start with https://" |
| Other fields | Text | No | Up to 200 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** Contacts are saved and appear on the **Family insurance sheet** and in **Start a claim**.

**Errors and troubleshooting:** None beyond the field messages.

**Limitations:** The directory covers only insurers in the built-in list; its numbers are as checked on the stated date.

**How it works:** `PATCH /api/insurance/policies/:id` (`contacts`; null when all empty). The directory is matched from the insurer name.

**Related features:** F-INS-011, F-INS-020.

**Sources:** @@W/components/insurance/ContactsCard.tsx#const FIELDS@@, @@W/components/insurance/ContactsCard.tsx#function save()@@, @@W/components/insurance/ContactsCard.tsx#function InsurerDirectory@@, @@W/lib/insurerContacts.ts#export function insurerContactFor@@, @@W/lib/insurerContacts.ts#export function phoneKind@@

### Start a claim <!-- F-INS-011 -->
**What it does:** **Start a claim** asks "What happened?" with the claim kinds that fit the policy type, shows who to tell first (your saved helpline or the insurer's customer-care line), the step-by-step guide, documents checklist and rules, then records the claim to track it.

**Why it exists:** "Pick what happened, read what to do and what to gather, then start tracking it (the insurer still has to be told — this says how)." (code comment)

**Where to find it:** Policy page (route `/insurance/:id`), **Claims** card → **Start a claim**, or a kind button under "Nothing claimed on this policy."

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Start a claim**. Pick a kind (for example **Cashless hospitalisation**, **Reimbursement**, **Death claim**, **Maturity or survival benefit**, **Accident damage to your vehicle**, **Vehicle stolen**, **Home and contents**, **Accident — injury, disability or death**, **Travel**) or **Something else**. A policy with one fitting kind skips this step.
2. Read "First, tell <insurer>." and the guide.
3. Under **Track it here**, fill **Reported to the insurer on**, **Claim number** (optional), **What for** and **Amount claimed (₹)**.
4. Click **Start tracking**. The toast "Claim started — track it under Claims" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Kind tiles / **Something else** | Buttons | Choose the claim kind | — |
| **Choose a different kind of claim** | Button | Back to the kinds | Shown when more than one kind fits or for Something else |
| Helpline link | `tel:` link | Calls the insurer | Shown when a number is known |
| **Start tracking** | Button | Saves; "Saving…" | Hidden until a kind is chosen; disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Reported to the insurer on** | Date | Yes | — | Today | "Add the date you reported the claim" |
| **Claim number** | Text | No | Up to 100 | Empty | — |
| **What for** | Text | Yes | Up to 200 | The guide's title | "Say what the claim is for" |
| **Amount claimed (₹)** | Text | Yes | Digits with optional decimals | Empty | "Enter the amount you're claiming, like 85000" |

**Settings and toggles here:** None.

**Results:** A claim with status **Reported** is added and tracked (F-INS-012); follow-up reminders start (F-INS-022).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not start the claim" | Server error | Try again |

**Limitations:** Recording a claim here does not file it with the insurer.

**How it works:** `POST /api/insurance/policies/:id/claims` with `status: SUBMITTED` and the chosen kind. Guides and time limits come from the shared claims guide (for example a cashless or reimbursement health claim must be settled within 15 days of the claim being submitted; a death claim within 15 days, or 45 days if investigated; motor and home claims: survey report within 15 days of the surveyor's appointment, decision within 7 days).

**Related features:** F-INS-010, F-INS-012, F-INS-021.

**Sources:** @@W/components/insurance/StartClaimDialog.tsx#export function StartClaimDialog@@, @@W/components/insurance/StartClaimDialog.tsx#function start()@@, @@W/components/insurance/StartClaimDialog.tsx#Something else@@, @@W/components/insurance/ClaimsSection.tsx#Start a claim@@, @@S/insurance/claimsGuide.ts#export const CLAIM_GUIDES@@, @@S/insurance/claimsGuide.ts#export function guidesForPolicyType@@, @@A/services/insurance/insurance.service.ts#export async function addClaim@@

### Claim tracker <!-- F-INS-012 -->
**What it does:** Each claim on the policy page shows what is claimed, when it was reported and its status; a "next" box (**Waiting — until <date>**, **Waiting on the insurer**, **Next: raise a complaint**, **Next: the Insurance Ombudsman**, **Settled**, **Nothing to do**) with the reason; milestones; the escalation steps when relevant; the documents checklist with "N of M ready"; the guide's steps and rights on demand; and a **Notes** log. Settled claims fold under "N settled claim(s)".

**Why it exists:** To give "a nudge if the insurer runs past its time limit" (Claims card text) and keep a record of the claim.

**Where to find it:** Policy page (route `/insurance/:id`), **Claims** card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Tick documents in the checklist as you gather them (saved at once).
2. Add a note: pick its date, type it, click **Add note**.
3. Click **Update** to change status and dates in **Update claim**; click **Save**. The toast "Claim updated" appears.
4. Click the bin to remove a claim; confirm "Remove this claim and its notes?". The toast "Claim removed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Update** | Button | Opens **Update claim** | Never |
| Bin (aria "Remove the <type> claim") | Button | Removes after confirmation | Disabled while removing |
| Checklist boxes | Checkboxes | Mark documents ready | Disabled while saving; shown for claims with a known kind |
| **Show / Hide the steps and your rights** | Toggle | Shows the guide | Shown for claims with a known kind |
| **Add note** | Button | Appends a dated note | Disabled with an empty note |
| **Your complaint rights, in full** | Link | Opens the help library | In the escalation panel |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Status** | Select: Reported, Under review, Approved, Rejected, Settled | Yes | — | Current | — |
| **Claim number** | Text | No | Up to 100 | Current | — |
| **Every document submitted on** | Date | No | — | — | — |
| **Surveyor appointed on** | Date | No | Motor/home claims | — | — |
| **Amount paid (₹)** | Text | No | Digits | — | "Enter the amount paid, like 85000" |
| **Paid / decided on** | Date | No | — | — | — |
| **Reason given** | Text | No | Up to 1000 | — | — |
| **Complaint to insurer on**, **Complaint reference**, **Filed with Ombudsman on**, **Ombudsman reference** | Date / text | No | References up to 100; complaint dates not before the claim | — | "The complaint can't be dated before the claim" / "The Ombudsman complaint can't be dated before the claim" |
| Note | Date + text | Text required | Up to 500 characters; at most 200 notes | Today | "A claim can keep up to 200 notes" |

**Settings and toggles here:** None.

**Results:** Status, dates and notes are saved; the "next" action and reminders follow them. Settled in full moves the claim into the folded list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not update the claim" / "Could not save" | Server rule or error | Read the message |

**Limitations:** A claim recorded with **Something else** has no checklist, guide or time limit.

**How it works:** `PATCH /api/insurance/claims/:claimId` and `DELETE /api/insurance/claims/:claimId`. Progress is computed by the shared `claimProgress`: decision due = clock start + the kind's days (clock starts at the claim date, the "every document submitted" date, or the surveyor date plus 1 day by default); short payment = settled amount below claimed. After a complaint, the insurer must reply within 14 days; after 30 days you can go to the Ombudsman, for claims up to ₹50 lakh.

**Related features:** F-INS-011, F-INS-013, F-INS-022, F-INS-021.

**Sources:** @@W/components/insurance/ClaimTracker.tsx#const STATUS_LABELS@@, @@W/components/insurance/ClaimTracker.tsx#export function ClaimTracker@@, @@W/components/insurance/ClaimTracker.tsx#Remove this claim and its notes?@@, @@W/components/insurance/ClaimTracker.tsx#Add note@@, @@W/components/insurance/ClaimsSection.tsx#settled claim@@, @@S/insurance/claimsGuide.ts#export function claimProgress@@, @@S/insurance/claimsGuide.ts#export const ESCALATION@@, @@A/services/insurance/insurance.service.ts#const MAX_LOG_ENTRIES = 200;@@, @@A/services/insurance/insurance.service.ts#The complaint can't be dated before the claim@@

### Claims in progress <!-- F-INS-013 -->
**What it does:** On the Insurance page, lists every claim not yet closed across all policies, those needing a push first (Ombudsman, then complaint, then waiting), with the next-step reason and amount claimed. Hidden when there are none.

**Why it exists:** "Every claim still in progress, those needing a push first." (code comment)

**Where to find it:** **Asset Classes → Insurance**, **Claims in progress** panel.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

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

**Related features:** F-INS-012.

**Sources:** @@W/components/insurance/OpenClaimsPanel.tsx#export function OpenClaimsPanel@@, @@W/components/insurance/OpenClaimsPanel.tsx#Claims in progress@@

### Tax on your premiums <!-- F-INS-014 -->
**What it does:** A foldable card that works out what the premiums recorded in a financial year are worth under the Income-tax Act, 2025, old regime only: **Life insurance · section 123** (counts towards the ₹1,50,000 limit shared with PF, PPF, ELSS and the rest of Schedule XV, with a per-policy cap of 10% of the sum assured — 20% for policies issued before 1 April 2012), **Health insurance · section 126** (₹25,000 for you, spouse and children and a further ₹25,000 for parents; ₹50,000 each when senior citizen), and **Tax-free payout · Schedule II** verdicts for whole life, ULIP and endowment policies. Folded, the header says "You can claim ₹X in FY <year> — old regime only".

**Why it exists:** "What the premiums recorded in a financial year are worth at tax time" (code comment); each rule links to the Act.

**Where to find it:** **Asset Classes → Insurance**, **Tax on your premiums** card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the card title to open or fold it (remembered on this device).
2. Pick the financial year in the **Financial year** select (current and two earlier years).
3. For each health policy, choose who it covers (**You, spouse and children** / **Your parents**) and tick **Senior citizen (60+)** where it applies; changes save at once.
4. Open **The rules we used** to read each rule with its source.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card title button | Toggle | Opens/folds the card | — |
| **Financial year** | Select | Chooses FY | — |
| "Who <policy> covers" | Select: Not set, You, spouse and children, Your parents | Sets the tax bucket | Disabled while saving |
| **Senior citizen (60+)** | Checkbox | Raises the limit | Disabled while saving |
| **The rules we used** | Disclosure | Lists rules and sources | — |

**Fields and rules:** The server only accepts a tax bucket or senior-citizen flag on a health policy ("Only a health policy counts towards the health-insurance deduction").

**Settings and toggles here:** S-INS-008 **Who the policy covers**; S-INS-009 **Senior citizen (60+)**; S-INS-010 card open state (this device only).

**Results:** The bucket and senior flag are saved on the policy; the summary recalculates.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Premiums paid before 1 April 2026 fall under the Income-tax Act, 1961, which this summary doesn't work out." | A financial year before 2026-27 is selected | Pick 2026-27 or later |
| "Say who each policy covers to count it." | A health policy has no bucket | Set it |
| "Couldn't load the tax summary." | Request failed | Reload |

**Limitations:** Only premiums recorded in EveryPaisa count. Health premiums paid for several years at once are split equally over the years covered. Earlier financial years than 2026-27 are not computed.

**How it works:** `GET /api/insurance/tax-summary?fy=` runs the shared `buildTaxSummary` over your policies and payments. Rules checked on 11 Sep 2026. Aggregate limits for tax-free payouts: ULIPs issued from 1 Feb 2021 ₹2,50,000 a year; other policies issued from 1 Apr 2023 ₹5,00,000 a year.

**Related features:** F-INS-006, F-INS-016.

**Sources:** @@W/components/insurance/TaxSummaryCard.tsx#const OPEN_KEY@@, @@W/components/insurance/TaxSummaryCard.tsx#const YEARS_SHOWN = 3;@@, @@W/components/insurance/TaxSummaryCard.tsx#function HealthRow@@, @@S/insurance/tax.ts#export const LIFE_DEDUCTION_LIMIT@@, @@S/insurance/tax.ts#export const HEALTH_LIMIT@@, @@S/insurance/tax.ts#Premiums paid before 1 April 2026@@, @@A/services/insurance/insurance.service.ts#Only a health policy counts towards the health-insurance deduction@@

### Surrender value <!-- F-INS-015 -->
**What it does:** For whole life, endowment and ULIP policies, records the insurer's surrender quote (**Quoted value (₹)**, **Quoted on**) and compares it with the premiums recorded: **You'd lose**, **You'd get back more by** or **Difference**, with the percentage. Also shows ULIP lock-in or first-year timing and IRDAI's surrender rules.

**Why it exists:** To weigh surrendering a savings policy against what has been paid. Stated in the code comment.

**Where to find it:** Policy page (route `/insurance/:id`), **Surrender value** card (hidden for other types).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add quote** (or **Update quote**).
2. Enter **Quoted value (₹)** and **Quoted on**; click **Save**. The toast "Surrender value saved" appears.
3. **Remove** clears the quote.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add quote** / **Update quote** | Button | Opens the form | Hidden while editing |
| **Save** / **Cancel** / **Remove** | Buttons | Save, close, clear | Remove shown only with a quote |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Quoted value (₹)** | Text | Yes | Digits, up to 2 decimals; commas stripped | Current | "Enter the amount the insurer quoted, like 185000" |
| **Quoted on** | Date | Yes | Not in the future | Today | "The quote can't be dated in the future" |

**Settings and toggles here:** None.

**Results:** The quote is stored on the policy.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save the surrender value" | Server error or rule | Read the message |

**Limitations:** "Premiums recorded" counts only payments in EveryPaisa; untracked earlier premiums are noted but not added.

**How it works:** `PATCH /api/insurance/policies/:id` with `surrenderValue` and `surrenderValueAsOf`; the server refuses a value on other policy types ("Only whole life, endowment and ULIP policies have a surrender value").

**Related features:** F-INS-007.

**Sources:** @@W/components/insurance/SurrenderValueCard.tsx#export function SurrenderValueCard@@, @@W/components/insurance/SurrenderValueCard.tsx#const submit = () => {@@, @@A/services/insurance/insurance.service.ts#Only whole life, endowment and ULIP policies have a surrender value@@

### Premiums from imported statements <!-- F-INS-016 -->
**What it does:** The **From your imported statements** card lists premiums found in imported insurance statements that may belong to this policy, matched by **Same policy number** or **Same insurer, similar amount**. **Link** records the payment against the premium it covers; **Not this policy** stops suggesting it here. Hidden when there is nothing to review.

**Why it exists:** To bring statement premiums into the schedule without retyping; only exact policy-number matches are linked automatically on import (code comment).

**Where to find it:** Policy page (route `/insurance/:id`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Read each suggestion (amount, paid date, source, match reason, "for the premium due <date>").
2. Click **Link** (toast "Payment recorded on this policy") or **Not this policy** (toast "It won't be suggested for this policy again").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Link** | Button | Records the payment | Disabled while busy |
| **Not this policy** | Button | Dismisses | Disabled while busy |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A premium payment is created (once per imported transaction) or the suggestion is dismissed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not link the payment" / "Could not dismiss it" | Server error | Try again |

**Limitations:** At most 500 imported premiums are considered per policy page. Matching by insurer uses an amount within ±5%.

**How it works:** `GET /api/insurance/policies/:id/import-suggestions`, `POST …/import-suggestions/link` and `…/dismiss`. Statement premiums are stored as insurance transactions by the importer (D-INS-005).

**Related features:** F-INS-007, F-INS-014, D-INS-005.

**Sources:** @@W/components/insurance/ImportedPremiumsCard.tsx#const MATCHED_BY@@, @@W/components/insurance/ImportedPremiumsCard.tsx#Not this policy##2@@, @@A/services/insurance/insuranceExtras.service.ts#const AMOUNT_TOLERANCE@@, @@A/services/insurance/insuranceExtras.service.ts#const MAX_IMPORTED = 500;@@, @@A/services/insurance/insuranceExtras.service.ts#export async function listImportSuggestions@@

### Find my insurance documents in Gmail <!-- F-INS-017 -->
**What it does:** A per-Gmail-account permission. Turned on, EveryPaisa searches that inbox only for emails from insurers, or with an insurance subject such as "policy document" or "premium receipt", that have a PDF attached, and collects policy documents, premium receipts, renewal notices and claim letters. Each account shows "Off", "Searching… N document(s) found so far", "On · last searched <date>" or "Last search failed: …". **Scan now** starts a search immediately.

**Why it exists:** To fill in policies and premiums from the insurer's own documents, with explicit permission: "Nothing else in your inbox is read. You can turn it off at any time." (card text)

**Where to find it:** **Asset Classes → Insurance**, **Find my insurance documents in Gmail** card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a Gmail account connected (D-INS-006).

**Steps**
1. If no Gmail account is connected, click **Connect Gmail first** (goes to `/ingestion`).
2. Click **Turn on** for an account. The toast "Searching your Gmail for insurance documents" appears and the first search looks back three years.
3. Click **Scan now** to search again; the line updates every 5 seconds while running.
4. Click **Turn off** to stop (toast "Insurance search turned off"); any search in progress is cancelled.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail first** | Link | Opens `/ingestion` | Shown with no Gmail account |
| **Turn on** / **Turn off** | Button | Gives or withdraws permission | Disabled while saving |
| **Scan now** | Button | Starts a search | Shown when on; disabled while a search runs |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-INS-006 **Find my insurance documents in Gmail** (per account).

**Results:** Found PDFs are read and matched (F-INS-018). Each change of permission is written to the audit log. With permission on, a nightly search runs at 05:30 IST.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not change the setting" / "Could not start the search" | Server error, or the account is no longer active | Reconnect Gmail |
| "Insurance search is not turned on for this account" | Scan requested with permission off | Turn it on first |

**Limitations:** Only Gmail accounts connected through Google sign-in are listed.

**How it works:** `GET /api/insurance/gmail-fetch`, `PUT /api/insurance/gmail-fetch/:mailboxId` (`enabled`), `POST …/scan`. A search is an INSURANCE-kind Gmail scan job; later searches start where the last completed one ended (overlapping by a day). Nightly at 05:30 IST (`ENABLE_INSURANCE_CRONS`), for each permitted account, waiting documents are retried and a new search starts.

**Related features:** F-INS-018, D-INS-006.

**Sources:** @@W/components/insurance/InsuranceGmailFetchCard.tsx#Find my insurance documents in Gmail@@, @@W/components/insurance/InsuranceGmailFetchCard.tsx#Connect Gmail first@@, @@A/services/insurance/insuranceGmailFetch.service.ts#const FIRST_SCAN_YEARS = 3;@@, @@A/services/insurance/insuranceGmailFetch.service.ts#export async function setInsuranceFetch@@, @@A/services/insurance/insuranceGmailFetch.service.ts#export async function runInsuranceFetchForAll@@, @@A/jobs/insuranceJobs.ts#'30 5 * * *'@@

### Insurance documents from Gmail <!-- F-INS-018 -->
**What it does:** Shows what the Gmail search found and what became of it: **Policies found (N)** to review and add, **Renewals to confirm (N)** with proposed changes, **Password protected** PDFs grouped by sender, **Needs your check (N)** for readings that didn't match the document, and **All documents (N)** folded. Premium receipts and claim letters for a policy you have are recorded on it automatically.

**Why it exists:** "Premium receipts and claim letters are recorded on the matching policy. A policy that isn't here yet is suggested below — check it, then add it." (card text)

**Where to find it:** **Asset Classes → Insurance**, **Insurance documents from Gmail** card (hidden with no documents).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

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

**Settings and toggles here:** S-INS-007 **Remember it (encrypted) for future PDFs**.

**Results:** Approved documents create policies; linked receipts create premium payments (unless already recorded); claim letters create or advance claims; renewals update premium, sum assured, end date or next due date; linked documents are filed into Documents.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not open the PDF" | Wrong password, or too many attempts (rate-limited like personal data reveals) | Check the insurer's email for the password; wait a minute |
| "This renewal notice was already answered" / "has nothing left to change" | Answered already | None |
| "This document is linked to a policy" | Tried to dismiss a linked document | None |

**Limitations:** Reading uses an AI model on a redacted copy of the text and needs the operator's model key; when the monthly reading budget is reached, documents stay "Not read yet." and are retried nightly. A document whose reading doesn't match its text is never applied automatically.

**How it works:** Each found PDF becomes an insurance document read by a language model; every amount, date, policy number and name must appear in the PDF text or the document goes to **Needs your check**. Matching is by policy-number fingerprint. Only the latest renewal notice of a policy proposes changes, and end date and next due date only move later. Endpoints: `GET /api/insurance/documents`, `POST …/:docId/approve|dismiss|password|renewal`.

**Related features:** F-INS-002, F-INS-017, D-INS-003.

**Sources:** @@W/components/insurance/InsuranceDocumentsCard.tsx#export function InsuranceDocumentsCard@@, @@W/components/insurance/InsuranceDocumentsCard.tsx#function LockedGroup@@, @@W/components/insurance/InsuranceDocumentsCard.tsx#Renewals to confirm@@, @@W/components/insurance/PolicyFormDialog.tsx#Check each@@, @@A/services/insurance/insuranceDocPipeline.ts#READ            every field checked out@@, @@A/services/insurance/insuranceDocMatching.ts#export async function approveSuggestedPolicy@@, @@A/services/insurance/insuranceRenewal.ts#export async function answerRenewal@@, @@A/ingestion/insurance/insuranceDocReader.ts#A language model does the reading@@, @@A/routes/insurance.routes.ts#piiLimiter, asyncHandler(unlockInsuranceDocumentHandler)@@

### Coverage check <!-- F-INS-019 -->
**What it does:** Answers "Are you covered enough, and where are the gaps?" for four areas — **Life cover**, **Health cover**, **Vehicles**, **Home** — each with a verdict (**Covered**, **Short**, **Missing**, **Nothing to cover**, **Needs your figures**, or **Worth a look** for home), an explanation and a next step. Every figure is seeded from your data and editable; edits recompute on the spot and are not saved.

**Why it exists:** Stated in the page header: "Worked out from what you've recorded — change any figure below and the answer updates."

**Where to find it:** **Asset Classes → Insurance → Coverage check** (route `/insurance/coverage`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open **Coverage check**. Read the summary and **Also worth a look**.
2. In **Life cover**, adjust **Yearly income**, **Yearly household expenses**, **Years your family would need support**, **Loans outstanding**, the goals to fund and whether to count **Savings and deposits** and **Other investments**.
3. In **Health cover**, adjust **Health cover to compare against** and answer **Do your parents rely on you for their medical bills?** (**Yes**, **No**, **Not sure**).
4. Click a next step to add a policy or go to the linked page. **Use my recorded figures** resets your edits.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Use my recorded figures** | Button | Discards edits | Shown after an edit |
| **Policies** | Link | Back to `/insurance` | Never |
| Next-step buttons (for example **Add your income**, **Add its motor policy**) | Button/link | Opens **Add a policy** or a page | Per verdict |
| **Try again** | Button | Reloads after an error | Shown on error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Money fields | Text | No | Digits only | From your data | "Enter an amount in rupees using digits only, like 1200000." |
| **Years your family would need support** | Number | No | 0–60 | 20 | "Enter a number of years from 0 to 60." |
| **Health cover to compare against** | Text | No | Digits | ₹10,00,000 | as money fields |

**Settings and toggles here:** S-INS-011 Coverage assumptions (not saved).

**Results:** None saved. Adding a policy from a next step refreshes the check.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load your coverage. Check your connection and try again." | Request failed | **Try again** |
| Life verdict **Needs your figures** | No income, expenses, loans or goals | Add income (F-INC-002) or type figures |

**Limitations:** Edits are lost when you leave the page. **Add policy** next steps open an empty **Add a policy** form even when the step names a policy type. Rules of thumb (10× income, ₹10 lakh health benchmark) are marked as such and are not advice.

**How it works:** `GET /api/insurance/coverage` returns facts — active income × 12, estimated spending, loans outstanding, liquid and other investments, life and health cover, goals with amount still to fund, health policies, vehicles with registration insurance expiry and linked motor policy, properties, home policies — and seeded defaults (support years 20, health benchmark ₹10,00,000, child-education goals ticked, both savings boxes ticked, parents "Not sure"). Life need = (expenses, or income, × support years) + loans + ticked goals − counted savings − counted investments, floored at 0; gap = need − life cover. The rule-of-thumb figure is 10 × yearly income.

**Related features:** F-INS-002, F-INC-001, F-GOAL-001, D-INS-004.

**Sources:** @@W/pages/insurance/CoveragePage.tsx#export function CoveragePage@@, @@W/pages/insurance/CoveragePage.tsx#const onAddPolicy = (_step: NextStep)@@, @@W/components/insurance/coverage/verdict.ts#export const VERDICT_LABELS@@, @@W/components/insurance/coverage/LifeCoverCard.tsx#Yearly income@@, @@W/components/insurance/coverage/fields.tsx#Enter a number of years from 0 to 60.@@, @@S/insurance/coverage.ts#export const LIFE_COVER_INCOME_MULTIPLE = 10;@@, @@S/insurance/coverage.ts#export const DEFAULT_SUPPORT_YEARS = 20;@@, @@S/insurance/coverage.ts#export function defaultAssumptions@@, @@S/insurance/coverage.ts#function checkLife@@, @@A/services/insurance/insuranceCoverage.service.ts#Every number comes from the service that already owns it@@

### Family insurance sheet <!-- F-INS-020 -->
**What it does:** One printable page of your active policies grouped as **Life cover**, **Health cover** and **Other cover**: for each, the cover, type, **Policyholder**, **Policy number** (last 4 only), **Nominee**, **To claim** contacts, **Agent**, **Premium** and **Matures** / **Cover ends**.

**Why it exists:** "Everything your family needs to make a claim, on one page. Print it and keep it with your important papers." (page description)

**Where to find it:** **Asset Classes → Insurance → Family sheet** (route `/insurance/emergency-sheet`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

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

**Related features:** F-INS-009, F-INS-010.

**Sources:** @@W/pages/insurance/EmergencySheetPage.tsx#export function EmergencySheetPage@@, @@W/pages/insurance/EmergencySheetPage.tsx#function SheetEntry@@, @@W/pages/insurance/EmergencySheetPage.tsx#Full policy numbers are in the policy documents@@

### Help and rights <!-- F-INS-021 -->
**What it does:** A searchable library of 16 topics in four groups — **Buying**, **Owning**, **Claiming**, **When things go wrong** — explaining what IRDAI's rules say you are owed (for example free-look period, grace period, nomination, lapse and revival, surrender, cashless, claim time limits, moratorium, complaints, mis-selling, unclaimed amounts), with the official source beside every rule.

**Why it exists:** Stated in the page header: "What the rules say you're owed when you buy, own and claim on a policy — in plain words, with the official source beside every rule."

**Where to find it:** **Asset Classes → Insurance → Help and rights** (route `/insurance/help`); links such as **What the grace period means**, **How nomination works** and **Your complaint rights, in full** open topics directly (`/insurance/help#<topic>`).

**Who can use it:** Every signed-in user.

**Steps**
1. Type in the search box ("Search — for example nominee, grace period, claim rejected"). The count of matching topics updates.
2. Use the contents list (on phones, **Jump to a topic**) to go to a topic.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Search (aria "Search help topics") | Text | Filters topics | — |
| Contents / **Jump to a topic** | Links | Scroll to a topic | Jump list only on small screens |
| **Policies** | Link | Back | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "No topics match "<query>". Try a simpler word, like "claim" or "nominee"."

**Limitations:** "IRDAI's rules, in plain words — not legal advice."

**How it works:** Static content from the shared help library; a `#topic` link clears a hiding search and scrolls to the topic.

**Related features:** F-INS-007, F-INS-009, F-INS-012.

**Sources:** @@W/pages/insurance/HelpLibraryPage.tsx#export function HelpLibraryPage@@, @@W/components/insurance/help/HelpSearch.tsx#Search — for example nominee@@, @@S/insurance/helpLibrary.ts#{ id: 'BUYING'@@, @@S/insurance/helpLibrary.ts#id: 'grace-period'@@

### Premium and claim reminders <!-- F-INS-022 -->
**What it does:** Creates alerts in **Alerts** for each active policy's next premium: 30, 15, 7 and 1 days before and on the due day ("<insurer> — <plan> premium due in N days", "… premium is due today"), during the grace period ("… premium overdue — N days of grace left", again in the last 5 days), and after it ("… may have lapsed" or, with no grace, "… cover has ended"). For claims, it alerts once when it is time to raise a complaint and once when you can take it to the Insurance Ombudsman.

**Why it exists:** "You'll get reminders before each premium" (empty-state text).

**Where to find it:** Alerts appear in **Alerts** (D-INS-001) and the alerts bell; there is no page of its own.

**Who can use it:** All signed-in users with active policies or open claims; R-MANAGER's managed person gets their own.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-INS-003 and S-INS-004 decide the dates.

**Results:** Alerts are created once per premium and step (keys carry the due date), so next year's premium gets fresh reminders.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Reminder for a premium you paid | The payment isn't recorded, or its period is in a different month | Record it (F-INS-006, F-INS-007) |

**Limitations:** Runs once a day at 20:45 IST; a skipped day is caught up (the nearest of 30/15/7/1 days is used). Policies due more than 120 days ago are no longer reminded. Matured or lapsed policies keep being reminded because the status can't be changed in the app.

**How it works:** The daily alert scan (`ENABLE_ALERT_CRONS`) runs `generateRenewalAlerts` and `generateClaimAlerts` per user under that user's database context. Alert types `INSURANCE_PREMIUM` and `INSURANCE_CLAIM`. An API route `POST /api/insurance/alerts/trigger` also creates today's premium reminders for the caller (no UI button).

**Related features:** F-INS-006, F-INS-012, D-INS-001.

**Sources:** @@A/services/insurance/insurance.service.ts#const UPCOMING_REMINDER_DAYS = [1, 7, 15, 30] as const;@@, @@A/services/insurance/insurance.service.ts#const FINAL_GRACE_DAYS = 5;@@, @@A/services/insurance/insurance.service.ts#const REMINDER_LOOKBACK_DAYS = 120;@@, @@A/services/insurance/insurance.service.ts#function reminderFor@@, @@A/services/insurance/insurance.service.ts#export async function generateClaimAlerts@@, @@A/services/notifications/alerts.service.ts#generateRenewalAlerts(userId),@@, @@A/jobs/alertJobs.ts#cron.schedule('45 20 * * *'@@

### Premiums matched from bank and payment emails <!-- F-INS-023 -->
**What it does:** When an approved email event of type "premium paid" is turned into a cash-flow entry, EveryPaisa tries to link it to one of your active policies and records the premium payment.

**Why it exists:** To mark premiums paid without manual entry. Stated in code comments.

**Where to find it:** The result appears in the policy's **Premiums** card (F-INS-007).

**Who can use it:** Users whose inbox events are approved (D-INS-007).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A premium payment dated today, covering the premium that was next due, linked to the email event.

**Errors and troubleshooting:** None shown; a failed match is logged only.

**Limitations:** The payment's **Paid on** is the day the event was processed, not the email's date. Matching needs the policy number in the event, or exactly one active policy whose insurer name matches and whose premium is within ±5% of the amount.

**How it works:** `hookAutoMatchPremiumPayment` is called by the projection pipeline after a PREMIUM_PAID event; policy number by fingerprint first, then insurer + amount.

**Related features:** F-INS-007, D-INS-007.

**Sources:** @@A/services/insurance/insurance.service.ts#async function tryMatchPremiumEvent@@, @@A/services/insurance/insurance.service.ts#export async function hookAutoMatchPremiumPayment@@, @@A/services/insurance/insurance.service.ts#paidOn: today,@@

### What this area doesn't do

- You can't change a policy's status (Lapsed, Surrendered, Matured, Claimed) from any screen.
- You can't enter health-cover details (members, room rent, co-pay, sub-limits) or link a vehicle from the policy form.
- Recording a claim, nominee or premium here doesn't notify the insurer.
- There is no bulk import of policies other than the Gmail search.
- Family view does not show other members' policies on these pages.

## PPF & EPF

The **PPF & EPF** page (sidebar **Asset Classes → PPF & EPF**, route `/provident-fund`, page title **Provident Fund**) tracks Public Provident Fund and Employees' Provident Fund money in two ways. **Manual entries** — contributions, interest credits, withdrawals and opening balances — are ordinary transactions that build the PPF and EPF holdings on the page. **Auto-fetch accounts** link an EPFO UAN or a PPF account at one of seven banks so the passbook can be pulled from the portal (server-side, with you typing the captcha and OTP), uploaded as a PDF, or sent by the EveryPaisa browser extension. The old addresses `/ppf` and `/epf` open this page. Nothing here is plan-gated.

### Provident Fund page and holdings <!-- F-PF-001 -->
**What it does:** Shows your PPF and EPF holdings across all portfolios with a summary strip (**Invested**, **Current value**, **Unrealised P&L**), the holdings, a **Transactions** table of every PPF and EPF entry (date, name, type, quantity, price, amount) with edit and delete, and below it the **Auto-fetch accounts (EPFO portal)** section (F-PF-005).

**Why it exists:** Page description: "Track your PPF and EPF balances, contributions, and interest".

**Where to find it:** **Asset Classes → PPF & EPF** (route `/provident-fund`; `/ppf` and `/epf` redirect here).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person. Family view does not add other members' entries.

**Steps**
1. Open **Asset Classes → PPF & EPF**. With nothing recorded, the empty state "No provident fund yet" offers **Add first entry**.
2. Click **Add** and choose **PPF entry** (F-PF-003) or **EPF entry** (F-PF-002).
3. Click the pencil on a transaction to edit it in its form; click the bin, then **Yes** at "Sure?" to delete it (**No** cancels).
4. Use the download button for a holdings report (D-PF-002).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** → **PPF entry** / **EPF entry** | Menu button | Opens the PPF or EPF form | Never |
| Download report button | Button | Holdings report for PPF and EPF (D-PF-002) | Never |
| Transaction edit / delete | Buttons | Edit in the matching form; delete after "Sure?" | — |

**Fields and rules:** Not applicable — see F-PF-002 and F-PF-003.

**Settings and toggles here:** None.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete" | Server error | Try again |
| Balance fetched from EPFO doesn't show in the holdings | Auto-fetched passbook rows are stored separately and don't create holdings (see F-PF-006) | Add an **Opening / current balance** entry manually |

**Limitations:** Holdings come only from manual entries; auto-fetched or uploaded passbooks don't change them. The transactions table shows up to 200 entries per asset class. PPF and EPF have no market price, so **Current value** comes from the shared asset-page rules (D-PF-001).

**How it works:** The page is the shared asset-class page configured with asset classes PPF and EPF and two entry forms; it reads each portfolio's holdings and `GET /api/transactions?assetClass=PPF|EPF` (200 per class). Holdings group entries by account number (UAN / PPF account number) when given, otherwise by the employer or bank name typed.

**Related features:** F-PF-002, F-PF-003, F-PF-005, D-PF-001, D-PF-002.

**Sources:** @@W/pages/assetClasses/ProvidentFundPage.tsx#export function ProvidentFundPage@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#{ label: 'PPF entry'@@, @@W/App.tsx#<Route path="/ppf"@@, @@W/App.tsx#<Route path="/epf"@@, @@W/pages/assetClasses/SimpleAssetPage.tsx#{ label: 'Invested'@@, @@W/pages/assetClasses/SimpleAssetPage.tsx#transactionsApi.list({ assetClass: ac, pageSize: 200 })@@, @@A/services/holdings/assetKey.ts#if (refs.isin && refs.isin.trim() !== '') return@@, @@A/priceFeeds/router.service.ts#case 'EPF':@@

### Add or edit an EPF entry <!-- F-PF-002 -->
**What it does:** The **Add EPF Entry** dialog records one EPF entry: employer, optional UAN, entry type (**Contribution (monthly)**, **Annual interest credit**, **Withdrawal / settlement**, **Opening / current balance**), date, amount, optional interest rate and notes. A second tab, **Auto-fetch (UAN)**, links the UAN for auto-fetch instead (F-PF-004).

**Why it exists:** Inferred from behavior: lets you keep an EPF balance without portal access.

**Where to find it:** **Asset Classes → PPF & EPF → Add → EPF entry**; editing: pencil on an EPF transaction.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add → EPF entry**. **Add EPF Entry** opens on **Manual entry** with entry type **Contribution (monthly)** and today's date.
2. Choose the **Portfolio**, fill **Employer Name**, optionally **UAN Number**.
3. Pick the **Entry Type**; the amount label changes (**Total Contribution (₹)**, **Interest Credited (₹)**, **Amount Withdrawn (₹)**, **Current Balance (₹)**) with a hint.
4. For **Annual interest credit**, optionally fill **Interest Rate Applied (% p.a.)**.
5. Click **Add EPF entry**. The toast "EPF entry added" appears.
6. When editing, **Delete** asks "Sure?" — **Yes, delete** removes it (toast "EPF entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manual entry** / **Auto-fetch (UAN)** | Tabs | Switch between entry and linking | Hidden when editing |
| **Entry Type** tiles | Radio | Choose entry type | — |
| **Add EPF entry** / **Save changes** | Button | Saves | Disabled while saving |
| **Delete** → **Yes, delete** / **Cancel** | Buttons | Deletes the entry | Edit only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Portfolio** | Select | Yes | — | First portfolio | "Select a portfolio" |
| **Employer Name** | Text | Yes | — | Empty | "Enter employer name" |
| **UAN Number** | Text | No | Free text | Empty | — |
| **Date** | Date | Yes | YYYY-MM-DD | Today | "Invalid date" |
| Amount | Number | Yes | 0 or more, 2 decimals | Empty | Zod default message |
| **Interest Rate Applied (% p.a.)** | Number | No | 0–20 in the box | Empty (placeholder 8.25) | — |
| **Notes** | Text area | No | — | Empty | — |

**Settings and toggles here:** S-PF-001 **Entry Type (EPF)**.

**Results:** A transaction of class EPF is saved (quantity 1, price = amount). Contributions and opening balances add to the EPF holding; withdrawals reduce it; interest credits are recorded as income but do not add to the holding.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / "Failed to delete" (or the server message) | Server rejected the entry | Read the message |

**Limitations:** The hint says "Interest at current EPF rate (8.25% for FY 2023-24)" — a fixed text, not looked up. Entries with and without a UAN for the same account become separate holdings.

**How it works:** `POST /api/transactions` (or `PATCH` / `DELETE /api/transactions/:id`) with asset class `EPF`, transaction type `DEPOSIT`, `INTEREST_RECEIVED`, `WITHDRAWAL` or `OPENING_BALANCE`, the UAN stored in the ISIN field. Holdings treat DEPOSIT and OPENING_BALANCE as additions and WITHDRAWAL as a reduction; INTEREST_RECEIVED is not an addition.

**Related features:** F-PF-001, F-PF-004, D-PF-003.

**Sources:** @@W/pages/assetClasses/EPFFormDialog.tsx#const TXN_LABELS@@, @@W/pages/assetClasses/EPFFormDialog.tsx#const AMOUNT_LABELS@@, @@W/pages/assetClasses/EPFFormDialog.tsx#const schema = z.object({@@, @@W/pages/assetClasses/EPFFormDialog.tsx#assetClass: 'EPF' as const@@, @@W/pages/assetClasses/EPFFormDialog.tsx#Auto-fetch (UAN)@@, @@A/services/holdings/holdingsProjection.ts#const BUY_TYPES@@, @@A/services/holdings/holdingsProjection.ts#const SELL_TYPES@@

### Add or edit a PPF entry <!-- F-PF-003 -->
**What it does:** The **Add PPF Entry** dialog records one PPF entry: bank / post office, optional PPF account number, entry type (**Annual / partial deposit**, **Yearly interest (31 Mar)**, **Partial / full withdrawal**, **Opening balance**, **Account matured (15 yr)**), date, amount, optional interest rate, optional account maturity date (for deposits) and notes. Its **Auto-fetch** tab links a PPF account instead (F-PF-004).

**Why it exists:** Inferred from behavior: lets you keep a PPF balance by hand.

**Where to find it:** **Asset Classes → PPF & EPF → Add → PPF entry**; editing: pencil on a PPF transaction.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add → PPF entry**. **Add PPF Entry** opens on **Manual entry**.
2. Choose **Portfolio**, fill **Bank / Post Office** (placeholder "e.g. SBI Branch, Andheri") and optionally **PPF Account Number**.
3. Pick **Entry Type**, **Date** and the amount (**Deposit Amount (₹)**, **Interest Credited (₹)**, **Amount Withdrawn (₹)**, **Current Balance (₹)** or **Maturity Proceeds (₹)**).
4. For interest, optionally fill **Interest / Return Rate (% p.a.)** (placeholder 7.10). For a deposit, optionally **Account Maturity Date**.
5. Click **Add PPF entry**. The toast "PPF entry added" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manual entry** / **Auto-fetch** | Tabs | Switch | Hidden when editing |
| **Add PPF entry** / **Save changes** | Button | Saves | Disabled while saving |
| **Delete** → **Yes, delete** | Buttons | Deletes | Edit only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Portfolio** | Select | Yes | — | First portfolio | "Select a portfolio" |
| **Bank / Post Office** | Text | Yes | — | Empty | "Enter account name" |
| **PPF Account Number** | Text | No | — | Empty | — |
| **Date** | Date | Yes | — | Today | "Invalid date" |
| Amount | Number | Yes | 0 or more | Empty | Zod default message |
| **Interest / Return Rate (% p.a.)** | Number | No | 0–30 in the box | Empty | — |
| **Account Maturity Date** | Date | No | Deposits only | Empty | — |

**Settings and toggles here:** S-PF-002 **Entry Type (PPF)**.

**Results:** A PPF transaction is saved. Deposits and opening balances add to the holding; withdrawals and maturity reduce it; interest credits don't add to it.

**Errors and troubleshooting:** "Failed to save" / "Failed to delete" or the server message.

**Limitations:** The rate hint "PPF rate: 7.1% p.a. for Q1 FY 2024-25" is fixed text.

**How it works:** Same transaction API as F-PF-002, asset class `PPF`, with `MATURITY` as an extra type. The same dialog file also serves NPS entries, documented in the NPS chapter (D-PF-003).

**Related features:** F-PF-001, F-PF-004.

**Sources:** @@W/pages/assetClasses/PPFNpsFormDialog.tsx#const CONFIG = {@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#'Account matured (15 yr)'@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#rateHint: 'PPF rate@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#export function PPFFormDialog@@

### Link a PF account for auto-fetch <!-- F-PF-004 -->
**What it does:** Registers an EPF UAN (institution EPFO) or a PPF account at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank or Bank of Baroda, so its passbook can be fetched. Available from **Link account** in the auto-fetch section (**Link PF Account** dialog), the EPF form's **Auto-fetch (UAN)** tab, and the PPF form's **Auto-fetch** tab.

**Why it exists:** "Connect an EPFO UAN or PPF account for auto-fetch." (dialog text)

**Where to find it:** **Asset Classes → PPF & EPF → Auto-fetch accounts (EPFO portal) → Link account**; or **Add → EPF entry → Auto-fetch (UAN)**; or **Add → PPF entry → Auto-fetch**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Link account**. **Link PF Account** opens with type **EPF**.
2. Choose **EPF** or **PPF**; for PPF pick the **Bank**.
3. Fill **UAN (12 digits)** or **PPF Account Number**, and **Holder Name**.
4. Click **Link Account**. The toast "Account linked" appears and the account is listed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **EPF** / **PPF** | Toggle buttons | Account type | — |
| **Bank** | Select | PPF bank | PPF only |
| **Link Account** (dialog) / **Link & enable auto-fetch** (EPF tab) / **Link PPF account** (PPF tab) | Button | Saves | Disabled until both fields are filled, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **UAN (12 digits)** | Text | Yes (EPF) | Exactly 12 digits | Empty | "UAN must be exactly 12 digits" |
| **PPF Account Number** | Text | Yes (PPF) | 8–17 digits | Empty | "PPF account number must be 8–17 digits" (PPF tab: "Enter 8–17 digit PPF account number") |
| **Holder Name** | Text | Yes | 1–100 characters | Empty | "Enter account holder name" (PPF tab) |

**Settings and toggles here:** S-PF-005 **Type / Bank**.

**Results:** A provident-fund account is saved with the identifier encrypted and only its last 4 digits readable. A second account with the same type, institution and number is refused.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to link account" or the server message | Validation or duplicate | Check the number |

**Limitations:** There is no way to unlink or delete a linked account in the app.

**How it works:** `POST /api/epfppf/accounts`. The asset key is `pf:epf:<hash>` or `pf:ppf:<bank>:<hash>` of the normalised identifier; it is unique per user. The links from the forms do not set a portfolio.

**Related features:** F-PF-005, F-PF-006.

**Sources:** @@W/pages/assetClasses/ProvidentFundPage.tsx#function AddPfAccountDialog@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#UAN must be exactly 12 digits@@, @@W/pages/assetClasses/EPFFormDialog.tsx#function AutoFetchForm@@, @@W/pages/assetClasses/PPFNpsFormDialog.tsx#const autoFetchSchema@@, @@A/controllers/pf.controller.ts#const CreateAccountSchema@@, @@A/services/pf/pfAccounts.service.ts#export function computePfAssetKey@@, @@P/schema.prisma#model ProvidentFundAccount {@@

### Auto-fetch accounts and refresh nudges <!-- F-PF-005 -->
**What it does:** Lists linked accounts (holder name, last 4 digits, type, institution, balance when known, last refresh date) with **Passbook** and **Refresh** buttons. An account not refreshed for 30 days or more, or never, gets a yellow banner ("Last refreshed N days ago — refresh to keep data current." / "Balance has never been refreshed — tap to fetch now.") with **Snooze 30d** and **Refresh now**.

**Why it exists:** Inferred from behavior: keeps fetched passbooks current.

**Where to find it:** **Asset Classes → PPF & EPF**, section **Auto-fetch accounts (EPFO portal)**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Read the list. With none: "No accounts linked yet. Click Link account to connect your EPFO UAN or PPF account."
2. Click **Snooze 30d** to hide the banner for 30 days (toast "Nudge snoozed for 30 days").
3. Click **Refresh** / **Refresh now** (F-PF-006) or **Passbook** (F-PF-007).
4. **Browser extension** opens the pairing page (F-PF-009).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Browser extension** | Link | Opens `/provident-fund/extension` | Never |
| **Link account** | Button | F-PF-004 | Never |
| **Snooze 30d** | Button | Snoozes the reminder | Banner only; disabled while saving |
| **Refresh now** / **Refresh** | Button | Opens **Refresh Provident Fund** | — |
| **Passbook** | Button | Opens **Upload Passbook PDF** | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-PF-004 **Snooze 30d**.

**Results:** Snoozing hides the banner and dismisses open "Refresh … account" alerts for that account until the snooze ends.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to snooze" | Server error | Try again |
| The section is missing | Loading the accounts failed (the section hides itself on error) | Reload |

**Limitations:** The balance shown is never filled by any fetch (see F-PF-006), so it normally doesn't appear.

**How it works:** `GET /api/epfppf/accounts` (newest first, with member IDs); `POST /api/epfppf/accounts/:id/snooze-nudge` (`days` 30; 1–365 accepted) sets the snooze date and dismisses unread refresh alerts.

**Related features:** F-PF-006, F-PF-007, F-PF-009, F-PF-010.

**Sources:** @@W/pages/assetClasses/ProvidentFundPage.tsx#const STALE_DAYS = 30;@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#function AutoFetchSection@@, @@W/pages/assetClasses/ProvidentFundPage.tsx#Balance has never been refreshed@@, @@A/controllers/pf.controller.ts#const SnoozeNudgeSchema@@, @@A/services/pf/pfNudges.service.ts#export async function snoozeNudge@@

### Refresh from the EPFO portal <!-- F-PF-006 -->
**What it does:** **Refresh Provident Fund** asks for the **UAN** and **Password**, starts a server-side fetch of the passbook, and relays the portal's captcha image and OTP to you to type in. When done it says "Imported N new entries."

**Why it exists:** To pull the passbook without downloading it yourself. Inferred from behavior.

**Where to find it:** **Asset Classes → PPF & EPF → Auto-fetch accounts → Refresh** (or **Refresh now**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Refresh**. Enter **UAN** (a hint appears if it isn't 12 digits: "Your UAN is 12 digits — not an email address. It is on your payslip.") and **Password**.
2. Optionally tick **Save credentials (encrypted)**.
3. Click **Start**. Progress shows the current step.
4. When asked, type the characters from the captcha image and click **Submit CAPTCHA**; then the OTP ("OTP sent via <channel>.") and **Submit OTP**.
5. On success: "Imported N new entries." — click **Close**. On failure the message shows with **Try again**.
6. Don't know the password? Click **Don't know your EPFO password?** (F-PF-008).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Save credentials (encrypted)** | Checkbox | Stores the UAN and password encrypted on the account | — |
| **Start** | Button | Starts the fetch | Disabled until UAN and password are filled |
| **Submit CAPTCHA** / **Submit OTP** | Buttons | Send your answer | Disabled with an empty box |
| **Try again** | Button | Back to the credentials | On error |
| **Don't know your EPFO password?** | Link | Opens the reset dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **UAN** | Text | Yes | Hint only for non-12-digit input | Empty | — |
| **Password** | Password | Yes | — | Empty | — |
| Captcha / OTP | Text | Yes | 1–64 characters | Empty | "Invalid body" (server) |

**Settings and toggles here:** S-PF-003 **Save credentials (encrypted)**.

**Results:** Passbook rows are stored as confirmed passbook events against the account, and the account's last refresh date and source are set. These events appear in the provident-fund statement report (D-PF-004) but do not create PPF/EPF transactions or holdings, and do not set the account balance.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not start this right now. Please try again in a minute." | The job queue is unavailable | Wait and retry |
| "Connection to server lost" | The live connection dropped | Try again |
| "PF account not found" | The account is gone | Reload |

**Limitations:** The fetched balance and entries don't reach the page's holdings or the account's balance field (see DOCUMENTATION_GAPS.md). Saved credentials are not reused by the dialog — it always asks again — and there is no button to delete saved credentials. The dialog labels the login **UAN** even for PPF bank accounts. Each attempt runs once (no automatic retry) and is stopped after 10 minutes.

**How it works:** `POST /api/epfppf/sessions` creates a fetch session and queues a job on the `pf-headless-fetch` queue (Redis); the worker runs the institution's scraper and streams `status`, `captcha_required`, `otp_required`, `completed` and `failed` events to `GET /api/epfppf/sessions/:id/events`; answers go to `…/captcha` and `…/otp`. Rows become CanonicalEvents with status CONFIRMED (idempotent by source hash); the holding recompute runs only for accounts with a portfolio, and replays transactions only.

**Related features:** F-PF-005, F-PF-007, F-PF-008, D-PF-004.

**Sources:** @@W/pages/pf/PfRefreshDialog.tsx#export function PfRefreshDialog@@, @@W/pages/pf/PfRefreshDialog.tsx#Your UAN is 12 digits@@, @@W/pages/pf/PfRefreshDialog.tsx#Save credentials (encrypted)@@, @@A/controllers/pf.controller.ts#export async function startSessionHandler@@, @@A/controllers/pf.controller.ts#const QUEUE_UNAVAILABLE@@, @@A/jobs/pfFetchWorker.ts#const JOB_TIMEOUT_MS@@, @@A/jobs/pfFetchWorker.ts#attempts: 1@@, @@A/ingestion/projection.ts#ProvidentFundAccount.currentBalance is updated by the PF service@@

### Upload a passbook PDF <!-- F-PF-007 -->
**What it does:** **Upload Passbook PDF** imports an EPFO passbook PDF without the live portal. Password-protected PDFs prompt for the password.

**Why it exists:** "Upload an EPFO passbook PDF to import transactions without using the live portal. The file is processed server-side and not stored." (dialog text)

**Where to find it:** **Asset Classes → PPF & EPF → Auto-fetch accounts → Passbook**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Passbook**. Choose a PDF; click **Upload**.
2. If the PDF is locked, enter its password in the prompt (it can be saved for next time).
3. The result shows "Imported N new entries." — click **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| File picker (PDF) | File | Chooses the passbook | — |
| **Upload** | Button | Uploads; "Uploading…" | Disabled while uploading |
| **Cancel** / **Close** | Button | Closes | Disabled while uploading |

**Fields and rules:** PDF only, up to 10 MB; the file's type is checked from its contents.

**Settings and toggles here:** None.

**Results:** As F-PF-006: passbook events are stored and the last refresh date is set (source "MANUAL_PDF"); holdings and the balance field are not changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No file uploaded" | No file chosen | Choose a file |
| Password prompt / "PDF is password-protected" | Locked PDF | Enter the password |
| Scanned PDF message (code SCANNED_PDF) | The PDF is an image | Download a text PDF from EPFO |
| "PDF parse failed: …" or another parse message | Not an EPFO passbook layout | Use the EPFO passbook PDF |

**Limitations:** The parser reads the EPFO passbook layout even when the account is a PPF account.

**How it works:** `POST /api/epfppf/accounts/:id/passbook` (multipart, in memory, 10 MB). The PDF is unlocked with saved, derived or typed passwords, tokenised, parsed by the EPFO passbook parser and stored as CONFIRMED CanonicalEvents (adapter `pf.epfo.manual.v1`).

**Related features:** F-PF-006, D-PF-004.

**Sources:** @@W/pages/pf/PfManualUploadDialog.tsx#Upload an EPFO passbook PDF@@, @@A/controllers/pf.controller.ts#limits: { fileSize: 10 * 1024 * 1024 }@@, @@A/controllers/pf.controller.ts#export async function uploadManualPassbookHandler@@, @@A/controllers/pf.controller.ts#const result = parseEpfoPassbook@@, @@A/controllers/pf.controller.ts#lastFetchSource: 'MANUAL_PDF'@@

### Reset the EPFO password <!-- F-PF-008 -->
**What it does:** **Reset your EPFO password** collects the UAN, the mobile number registered with EPFO and a new password that meets EPFO's rules, and is meant to run the portal's reset with captcha and OTP relayed to you.

**Why it exists:** "Most people have never used their EPFO password … Without a way out, this dialog is a dead end for them." (code comment)

**Where to find it:** **Refresh Provident Fund → Don't know your EPFO password?**

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Fill **UAN**, **Mobile registered with EPFO** and **New password**; hints show what is missing ("Your UAN is 12 digits — it is on your payslip.", "Enter the 10-digit number EPFO has on file. The code can only go there.", "EPFO needs 7 to 20 characters, a letter, a digit, a special character.").
2. Click **Send code**. The dialog shows "Contacting EPFO…".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Send code** | Button | Starts the reset | Disabled until all three fields are valid |
| **Submit** / **Verify** | Buttons | Captcha / OTP answers | — |
| **Back to refresh** / **Close** / **Try again** | Buttons | Finish or retry | Per outcome |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **UAN** | Text | Yes | 12 digits (spaces and dashes ignored) | Empty | hint above |
| **Mobile registered with EPFO** | Text | Yes | 10 digits starting 6–9; +91 stripped | Empty | hint above |
| **New password** | Password | Yes | 7–20 characters with a letter, a digit and a special character | Empty | hint above |

**Settings and toggles here:** None.

**Results:** The new password is never stored. At most 3 resets are allowed per day ("Too many password reset attempts today. Try again tomorrow.").

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Stays on "Contacting EPFO…" | The web app starts the reset in browser-extension mode, and nothing in this repository runs extension-mode resets (see Limitations) | Reset the password on the EPFO portal directly |

**Limitations:** Defect: the dialog doesn't send a source, so the server defaults to the extension and queues nothing; no extension endpoint receives the session, so the reset never starts. See DOCUMENTATION_GAPS.md.

**How it works:** `POST /api/epfppf/password-reset` (`uan`, `mobile`, `newPassword`, `source` default `EXTENSION`); only `SERVER_HEADLESS` enqueues a `password-reset` job. Events would arrive on the same session stream as a refresh (`password_reset`, `lookup_failed`, `failed`).

**Related features:** F-PF-006, F-PF-009.

**Sources:** @@W/pages/pf/PfPasswordResetDialog.tsx#function passwordProblems@@, @@W/pages/pf/PfPasswordResetDialog.tsx#const sessionId = await pfApi.startPasswordReset({@@, @@A/controllers/pf.controller.ts#const PasswordResetSchema@@, @@A/controllers/pf.controller.ts#export async function startPasswordResetHandler@@, @@A/services/pf/uanLookup.service.ts#export const MAX_RESETS_PER_DAY = 3;@@

### Browser extension pairing <!-- F-PF-009 -->
**What it does:** The **Browser Extension** page pairs the EveryPaisa browser extension with your account using an 8-character code valid for 5 minutes, and lists **Connected extensions** with **Disconnect**.

**Why it exists:** "Connect the EveryPaisa browser extension to auto-fetch your EPF and PPF data." (page text)

**Where to find it:** **Asset Classes → PPF & EPF → Browser extension** (route `/provident-fund/extension`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Install the extension (the page says "from the Chrome Web Store").
2. Click **Generate pairing code**. The code and a countdown ("Expires in m:ss") appear with "Waiting for extension…".
3. In the extension popup, click **Pair** and enter the code. The page shows "Extension connected successfully!" and the toast "Extension connected!".
4. If the code expires: "Code expired. Generate a new one." → **Generate new code**.
5. Click **Disconnect** on a connected extension to revoke it (toast "Extension disconnected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate pairing code** / **Generate new code** | Button | Creates a code | Disabled while generating |
| **Disconnect** | Button | Revokes the pairing | "Disconnecting…" while working |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A paired extension gets a long-lived token it uses to send scraped passbooks to your account; disconnecting revokes it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to generate pairing code" / "Failed to revoke" | Server error | Try again |

**Limitations:** The extension itself is not in this repository. The page polls every 3 seconds only while a code is valid.

**How it works:** `POST /api/epfppf/extension/pair-init`, `GET …/extension/pairings`, `DELETE …/extension/pairings/:id`. The extension calls `POST …/extension/pair-complete` (no sign-in; the code is the credential), then `GET …/extension/me`, `POST …/extension/raw-payload` and `POST …/extension/revoke` with its bearer token.

**Related features:** F-PF-006, F-PF-011, D-PF-005.

**Sources:** @@W/pages/pf/PfExtensionPairPage.tsx#export function PfExtensionPairPage@@, @@W/pages/pf/PfExtensionPairPage.tsx#Generate pairing code@@, @@W/pages/pf/PfExtensionPairPage.tsx#Code expired. Generate a new one.@@, @@A/routes/pf.routes.ts#pfRouter.post('/extension/pair-complete'@@, @@A/routes/pf.routes.ts#pfRouter.post('/extension/pair-init'@@

### PF refresh-due alerts <!-- F-PF-010 -->
**What it does:** Once a day, creates a "Refresh EPF account" / "Refresh PPF account" alert for each active linked account not refreshed for 30 days or more (or never), at most one unread per account and not again within 7 days, skipping snoozed accounts.

**Why it exists:** Code comment: "emits PF_REFRESH_DUE alerts so the user is prompted to re-fetch their balance."

**Where to find it:** **Alerts** (D-PF-006) and the yellow banner on the page (F-PF-005).

**Who can use it:** All users with linked accounts.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-PF-004 **Snooze 30d** suppresses it.

**Results:** Alert text: "<holder> (···1234) last refreshed N days ago — tap to refresh and keep data current." or "… has never been refreshed."

**Errors and troubleshooting:** None.

**Limitations:** The job is scheduled at 03:30 IST although its comments say 09:00 IST (see DOCUMENTATION_GAPS.md).

**How it works:** node-cron `30 3 * * *` with time zone Asia/Kolkata, running as system (all users); disabled by `ENABLE_PF_NUDGE_CRON=false`.

**Related features:** F-PF-005.

**Sources:** @@A/jobs/pfNudgeJob.ts#cron.schedule('30 3 * * *'@@, @@A/services/pf/pfNudges.service.ts#const STALE_DAYS = 30;@@, @@A/services/pf/pfNudges.service.ts#const RENUDGE_DAYS = 7;@@, @@A/services/pf/pfNudges.service.ts#const title = `Refresh@@

### What this area doesn't do

- You can't delete or unlink a linked auto-fetch account, or remove saved portal credentials.
- Fetched or uploaded passbooks don't update the PF holdings or the balance shown on the account.
- Interest rates are not looked up; the hints are fixed text.
- There is no PPF maturity or extension reminder.

## Forex

The **Forex** page (sidebar **Asset Classes → Forex**, route `/forex`) covers money held or moved in foreign currencies: live reference rates, foreign-currency cash balances, currency-pair trading positions with their speculative P&L, foreign shares, and outward remittances under the Liberalised Remittance Scheme (LRS) with tax collected at source (TCS). Forex is an optional asset class: it appears in the sidebar only after you add it with **Add asset class** (D-FX-001). Nothing here is plan-gated.

### Live FX rates <!-- F-FX-001 -->
**What it does:** The **Live FX rates** panel shows the latest stored rate for each INR pair (USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY → INR) and six cross pairs (EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF), each with its source badge — **RBI**, **FRANKFURTER**, **YAHOO** or **DERIVED**. **Refresh** fetches new rates from the sources now.

**Why it exists:** Page description: "Live RBI reference rates with Yahoo fallback."

**Where to find it:** **Asset Classes → Forex**, top of the page.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open **Forex**. Rates load; "Updating…" shows during each 30-second refresh.
2. Click **Refresh** to fetch from the sources. The toast "Refreshed N rates" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Runs a rate sync now | Disabled while running |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** New rates are stored for today and used everywhere (cash INR equivalents, LRS, foreign holdings).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No rates yet — hit refresh." | No rates stored yet | Click **Refresh** |
| "FX refresh failed" | All sources failed | Try later; the hourly job retries |

**Limitations:** INR rates show 4 decimals, cross rates 6. Rates fetched from exchangerate-api are labelled **FRANKFURTER**. Any signed-in user's **Refresh** runs the same app-wide sync.

**How it works:** `GET /api/forex/ticker` reads the latest stored rate per pair; the page re-reads every 30 seconds. `POST /api/forex/ticker/refresh` runs `syncFxRates`: RBI's reference page for USD/EUR/GBP/JPY, then exchangerate-api, then Frankfurter, then Yahoo for anything missing and the cross pairs, then derived rates. The same sync runs hourly (`0 * * * *`, IST) under `ENABLE_PRICE_CRONS`, and at startup if rates are older than 6 hours.

**Related features:** F-FX-002, F-FX-003, D-FX-002.

**Sources:** @@W/pages/forex/ForexRateTicker.tsx#refetchInterval: 30_000@@, @@W/pages/forex/ForexRateTicker.tsx#Refreshed ${res.updated} rates@@, @@W/pages/forex/ForexRateTicker.tsx#No rates yet — hit refresh.@@, @@A/priceFeeds/fx.service.ts#const PRIMARY_INR_PAIRS@@, @@A/priceFeeds/fx.service.ts#const CROSS_PAIRS@@, @@A/priceFeeds/fx.service.ts#export async function syncFxRates@@, @@A/priceFeeds/fx.service.ts#await upsertRate(code, 'INR', today, rate, 'FRANKFURTER');@@, @@A/controllers/forex.controller.ts#export async function refreshTicker@@, @@A/jobs/priceJobs.ts#cron.schedule('0 * * * *', runFxJob@@, @@A/jobs/startupSync.ts#await maybeRun('FX', 6 * HOUR_MS@@

### Foreign currency balances <!-- F-FX-002 -->
**What it does:** The **Cash** tab lists foreign-currency balances (for example Wise, a foreign bank or a forex card) with currency, account label and last 4 digits, bank, balance in that currency and its INR equivalent at the latest rate, plus a total in INR.

**Why it exists:** Empty-state text: "Track USD/EUR/GBP balances in Wise, foreign bank, or forex card accounts."

**Where to find it:** **Asset Classes → Forex → Cash** (default tab).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Add balance**. **Add forex balance** opens with currency USD and balance 0.
2. Fill **Currency**, **Balance**, optionally **Account label** (placeholder "Wise USD"), **Account number**, **Bank**, **Country**, **Notes**.
3. Click **Create**. The toast "Balance saved" appears.
4. To change it, click the pencil, edit and click **Save** (toast "Balance updated").
5. To delete, click the bin and confirm "Delete <currency> <balance>?" (toast "Deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add balance** | Button | Opens the dialog | — |
| Pencil / bin | Buttons | Edit / delete a row | — |
| **Cancel** / **Create** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Currency** | Select: USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY | Yes | 3 letters | USD | — |
| **Balance** | Text | Yes | Decimal, may be negative | 0 | "Decimal expected" |
| **Account label** | Text | No | Up to 120 | Empty | — |
| **Account number** | Password-style text | No | Up to 64; encrypted, last 4 shown | Empty | — |
| **Bank** | Text | No | Up to 160 | Empty | — |
| **Country** | Text | No | Up to 80 | Empty | — |
| **Notes** | Text | No | Up to 2000 | Empty | — |

**Settings and toggles here:** S-FX-001 **Currency**.

**Results:** The balance is stored; the INR column and total use the latest rate on each refresh (not stored).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" / "Update failed" / "Delete failed" (or the server message) | Server error | Try again |
| INR equivalent "—" | No stored rate for that currency | Click **Refresh** on the rates panel |

**Limitations:** Defect: editing a balance clears its saved account number unless you re-type it — the label says "(leave blank to keep existing)", but a blank box is sent as "clear" (see DOCUMENTATION_GAPS.md). The full account number can't be shown in the app. The total only adds currencies with a rate. Balances are not counted in holdings, the dashboard or net worth.

**How it works:** `GET/POST/PATCH/DELETE /api/forex/balances`. The account number is encrypted (AES-256-GCM) with only the last 4 digits stored readable; lists never return it. Sorted by currency, then label.

**Related features:** F-FX-001.

**Sources:** @@W/pages/forex/ForexCashTab.tsx#export function ForexCashTab@@, @@W/pages/forex/ForexCashTab.tsx#const schema = z.object({@@, @@W/pages/forex/ForexCashTab.tsx#function inrEquiv@@, @@W/pages/forex/ForexCashTab.tsx#(leave blank to keep existing)@@, @@W/pages/forex/ForexCashTab.tsx#accountNumber: v.accountNumber || null,##2@@, @@W/pages/forex/constants.ts#export const SUPPORTED_CCY@@, @@A/services/forex/forex.service.ts#export async function createForexBalance@@, @@A/services/forex/forex.service.ts#if (patch.accountNumber === null || patch.accountNumber === '')@@

### FX pair positions <!-- F-FX-003 -->
**What it does:** The **FX pairs** tab lists currency-pair positions (for example USDINR or EURUSD) recorded as transactions, with live value from the stored rates, the summary strip and the transactions table, and below them the realised P&L table (F-FX-004).

**Why it exists:** Tab description: "Currency pair positions (USDINR, EURUSD, …). Speculative business income — bypasses CG FIFO."

**Where to find it:** **Asset Classes → Forex → FX pairs**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **FX pairs**. Click **Add** to record a buy or sell in the shared transaction form (D-FX-003). The pair is identified by a code such as USDINR or EURUSD, stored in the transaction's ISIN field.
2. Edit or delete transactions from the table.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** | Button | Opens the transaction form for FOREX_PAIR | — |
| Edit / delete on rows | Buttons | As in other asset pages | — |

**Fields and rules:** As the shared transaction form (D-FX-003).

**Settings and toggles here:** None.

**Results:** Positions appear with live value.

**Errors and troubleshooting:** As the shared asset page.

**Limitations:** Live value on this tab is quantity × the base currency's INR rate for both 3-letter and 6-letter codes; a pair with no INR rate for its base shows no live value.

**How it works:** Shared asset page with asset class FOREX_PAIR; the server values a 6-letter pair at base→quote and converts to INR.

**Related features:** F-FX-004, D-FX-003.

**Sources:** @@W/pages/forex/ForexPairsTab.tsx#export function ForexPairsTab@@, @@W/pages/forex/ForexPairsTab.tsx#function computeLiveValue@@, @@A/priceFeeds/router.service.ts#case 'FOREX_PAIR': {@@

### Forex pair P&L by financial year <!-- F-FX-004 -->
**What it does:** The **Speculative business income (FOREX_PAIR P&L)** table shows, per portfolio, pair and financial year, buy and sell quantity, realised P&L and open position, with "Net realised across all pairs".

**Why it exists:** FX pair trades are speculative business income and skip the capital-gains engine (code comment).

**Where to find it:** **Asset Classes → Forex → FX pairs**, below the positions.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** "No realised P&L yet. Record matching BUY + SELL transactions on a pair to see speculative business income aggregated by FY."

**Limitations:** Defect: buys and sells are grouped by the financial year of each trade, so a position bought in one year and sold in the next shows no realised P&L. Realised P&L uses average buy and sell prices over the matched quantity, not FIFO lots as the comment says.

**How it works:** `GET /api/forex/pairs/:portfolioId/pnl` per portfolio (refused with 403 for someone else's portfolio). Realised = (average sell − average buy) × min(buy qty, sell qty).

**Related features:** F-FX-003.

**Sources:** @@W/pages/forex/ForexPairsTab.tsx#function ForexPairPnlSection@@, @@A/services/forex/forex.service.ts#export async function computeForexPairPnL@@, @@A/services/forex/forex.service.ts#const key = `${portfolioId}|${pair}|${financialYearOf(t.tradeDate)}`;@@, @@A/services/forex/forex.service.ts#const realised = avgSell.minus(avgBuy).times(matchedQty);@@, @@A/controllers/forex.controller.ts#export async function pairPnl@@

### Foreign equities <!-- F-FX-005 -->
**What it does:** The **Foreign equities** tab lists US and international shares (for example AAPL, MSFT) recorded as transactions, valued with the Yahoo price feed and converted to INR.

**Why it exists:** Tab description: "US/international shares (AAPL, MSFT, …). Yahoo price feed + INR conversion at trade time."

**Where to find it:** **Asset Classes → Forex → Foreign equities**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Foreign equities**, then **Add** to record a trade in the shared transaction form.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** | Button | Opens the transaction form for FOREIGN_EQUITY | — |

**Fields and rules:** As the shared transaction form (D-FX-003).

**Settings and toggles here:** None.

**Results:** Holdings with value in INR.

**Errors and troubleshooting:** As the shared asset page.

**Limitations:** Current value uses the latest rate of the currency on the newest trade.

**How it works:** Shared asset page with FOREIGN_EQUITY; current value = quantity × Yahoo price × latest rate to INR.

**Related features:** D-FX-003.

**Sources:** @@W/pages/forex/ForeignStocksTab.tsx#export function ForeignStocksTab@@, @@A/services/holdings/holdingsProjection.ts#if (meta.assetClass === 'FOREIGN_EQUITY') {@@

### LRS utilisation <!-- F-FX-006 -->
**What it does:** The **LRS utilisation** card shows "FY <year> · $used of $250000.00 used", a bar (green, amber above 80%, red at 100%) and "N% of annual LRS limit (USD 250,000 per individual / FY)". Above 80% it warns: "Above 80% — verify before further remittances. TCS at 20% applies above ₹7L cumulative this FY."

**Why it exists:** Code comment: the LRS limit is USD 250,000 per individual per financial year.

**Where to find it:** **Asset Classes → Forex → LRS & TCS**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls:** **Record remittance** (F-FX-007).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** Usage converts the year's INR total to USD at today's USD/INR rate (₹83 if none is stored), not the rate on each remittance date, so the percentage moves with the rupee. The TCS figures are informational; the 20% above ₹7 lakh rule is fixed in code.

**How it works:** `GET /api/forex/lrs/utilisation` sums the INR equivalent of remittances dated in the current financial year; warning at 80%.

**Related features:** F-FX-007.

**Sources:** @@W/pages/forex/LrsTab.tsx#LRS utilisation@@, @@W/pages/forex/LrsTab.tsx#Above 80%@@, @@A/services/forex/forex.service.ts#const LRS_ANNUAL_LIMIT_USD@@, @@A/services/forex/forex.service.ts#const LRS_WARNING_THRESHOLD_PCT@@, @@A/services/forex/forex.service.ts#export async function getLrsUtilisation@@, @@A/services/forex/forex.service.ts#?? new Decimal(83)@@

### Record or delete an LRS remittance <!-- F-FX-007 -->
**What it does:** **Record LRS remittance** saves an outward remittance (date, purpose, currency, amount, optional FX rate, bank, reference, TCS deducted, notes); the **Remittances** table lists them (date, purpose, bank, foreign amount, INR equivalent, TCS) with delete. If the remittance would take the year over USD 250,000, the dialog shows **LRS limit warning** with **Adjust** and **Confirm anyway**.

**Why it exists:** Empty-state text: "Outward remittances under the Liberalised Remittance Scheme will appear here for ITR Schedule FA reporting."

**Where to find it:** **Asset Classes → Forex → LRS & TCS → Record remittance**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Click **Record remittance**. The dialog opens with today's date, purpose **INVESTMENT** and currency **USD**.
2. Fill **Amount**, and also **FX rate (optional)** and **TCS deducted** (see Limitations); optionally **Bank**, **Reference**, **Notes**.
3. Click **Record**. The toast "Remittance recorded" appears.
4. If the limit warning appears, click **Confirm anyway** to save it regardless, or **Adjust** to edit.
5. To delete, click the bin and confirm "Delete remittance?" (toast "Deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Record remittance** | Button | Opens the dialog | — |
| **Record** | Button | Saves | Disabled while saving |
| **Adjust** / **Confirm anyway** | Buttons | Dismiss the warning / save past the limit | Shown with the warning |
| Bin | Button | Deletes after confirmation | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date** | Date | Yes | YYYY-MM-DD | Today | Zod default message |
| **Purpose** | Select: INVESTMENT, EDUCATION, TRAVEL, GIFT, MAINTENANCE, MEDICAL, OTHER | Yes | — | INVESTMENT | — |
| **Currency** | Select (11 currencies) | Yes | — | USD | — |
| **Amount** | Text | Yes | Decimal | Empty | Zod default message |
| **FX rate (optional)** | Text | In practice yes | Decimal; blank should mean the latest stored rate | Empty (placeholder "auto") | none shown |
| **Bank** | Text | No | Up to 160 | Empty | — |
| **Reference** | Text | No | Up to 200 | Empty | — |
| **TCS deducted** | Text | In practice yes | Decimal (placeholder "0") | Empty | none shown |
| **Notes** | Text | No | Up to 2000 | Empty | — |

**Settings and toggles here:** S-FX-002 **Purpose**; S-FX-003 **Currency (remittance)**.

**Results:** The remittance is stored with its INR equivalent (amount × rate) and counts toward the year's utilisation.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **Record** does nothing | **FX rate (optional)** or **TCS deducted** left empty: the form treats an empty box as invalid and shows no message (defect) | Type the rate and the TCS amount (0 if none) |
| "No FX rate available for <ccy>→INR" | No stored rate and none typed | Refresh rates or type the rate |
| "LRS limit exceeded: this remittance would push FY … usage to USD … (limit 250000). Resend with forceConfirmed=true to override." | Over the yearly limit | **Confirm anyway** or adjust |

**Limitations:** Defect: the form only submits when both optional boxes are filled. Remittances can't be edited. The utilisation uses today's USD rate (F-FX-006).

**How it works:** `POST /api/forex/lrs` (server: currency 3 letters, decimals, purpose list); with no FX rate the latest stored rate is used. The over-limit check projects this remittance in USD at today's USD/INR rate. `DELETE /api/forex/lrs/:id` also reverses any TCS-credit usage linked to it.

**Related features:** F-FX-006, F-FX-008.

**Sources:** @@W/pages/forex/LrsTab.tsx#const lrsSchema = z.object({@@, @@W/pages/forex/LrsTab.tsx#fxRate: z.string().regex@@, @@W/pages/forex/LrsTab.tsx#tcsDeducted: z.string().regex@@, @@W/pages/forex/LrsTab.tsx#Confirm anyway##2@@, @@W/pages/forex/LrsTab.tsx#Delete remittance?@@, @@A/services/forex/forex.service.ts#export async function createLrsRemittance@@, @@A/services/forex/forex.service.ts#LRS limit exceeded@@, @@A/services/forex/forex.service.ts#export async function deleteLrsRemittance@@, @@apps/web/node_modules/react-hook-form/dist/index.esm.mjs#set(_formValues, name, shouldSkipSetValueAs ? defaultValue : getFieldValue(field._f))@@

### TCS credits <!-- F-FX-008 -->
**What it does:** When TCS credits exist, the **TCS credits** table lists them (FY, collector, TAN, amount).

**Why it exists:** To keep the TCS collected on remittances for the tax return (inferred from the fields).

**Where to find it:** **Asset Classes → Forex → LRS & TCS**, below remittances.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** There is no screen to add, link or delete a TCS credit, so the table stays empty in normal use; the remittance form doesn't link to a credit.

**How it works:** `GET /api/forex/tcs`; create and delete exist only in the API (F-FX-009).

**Related features:** F-FX-007, F-FX-009.

**Sources:** @@W/pages/forex/LrsTab.tsx#TCS credits@@, @@A/services/forex/forex.service.ts#export async function listTcsCredits@@

### What this area doesn't do

- You can't edit a remittance or add a TCS credit from the app.
- Foreign cash balances are not counted in holdings, the dashboard or net worth (no other service reads them).
- There are no rate alerts or historical rate charts.

## Goals

The **Goals** page (sidebar **Planning → Goals**, route `/goals`, page title **Financial goals**) tracks targets such as retirement, a child's education or a FIRE corpus. Each goal has a target amount and date; its progress is a starting amount plus the current value of the portfolios you link to it, and it shows the yearly return you would need to get there. Goals are a **Plus** feature.

### Goals list and progress <!-- F-GOAL-001 -->
**What it does:** Lists your goals as cards in three sections — **Active**, **Achieved** and **Paused / abandoned** — each with category and priority badges, a progress bar and percentage, **Current**, **Target**, **Remaining**, **Target date**, years left ("N.Ny left"), the yearly return needed ("Need N.N% CAGR"), an **Off-track** flag when the needed return exceeds your expected return, and the linked portfolios.

**Why it exists:** Page description: "Track progress against retirement, child education, FIRE corpus, and custom targets."

**Where to find it:** **Planning → Goals** (route `/goals`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (server-enforced: GOAL_PROJECTIONS needs Plus). R-FREE sees the page blurred behind "Goal Planning is locked — Upgrade to Plus to unlock Goal Planning." with **View plans**. R-MANAGER: the manager's plan decides; goals shown are the managed person's.

**Steps**
1. Open **Planning → Goals**. With no goals: "No goals yet" and **Create first goal**.
2. Read each card. Click **Edit** to change a goal (F-GOAL-002) or the bin to delete it (F-GOAL-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New goal** / **Create first goal** | Button | Opens **Create goal** | — |
| **Edit** | Button | Opens **Edit goal** | — |
| Bin (title "Delete") | Button | Deletes after confirmation | — |
| **View plans** | Link | Opens Pricing | Shown only when locked |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-GOAL-001 to S-GOAL-006 are set in the goal form.

**Results:** Nothing changes by viewing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Locked card | Your plan is Free | Upgrade on Pricing |
| "Need …% CAGR" missing | Current value is 0, or the target date has passed | Link a portfolio or add an initial amount |

**Limitations:** **Inflation rate** has no visible effect: the needed return is computed against the target as entered, not the inflation-adjusted target, which is computed but not shown (see DOCUMENTATION_GAPS.md). When current value already exceeds the target, the needed return shows as a negative percentage. Progress is capped at 100%.

**How it works:** `GET /api/goals` (Plus-gated) returns each goal with computed fields. Current value = initial amount + the value of holdings in linked portfolios you own (current value, or cost when no price); an **Emergency fund** goal counts only cash, fixed and recurring deposits and post-office savings, RD and TD. Remaining = max(0, target − current). Years left = days to target date ÷ 365.25. Needed return = (target ÷ current)^(1 ÷ years) − 1, only when current > 0 and the date is in the future. **Off-track** when needed return > expected return. Sorted by status, then nearest target date.

**Related features:** F-GOAL-002, F-GOAL-003, D-GOAL-001, D-GOAL-002.

**Sources:** @@W/pages/goals/GoalsPage.tsx#export function GoalsPage@@, @@W/pages/goals/GoalsPage.tsx#<LockedFeature requiredTier="PLUS" featureName="Goal Planning">@@, @@W/pages/goals/GoalsPage.tsx#function GoalCard@@, @@W/pages/goals/GoalsPage.tsx#Off-track@@, @@W/components/common/LockedFeature.tsx#is locked</h3>@@, @@A/routes/goals.routes.ts#goalsRouter.use(requireFeature('GOAL_PROJECTIONS'));@@, @@A/services/goals/goals.service.ts#async function withProgress@@, @@A/services/goals/goals.service.ts#const requiredCagr = calcRequiredCagr@@, @@A/services/goals/goalMath.ts#export function requiredCagr@@, @@A/services/goals/goalMath.ts#const LIQUID_EMERGENCY_CLASSES@@

### Create or edit a goal <!-- F-GOAL-002 -->
**What it does:** **Create goal** (or **Edit goal**) sets name, category, priority, target and initial amounts, target date, status (edit only), inflation rate, expected return, linked portfolios and notes. **Quick start** buttons fill four templates: **Retirement at 60** (₹5 crore, 6% / 12%), **Child's higher education** (₹50 lakh, 8% / 11%), **Emergency fund (6 months)** (₹6 lakh, 6% / 7%), **FIRE corpus (25× expenses)** (₹3 crore, 6% / 12%).

**Why it exists:** Empty-state text: "Set a target amount and date, link contributing portfolios, and watch progress accrue."

**Where to find it:** **Planning → Goals → New goal**, or **Edit** on a card.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **New goal**. **Create goal** opens with category **Custom**, priority **Medium**, initial amount 0, inflation 0.06, expected return 0.12 and a target date 5 years from today.
2. Optionally click a **Quick start** template.
3. Fill **Name**, **Target amount (₹)**, **Target date**; adjust the rest; tick **Linked portfolios**.
4. Click **Create** (or **Save**). The toast "Goal created" / "Goal updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Quick start** template buttons | Buttons | Fill name, category, priority, target, rates | Create only |
| **Linked portfolios** checkboxes | Checkboxes | Choose portfolios counted | "No portfolios yet — create one first." when none |
| **Cancel** / **Create** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–200 | Empty | "Name required" |
| **Category** | Select (9) | No | — | Custom | — |
| **Priority** | Select: High, Medium, Low | No | — | Medium | — |
| **Target amount (₹)** | Number | Yes | > 0 | Empty | "Target amount required" |
| **Initial amount (₹)** | Number | No | ≥ 0 | 0 | — |
| **Target date** | Date | Yes | YYYY-MM-DD | Today + 5 years | "Target date required" |
| **Status** | Select: Active, Achieved, Paused, Abandoned | No | Edit only | Current | — |
| **Inflation rate (decimal)** | Number | No | Fraction (0.06 = 6%), below 10 | 0.06 | "Validation failed" (server) |
| **Expected return (decimal)** | Number | No | Fraction, below 10 | 0.12 | "Validation failed" (server) |
| **Notes** | Text area | No | Up to 4000 | Empty | — |

**Settings and toggles here:** S-GOAL-001 **Category** (Emergency fund changes what counts); S-GOAL-002 **Priority**; S-GOAL-003 **Status**; S-GOAL-004 **Inflation rate**; S-GOAL-005 **Expected return** (drives **Off-track**); S-GOAL-006 **Linked portfolios**.

**Results:** The goal is saved and the list recomputes. Setting **Achieved** stamps the achieved date.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| "Validation failed" | A rate of 10 or more, or a bad amount | Enter rates as fractions |

**Limitations:** On the Free plan the **New goal** button still opens the form, and saving fails with "This feature requires the PLUS plan or higher". Rates are entered as fractions, not percentages. Every save of an **Achieved** goal re-stamps the achieved date. Linked portfolios you no longer own are silently ignored.

**How it works:** `POST /api/goals` / `PATCH /api/goals/:id`. The start date is set to today on creation.

**Related features:** F-GOAL-001.

**Sources:** @@W/pages/goals/GoalDialog.tsx#const TEMPLATES@@, @@W/pages/goals/GoalDialog.tsx#const submit = () => {@@, @@W/pages/goals/GoalDialog.tsx#Inflation rate (decimal)@@, @@W/pages/goals/GoalDialog.tsx#No portfolios yet — create one first.@@, @@A/controllers/goals.controller.ts#const baseSchema = z.object({@@, @@A/services/goals/goals.service.ts#export async function createGoal@@, @@A/services/goals/goals.service.ts#achievedAt: input.status === 'ACHIEVED' ? new Date() : null,@@

### Delete a goal <!-- F-GOAL-003 -->
**What it does:** Deletes a goal after the browser confirmation "Delete this goal?".

**Why it exists:** Removes a goal you no longer track. Inferred from behavior.

**Where to find it:** Bin on a goal card (route `/goals`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click the bin and confirm. The toast "Goal removed" appears.

**Controls:** Bin (title "Delete").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The goal is removed; linked portfolios are not affected.

**Errors and troubleshooting:** The server message, for example "Goal not found".

**Limitations:** No undo.

**How it works:** `DELETE /api/goals/:id`.

**Related features:** F-GOAL-001.

**Sources:** @@W/pages/goals/GoalsPage.tsx#if (confirm('Delete this goal?'))@@, @@A/services/goals/goals.service.ts#export async function deleteGoal@@

### What this area doesn't do

- No SIP planning or monthly-investment suggestion on this page.
- No goal reminders or alerts.
- Goals don't use family view.

## Income

The **Income** page (sidebar **Overview → Income**, route `/income`) records recurring income — salary, business, trading, freelance, rental, interest/dividend, capital gains or other — as a monthly amount. Health Score, the insurance coverage check and other features use this figure instead of guessing from bank emails. Not plan-gated.

### Income list and total <!-- F-INC-001 -->
**What it does:** Shows **Total active monthly income** and cards in **Active** and **Inactive** sections, each with source name, type, **Inactive** badge, monthly amount ("/mo"), "Credited on day N" and notes.

**Why it exists:** Page description: "Salary, business, trading, freelance, rental, or any other recurring income. Used to score your financial health (investment rate, debt burden, insurance) and wherever your income matters."

**Where to find it:** **Overview → Income** (route `/income`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Open **Income**. With none: "No income entries yet" and **Add your first income**.
2. Use the pencil (title "Edit") or bin (title "Delete") on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add income** / **Add your first income** | Button | Opens **Add income** | — |
| Pencil (title "Edit") | Button | Opens **Edit income** | — |
| Bin (title "Delete") | Button | Deletes immediately (F-INC-003) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-INC-002 **Currently active** decides the section and the total.

**Results:** None.

**Errors and troubleshooting:** None specific.

**Limitations:** Amounts are monthly; there is no yearly or history view.

**How it works:** `GET /api/income` returns entries active first, then oldest first. The total adds active entries' monthly amounts.

**Related features:** F-INC-002, F-INC-003, D-INC-001, F-INS-019.

**Sources:** @@W/pages/income/IncomePage.tsx#export function IncomePage@@, @@W/pages/income/IncomePage.tsx#Total active monthly income@@, @@W/pages/income/IncomePage.tsx#Credited on day@@, @@A/services/income/income.service.ts#export async function listIncomes@@, @@A/services/income/income.service.ts#export async function activeMonthlyIncomeTotal@@

### Add or edit income <!-- F-INC-002 -->
**What it does:** **Add income** (or **Edit income**) records type, source, monthly amount, typical credit day, active flag and notes. For **Rental**, **Interest / Dividend** and **Trading**, a **Fetch from your data** box offers suggestions you can click to fill the form.

**Why it exists:** Empty-state text: "Add your salary, business, trading, or any other income stream so Health Score and other features can use a real number instead of guessing from bank emails."

**Where to find it:** **Overview → Income → Add income**, or the pencil on a card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click **Add income**. The dialog opens with type **Salary**, credit day 1 and **Currently active** ticked.
2. Pick **Income type**; the source label changes (**Employer**, **Business name**, **Broker / platform**, **Client / platform**, **Property**, **Bank / fund**, **Asset / broker**, **Source**).
3. For Rental, Interest / Dividend or Trading, click a suggestion to fill source, amount (and day), or "Nothing found yet — enter it manually below."
4. Fill **Monthly amount (₹)** ("For irregular income (trading, freelance), use your recent average.") and **Typical credit day**.
5. Click **Add** (or **Save**). The toast "Income added" / "Income updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Suggestion rows | Buttons | Fill the form | Only for Rental, Interest / Dividend, Trading |
| **Currently active** | Checkbox | Active flag | — |
| **Cancel** / **Add** / **Save** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Income type** | Select (8) | No | — | Salary | — |
| Source (label per type) | Text | Yes | 1–200 | Empty | "<label> required" (for example "Employer required") |
| **Monthly amount (₹)** | Number | Yes | > 0 | Empty | "Monthly amount required" |
| **Typical credit day** | Number | No | 1–31 | 1 | "Pay day must be between 1 and 31" |
| **Notes** | Text area | No | Up to 2000 | Empty | — |

**Settings and toggles here:** S-INC-001 **Income type**; S-INC-002 **Currently active**.

**Results:** The entry is saved; Health Score refreshes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Pay day must be between 1 and 31" | The credit-day box is empty or outside 1–31 | Type a day from 1 to 31 |
| "Monthly amount must be positive" (server) | Zero amount sent through the API | Enter a positive amount |

**Limitations:** Suggestions: Rental — one per active tenancy at its rent and due day; Interest / Dividend — 12-month average of dividend and interest transactions; Trading — 12-month average of realised F&O P&L (only when positive). The trading suggestion note says it varies.

**How it works:** `POST /api/income` / `PATCH /api/income/:id`; suggestions `GET /api/income/suggestions?type=`.

**Related features:** F-INC-001, D-INC-001, D-INC-002.

**Sources:** @@W/pages/income/IncomeDialog.tsx#const SUGGESTABLE_TYPES@@, @@W/pages/income/IncomeDialog.tsx#const submit = () => {@@, @@W/pages/income/IncomeDialog.tsx#Fetch from your data@@, @@W/pages/income/incomeTypeMeta.ts#export const INCOME_TYPE_SOURCE_LABEL@@, @@A/controllers/income.controller.ts#const baseSchema = z.object({@@, @@A/services/income/income.service.ts#async function rentalSuggestions@@, @@A/services/income/income.service.ts#async function interestDividendSuggestion@@, @@A/services/income/income.service.ts#async function tradingSuggestion@@

### Delete income <!-- F-INC-003 -->
**What it does:** Deletes an income entry immediately, with no confirmation.

**Why it exists:** Removes an income that no longer applies. Inferred from behavior.

**Where to find it:** Bin (title "Delete") on an income card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Click the bin. The toast "Income entry removed" appears.

**Controls:** Bin (title "Delete").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The entry is removed and the total updates.

**Errors and troubleshooting:** The server message, for example "Income entry not found".

**Limitations:** No confirmation and no undo; to pause an income instead, untick **Currently active**.

**How it works:** `DELETE /api/income/:id`.

**Related features:** F-INC-001.

**Sources:** @@W/pages/income/IncomePage.tsx#onDelete={(id) => removeMut.mutate(id)}@@, @@A/services/income/income.service.ts#export async function deleteIncome@@

### What this area doesn't do

- Income isn't detected automatically from bank credits here; it is what you enter.
- No yearly totals, tax treatment or history.

## Cash Activity

The **Cash Activity** page (sidebar **Overview → Cash Activity**, route `/cashflows`) shows a 12-month forecast of scheduled money in and out, and the list of cash-flow entries — money-in and money-out records created from approved bank alerts, rent, and split-expense settlements. Not plan-gated.

### Scheduled cashflow forecast <!-- F-CASH-001 -->
**What it does:** The **Scheduled cashflow** card ("Forecast · next 12 months") shows **Expected inflows**, **Expected outflows** and **Net**, a monthly bar chart of inflows and outflows, "Negative cashflow month ahead" when any month nets below zero, and the next 6 **Upcoming events** (Loan EMI, Rent due, Premium, FD matures, RD matures).

**Why it exists:** Code comment: aggregates the next N months of scheduled inflows and outflows.

**Where to find it:** **Overview → Cash Activity**, top card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps:** Not applicable — view only.

**Controls:** Chart tooltip on hover.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None shown; the card is hidden if loading fails.

**Limitations:** Each insurance policy contributes only its next premium, so a monthly or quarterly premium appears once in 12 months. FD and RD maturities show the amount invested, not the maturity value. Rent shows the full expected amount even for a partly paid month. The chart can show a 13th month for an event exactly 12 months away.

**How it works:** `GET /api/cashflows/forecast?horizonMonths=12` (1–36 accepted). Events from today to today + 12 months: unpaid EMIs from each active loan's schedule; rent receipts expected, overdue or partial; the stored next premium due of active policies; FD/RD buy transactions maturing in range. Totals use decimal arithmetic.

**Related features:** F-CASH-002, D-CASH-002.

**Sources:** @@W/pages/cashflows/CashflowForecastSection.tsx#export function CashflowForecastSection@@, @@W/pages/cashflows/CashflowForecastSection.tsx#Negative cashflow month ahead@@, @@A/services/analytics/cashflowForecast.service.ts#export async function getCashflowForecast@@, @@A/services/analytics/cashflowForecast.service.ts#nextPremiumDue: { gte: today, lte: horizonEnd },@@, @@A/services/analytics/cashflowForecast.service.ts#const amt = d(tx.netAmount);@@, @@A/controllers/cashflows.controller.ts#horizonMonths: z.coerce.number().int().min(1).max(36).default(12),@@

### Cash flow entries <!-- F-CASH-002 -->
**What it does:** Lists cash-flow entries newest first, 50 per page, with **All** / **Inflows** / **Outflows** tabs, **Inflows (this page)** and **Outflows (this page)** totals, and columns **Date**, **Description**, **Portfolio**, **Amount** (+ green / − red).

**Why it exists:** Page description: "Bank credits and debits parsed from your connected accounts".

**Where to find it:** **Overview → Cash Activity**, below the forecast.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person.

**Steps**
1. Choose a tab. Use **Previous** / **Next** when there is more than one page ("N total · page X of Y").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **All** / **Inflows** / **Outflows** | Tabs | Filter by direction; back to page 1 | — |
| **Previous** / **Next** | Buttons | Page | Disabled at the ends; hidden with one page |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-CASH-001 direction tab (not saved).

**Results:** None.

**Errors and troubleshooting:** "No cash flows found — Connect a Gmail account and configure senders to start ingesting bank alerts."

**Limitations:** Totals cover only the visible page. Entries can't be added, edited or deleted here. Amounts are always shown in rupees, including split-expense entries recorded in a foreign currency (see DOCUMENTATION_GAPS.md). A missing description shows "Credit" or "Debit".

**How it works:** `GET /api/cashflows?type=&page=&pageSize=50` (server also accepts portfolio and date filters, max 200 per page). Entries are created by approved inbox events, rent receipts and rent-ledger entries, and split-expense share links.

**Related features:** F-CASH-001, D-CASH-001, D-CASH-003, D-CASH-004.

**Sources:** @@W/pages/cashflows/CashFlowsPage.tsx#const PAGE_SIZE = 50;@@, @@W/pages/cashflows/CashFlowsPage.tsx#Inflows (this page)@@, @@W/pages/cashflows/CashFlowsPage.tsx#No cash flows found@@, @@A/controllers/cashflows.controller.ts#export async function listCashFlows@@, @@A/controllers/cashflows.controller.ts#amount: cf.amount.toString(),@@, @@A/ingestion/projection.ts#const cf = await tx.cashFlow.create({@@, @@A/services/split/shareLink.service.ts#currency: want.currency@@

### What this area doesn't do

- You can't add, edit, delete or categorise cash-flow entries.
- No search or date filter on the page (the API has them).
- The forecast isn't adjustable (fixed at 12 months).

## Accounting

The **Accounting** page (sidebar **Tools → Accounting**, route `/accounting`) is double-entry bookkeeping over your EveryPaisa data: a chart of accounts, vouchers (entered by hand or generated from your transactions, loans, rent and premiums), an account ledger, and three statements — **Trial Balance**, **P&L Statement** and **Balance Sheet** — plus printable receipts and a one-click **Export to Tally**. The whole module needs the **Pro/Advisor** plan.

### Accounting page and plan lock <!-- F-ACCT-001 -->
**What it does:** Shows four tabs — **Chart of Accounts**, **Vouchers**, **Ledger**, **Reports** — under the header "Double-entry bookkeeping — chart of accounts, vouchers, ledger, and financial statements", with **Export to Tally** in the header for Pro/Advisor accounts.

**Why it exists:** Page description (above).

**Where to find it:** **Tools → Accounting** (route `/accounting`).

**Who can use it:** R-PRO (server-enforced: ACCOUNTING_MODULE). R-FREE, R-PLUS, R-FAMILY see the tabs blurred behind "Accounting Module is locked — Upgrade to Pro/Advisor to unlock Accounting Module." with **View plans**. R-MANAGER: the manager's plan decides; books are the managed person's. R-PROF reaches a client's books through the CA workspace (D-ACCT-004).

**Steps**
1. Open **Tools → Accounting**. **Chart of Accounts** is the default tab.
2. Switch tabs as needed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Chart of Accounts** / **Vouchers** / **Ledger** / **Reports** | Tabs | Switch section | — |
| **Export to Tally** | Button | F-ACCT-013 | Hidden below Pro/Advisor |
| **View plans** | Link | Opens Pricing | Shown only when locked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Messages like "Request failed with status code 400" on any action | The page shows the browser's generic error instead of the server's reason (defect) | See the specific feature for likely causes |

**Limitations:** Error toasts on this page show the generic request error, not the server's message (see DOCUMENTATION_GAPS.md).

**How it works:** Every `/api/accounting/*` route requires sign-in and the ACCOUNTING_MODULE feature (Pro/Advisor), answering "This feature requires the PRO_ADVISOR plan or higher" otherwise.

**Related features:** F-ACCT-002 to F-ACCT-013.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#export function AccountingPage@@, @@W/pages/accounting/AccountingPage.tsx#<LockedFeature requiredTier="PRO_ADVISOR" featureName="Accounting Module">@@, @@W/pages/accounting/AccountingPage.tsx#onError: (e: Error) => toast.error(e.message),@@, @@A/routes/accounting.routes.ts#accountingRouter.use(requireFeature('ACCOUNTING_MODULE'));@@, @@A/middleware/requirePlan.ts#plan or higher@@

### Chart of accounts <!-- F-ACCT-002 -->
**What it does:** Shows your accounts as a tree with **Code**, **Name**, **Type** (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) and **Opening Balance**. The first time it is opened, a default chart of 36 accounts is created: Assets (Bank Accounts, Cash in Hand, Investments with Equity, Mutual Fund, Fixed Deposits, Bonds & Debentures, Gold and Other), Liabilities (Loans & Borrowings), Equity & Capital (Capital Account, Retained Earnings), Income (Dividend, Interest, Short-term and Long-term Capital Gains, Rental, Other, Speculative, F&O) and Expenses (Brokerage & Charges, STT, Fund Management Charges, Insurance Premiums, Property Expenses, Capital Losses, Other, Loan Interest, Speculative Loss, Loan Charges, F&O Loss).

**Why it exists:** The accounts every voucher and statement posts to. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Chart of Accounts**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Open the tab. Top-level accounts are expanded; click the chevron to expand or collapse others.
2. Hover a row to see its **+** (add a sub-account) and bin (delete) buttons.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chevron ("Expand" / "Collapse") | Button | Shows/hides sub-accounts | No effect without children |
| **+** (aria "Add account under <name>") | Button | Opens **Add Account** with that parent | Visible on hover |
| Bin (aria "Delete <name>") | Button | F-ACCT-003 | Visible on hover |
| **Add account** | Button | Opens **Add Account** (top level) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None (beyond the first-time default chart).

**Errors and troubleshooting:** "Loading default chart of accounts…" shows while the list is empty.

**Limitations:** Accounts can't be renamed or re-coded in the app. A deleted default account is created again the next time the chart loads.

**How it works:** `GET /api/accounting/accounts/tree` and `/flat` first create any missing default account (by code), then return all accounts ordered by code.

**Related features:** F-ACCT-003, F-ACCT-005.

**Sources:** @@A/services/accounting/accounting.service.ts#{ code: '1000', name: 'Assets', type: 'ASSET' },@@, @@A/services/accounting/accounting.service.ts#{ code: '5011', name: 'F&O Loss'@@, @@A/services/accounting/accounting.service.ts#export async function ensureDefaultAccounts@@, @@A/services/accounting/accounting.service.ts#export async function listAccountsTree@@, @@W/pages/accounting/AccountingPage.tsx#function AccountTreeNode@@, @@W/pages/accounting/AccountingPage.tsx#Loading default chart of accounts…@@

### Add or delete an account <!-- F-ACCT-003 -->
**What it does:** **Add Account** creates an account with code, type, name, parent and opening balance. Delete removes an account that has no voucher entries and no sub-accounts.

**Why it exists:** To shape the chart to your books. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Chart of Accounts → Add account**, or a row's **+** / bin.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **Add account** (or **+** on a row). **Add Account** opens.
2. Fill **Code** (placeholder "e.g. 1001"), **Type**, **Name**, **Parent Account** (**None (top-level)** or an account), **Opening Balance (₹)**.
3. Click **Create**. The toast "Account created" appears.
4. To delete: click the bin and confirm `Delete account "<name>"?`. The toast "Account deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create** | Button | Saves; "Creating…" | Disabled until code and name are filled, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Code** | Text | Yes | 1–20, unique | Empty | Server: "Account code <code> already exists" (shown as a generic error) |
| **Type** | Select: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE | Yes | — | ASSET | — |
| **Name** | Text | Yes | 1–200 | Empty | — |
| **Parent Account** | Select | No | Your accounts | None (top-level), or the row's account | Server: "Parent account … not found" |
| **Opening Balance (₹)** | Number | No | Positive decimal only | 0 | Server validation (shown as a generic error) |

**Settings and toggles here:** S-ACCT-001 **Type**; S-ACCT-002 **Parent Account**; S-ACCT-003 **Opening Balance (₹)**.

**Results:** The account appears in the tree and in every account picker. Delete removes it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error on delete | The account has voucher entries ("Cannot delete account with existing voucher entries") or sub-accounts ("Cannot delete account with sub-accounts") | Delete those first |

**Limitations:** Opening balances can't be negative; a credit opening on an asset account (or the reverse) can't be entered. If you close **Add Account** without saving, what you typed is kept for the next time it opens.

**How it works:** `POST /api/accounting/accounts`, `DELETE /api/accounting/accounts/:id`.

**Related features:** F-ACCT-002.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function ChartOfAccountsTab@@, @@W/pages/accounting/AccountingPage.tsx#Delete account "${name}"?@@, @@A/schemas/accounting.schema.ts#export const createAccountSchema@@, @@A/services/accounting/accounting.service.ts#export async function createAccount@@, @@A/services/accounting/accounting.service.ts#Cannot delete account with existing voucher entries@@, @@A/services/accounting/accounting.service.ts#Cannot delete account with sub-accounts@@

### Vouchers list <!-- F-ACCT-004 -->
**What it does:** Lists vouchers newest first, 50 per page: **Date**, **Voucher No.**, **Type** (JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES, with "auto" for generated ones), **Narration**, **Amount** (sum of its lines), **Entries** count, and view / download / delete buttons. A type filter narrows the list.

**Why it exists:** The day book of all postings. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Vouchers**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Pick a type in the filter (**All types** by default).
2. Page with **Previous** / **Next** when there are more than 50.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Type filter (**All types**, JOURNAL…SALES) | Select | Filters; back to page 1 | — |
| **Previous** / **Next** | Buttons | Page | Shown with more than 50; disabled at the ends |
| Eye ("View receipt") / Download ("Download receipt (PDF)") / Bin ("Delete voucher") | Buttons | F-ACCT-008 / F-ACCT-006 | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ACCT-005 **Voucher type filter** (not saved).

**Results:** None.

**Errors and troubleshooting:** "No vouchers yet — create one above."

**Limitations:** Vouchers can't be opened or edited in the app.

**How it works:** `GET /api/accounting/vouchers?type=&page=&limit=50` (limit up to 200), ordered by date.

**Related features:** F-ACCT-005 to F-ACCT-008.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function VouchersTab@@, @@W/pages/accounting/AccountingPage.tsx#No vouchers yet — create one above.@@, @@A/services/accounting/accounting.service.ts#export async function listVouchers@@

### New voucher <!-- F-ACCT-005 -->
**What it does:** **New Voucher** records a voucher with type, number (suggested automatically), date, narration and one or more lines, each a debit account, a credit account, an amount and an optional narration, with a running **Total**.

**Why it exists:** To post entries the automatic generation doesn't cover. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Vouchers → New Voucher**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **New Voucher**. Type **JOURNAL**, today's date and a suggested number (for example "JO0001") fill in.
2. Change **Type** if needed; the suggested number follows the type's two-letter prefix.
3. For each line pick **Debit Account** and **Credit Account** and type **Amount (₹)**; click **Add row** for more lines, the bin (aria "Remove row") to drop one.
4. Click **Save Voucher**. The toast "Voucher created" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add row** | Button | Adds a line | — |
| Bin (aria "Remove row") | Button | Removes a line | Hidden with one line |
| **Save Voucher** | Button | Saves; "Saving…" | Disabled until every line has both accounts and an amount, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Type** | Select (6) | Yes | — | JOURNAL | — |
| **Voucher No.** | Text | Yes | 1–50; unique per type | Suggested | Server: "Voucher number <no> already exists for type <type>" (shown as a generic error) |
| **Date** | Date | Yes | YYYY-MM-DD | Today | — |
| **Narration** | Text | No | Up to 500 | Empty | — |
| **Debit Account** / **Credit Account** | Select | Yes | Your accounts | "Select…" | Server: "One or more account IDs not found" |
| **Amount (₹)** | Number | Yes | Positive decimal | Empty | — |

**Settings and toggles here:** S-ACCT-004 **Voucher type**.

**Results:** The voucher is saved and appears in the list, ledger and statements.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error when saving a second voucher | The suggested number isn't refreshed after a save (and a typed number is kept), so it repeats (defect) | Type a new number, or reload the page |

**Limitations:** The dialog keeps the previous voucher's lines after saving. With only generated ("AUTO-…") vouchers of a type, the suggested number is built from the digits inside the generated voucher's id, giving a very long number (defect). After number 9999 the suggestion stops increasing because numbers are compared as text.

**How it works:** `GET /api/accounting/vouchers/next-no?type=` returns the type's first two letters + the last number + 1, padded to 4 digits (cached for 30 seconds in the browser). `POST /api/accounting/vouchers` checks every account is yours and the number is unused for the type. Each line is its own debit/credit pair, so a voucher always balances.

**Related features:** F-ACCT-004, F-ACCT-009.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function VoucherFormDialog@@, @@W/pages/accounting/AccountingPage.tsx#queryKey: ['voucher-next-no', type],@@, @@W/pages/accounting/AccountingPage.tsx#qc.invalidateQueries({ queryKey: ['vouchers'] });@@, @@W/pages/accounting/AccountingPage.tsx#Save Voucher@@, @@W/main.tsx#staleTime: 30_000,@@, @@A/schemas/accounting.schema.ts#export const createVoucherSchema@@, @@A/services/accounting/accounting.service.ts#export async function createVoucher@@, @@A/services/accounting/accounting.service.ts#export async function nextVoucherNo@@, @@A/services/accounting/accounting.service.ts#const num = parseInt(last.voucherNo.replace@@

### Delete a voucher <!-- F-ACCT-006 -->
**What it does:** Deletes a voucher after the confirmation "Delete this voucher?".

**Why it exists:** Removes a wrong posting. Inferred from behavior.

**Where to find it:** Bin (title "Delete voucher") on a voucher row.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click the bin and confirm. The toast "Deleted" appears.

**Controls:** Bin (title "Delete voucher").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The voucher and its lines are removed.

**Errors and troubleshooting:** Generic request error if it fails.

**Limitations:** A generated ("auto") voucher comes back the next time you open the ledger or a statement, or click **Generate from activity**, because the books are re-projected from your activity (see DOCUMENTATION_GAPS.md).

**How it works:** `DELETE /api/accounting/vouchers/:id`.

**Related features:** F-ACCT-007.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#Delete this voucher?@@, @@A/services/accounting/accounting.service.ts#export async function deleteVoucher@@, @@A/controllers/accounting.controller.ts#async function projectBeforeRead@@

### Generate vouchers from activity <!-- F-ACCT-007 -->
**What it does:** **Generate from activity** creates, updates or removes "auto" vouchers so the books match your activity: buys, SIPs and deposits (PURCHASE: investment Dr, bank Cr), dividend reinvestment and opening balances (JOURNAL), sales and redemptions (SALES, splitting short-term, long-term and intraday gains or losses), dividends and interest (RECEIPT), realised F&O profit or loss, loan disbursements and loan payments (principal, interest, processing fees), rent received and insurance premiums. The same projection runs automatically before the ledger and every statement is shown.

**Why it exists:** Button tooltip: "Auto-create vouchers from BUY/SELL transactions, dividends, rent receipts, loan EMIs and premium payments".

**Where to find it:** **Tools → Accounting → Vouchers → Generate from activity**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **Generate from activity** ("Generating…").
2. Read the toast: "Created N voucher(s) from existing activity" or "No new vouchers — every existing transaction is already projected".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | Runs the projection | Disabled while running |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Auto vouchers numbered `AUTO-<kind>-<id>` are created, rewritten when their source changed, and deleted when their source is gone.

**Errors and troubleshooting:** Per-voucher failures are counted and skipped.

**Limitations:** The toast reports only newly created vouchers; updates and removals are not mentioned. Investment accounts by asset class: equity/ETF → Equity Holdings; mutual funds → Mutual Fund Holdings; FD/RD → Fixed Deposits; bonds → Bonds & Debentures; gold → Gold Holdings; F&O, insurance, ULIP and cash are not booked as investments; others → Other Investments. All money moves through **Bank Accounts** (1001).

**How it works:** `POST /api/accounting/generate-from-activity`; ledger, trial balance, P&L and balance sheet requests call the same projection first and log (not show) a failure.

**Related features:** F-ACCT-004, F-ACCT-009 to F-ACCT-012, D-ACCT-001.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#Generate from activity@@, @@W/pages/accounting/AccountingPage.tsx#Created ${r.created} voucher@@, @@A/services/accounting/accounting.service.ts#export async function generateVouchersFromActivity@@, @@A/services/accounting/accounting.service.ts#function investmentAccountCode@@, @@A/services/accounting/accounting.service.ts#const ACCOUNTING_ROLE@@, @@A/controllers/accounting.controller.ts#async function projectBeforeRead@@

### Receipts <!-- F-ACCT-008 -->
**What it does:** Each voucher can be opened as a PDF receipt (**View receipt**) or downloaded (**Download receipt (PDF)**); rent, premium and loan vouchers become a "Rent Receipt", "Premium Payment Receipt" or "Loan Payment Receipt", others a plainer voucher receipt. **Receipts (ZIP)** downloads every rent, premium and loan receipt (plus RECEIPT and PAYMENT vouchers) matching the type filter as one PDF each; **Receipts (Excel)** gives the same set as one totalled spreadsheet.

**Why it exists:** Code comment: "a receipt is the document somebody actually wants — to hand a tenant, to attach to a return, to keep."

**Where to find it:** **Tools → Accounting → Vouchers** (row buttons and header buttons).

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click the eye on a row to open the receipt in a new tab, or the download arrow to save `<date>-<voucher no>.pdf`.
2. Click **Receipts (ZIP)** or **Receipts (Excel)** to download `receipts.zip` / `receipts.xlsx` for the current filter.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Eye (title "View receipt") | Button | Opens the PDF | — |
| Download (title "Download receipt (PDF)") | Button | Saves the PDF | — |
| **Receipts (ZIP)** / **Receipts (Excel)** | Buttons | Bundle download | Disabled while one is being built |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ACCT-005 (the type filter decides the bundle).

**Results:** Files are downloaded; nothing is stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error (for example status 404) on a bundle | No receipts in the selection ("No receipts in that range.") — the page doesn't show the server text | Change the type filter |
| A new tab doesn't open | Pop-ups blocked | Allow pop-ups, or use download |

**Limitations:** A bundle holds the newest 500 receipts; when more exist only a response header says so. Bundles can't be limited by date in the app.

**How it works:** `GET /api/accounting/vouchers/:id/receipt.pdf` (`?inline=true` to view), `GET /api/accounting/receipts.zip|.xlsx?type=`; receipts are built one at a time.

**Related features:** F-ACCT-004.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#const receipt = async@@, @@W/pages/accounting/AccountingPage.tsx#Receipts (ZIP)@@, @@W/api/accounting.api.ts#async downloadReceiptBundle@@, @@A/controllers/accounting.controller.ts#export async function getReceiptsZip@@, @@A/services/receipts/receiptBundle.ts#const MAX_RECEIPTS = 500;@@, @@A/services/receipts/receiptData.ts#title: 'Rent Receipt',@@

### Ledger <!-- F-ACCT-009 -->
**What it does:** Shows one account's postings in a date range: **Opening** and **Closing** balances and a table of **Date**, **Voucher**, **Narration**, **Debit**, **Credit** and running **Balance**.

**Why it exists:** To check an account's movement. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Ledger**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Pick an **Account** ("Select an account to view its ledger." until you do).
2. Optionally set **From** and **To**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Account** | Select | Chooses the account | — |
| **From** / **To** | Dates | Range | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (the books are re-projected first — F-ACCT-007).

**Errors and troubleshooting:** "No entries in this period."

**Limitations:** None beyond F-ACCT-007.

**How it works:** `GET /api/accounting/ledger/:accountId?from=&to=`. Opening = the account's opening balance + every posting before **From**. Balances are on the account's normal side: debits raise assets and expenses, credits raise liabilities, equity and income.

**Related features:** F-ACCT-007, F-ACCT-010.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function LedgerTab@@, @@W/pages/accounting/AccountingPage.tsx#Select an account to view its ledger.@@, @@A/services/accounting/accounting.service.ts#export async function getAccountLedger@@, @@A/services/accounting/accounting.service.ts#const signedMovement@@

### Trial Balance <!-- F-ACCT-010 -->
**What it does:** Lists every account grouped as **Assets**, **Liabilities**, **Equity**, **Income**, **Expenses** with **Code**, **Account**, **Opening** (wide screens), **Debit**, **Credit** and **Balance**, and a **Total** row, as of a date.

**Why it exists:** Standard check that the books balance. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Reports → Trial Balance**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Optionally set **As of date** (blank = everything to date).

**Controls:** **As of date** (date).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** None specific.

**Limitations:** The **Total** row's **Balance** is total debits − total credits, which ignores opening balances.

**How it works:** `GET /api/accounting/reports/trial-balance?asOf=`; vouchers on or before the date; closing = opening + movement on the normal side.

**Related features:** F-ACCT-011, F-ACCT-012.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function TrialBalanceReport@@, @@A/services/accounting/accounting.service.ts#export async function getTrialBalance@@

### P&L Statement <!-- F-ACCT-011 -->
**What it does:** Shows **Income** and **Expenses** accounts with their movement in a period, **Total Income**, **Total Expenses** and **Net Profit** or **Net Loss**. The period defaults to the current Indian financial year (April–March).

**Why it exists:** Standard profit and loss for the period. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Reports → P&L Statement**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Adjust **From** and **To** if needed.

**Controls:** **From**, **To** (dates).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** "No income recorded" / "No expenses recorded" when empty.

**Limitations:** None known.

**How it works:** `GET /api/accounting/reports/pnl?from=&to=`; each account's balance at **To** minus its balance before **From**.

**Related features:** F-ACCT-010.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function PnLReport@@, @@A/services/accounting/accounting.service.ts#export async function getPnL@@

### Balance Sheet <!-- F-ACCT-012 -->
**What it does:** Shows **Assets** and **Liabilities & Equity** (including **Retained Earnings** = income − expenses to date) with totals, as of a date. When opening balances don't net to zero, a **Difference in Opening Balances** line is added to the short side so the totals agree.

**Why it exists:** Code comment: shown "as Tally does" instead of leaving totals unequal.

**Where to find it:** **Tools → Accounting → Reports → Balance Sheet**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Optionally set **As of date**.

**Controls:** **As of date**.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** None specific.

**Limitations:** None known.

**How it works:** `GET /api/accounting/reports/balance-sheet?asOf=`; difference = debit-side openings − credit-side openings.

**Related features:** F-ACCT-010.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function BalanceSheetReport@@, @@W/pages/accounting/AccountingPage.tsx#Difference in Opening Balances@@, @@A/services/accounting/accounting.service.ts#export async function getBalanceSheet@@

### Export to Tally <!-- F-ACCT-013 -->
**What it does:** Downloads your books as one ZIP for TallyPrime: "1 - Masters.xml" (groups and ledgers with opening balances), one "Transactions FY<year>.xml" per financial year, "Holdings at end of FY<year>.xlsx" per year, and "README - How to import into Tally.txt".

**Why it exists:** Code comment: "the user's books as one ZIP ready for TallyPrime".

**Where to find it:** **Tools → Accounting**, header **Export to Tally** (also on Reports — D-ACCT-002).

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **Export to Tally** ("Preparing…").
2. The ZIP downloads with the toast "Tally export downloaded. The README inside has the import steps."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Export to Tally** | Button | Builds and downloads the ZIP | Hidden below Pro/Advisor; disabled while preparing |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A ZIP named after the account ("…-tally-export.zip") is downloaded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "The Tally export was stopped because Tally would reject part of it (N problems): …" | Your data breaks a Tally rule; no partial file is produced | Fix the listed records and try again |
| "Export failed (HTTP <status>)" | Other server failure | Try again |

**Limitations:** The export is built from your transactions, bank accounts, cash flows, loans, cards, rent and premiums directly — manual vouchers and your chart of accounts on this page are not included.

**How it works:** `GET /api/reports/download/tally-export` (Pro/Advisor-gated) builds the Tally book from source records and refuses to produce a file that would break a Tally rule.

**Related features:** D-ACCT-002.

**Sources:** @@W/components/tally/TallyExportButton.tsx#export function TallyExportButton@@, @@W/components/tally/TallyExportButton.tsx#Tally export downloaded.@@, @@W/api/tallyExport.api.ts#export async function downloadTallyExport@@, @@A/services/accounting/tally/tallyZip.service.ts#export async function buildTallyZip@@, @@A/services/accounting/tally/tallyPackage.ts#The Tally export was stopped because Tally would reject part of it@@, @@A/services/accounting/tally/tallySources.ts#prisma.cashFlow.findMany({@@, @@A/routes/reports.routes.ts#reportsRouter.get('/download/tally-export'@@

### What this area doesn't do

- You can't edit an account or a voucher, or open a voucher's detail, on this page.
- There is no bank reconciliation, GST or inventory here.
- Manual vouchers don't go into the Tally export.

<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any page in these modules; every route is inside the signed-in app and sends the visitor to sign in. The only unauthenticated endpoint here is the browser extension's pairing exchange, which needs a valid 5-minute pairing code.

### Free user <!-- R-FREE -->
Full use of Insurance, PPF & EPF, Forex, Income and Cash Activity. Goals is locked (Plus) and Accounting is locked (Pro/Advisor): both pages show blurred behind an upgrade card, and their API calls are refused. On Goals the **New goal** button still opens the form, but saving fails.

### Plus subscriber <!-- R-PLUS -->
Everything a Free user has, plus Goals. Accounting stays locked.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in these modules.

### Pro/Advisor subscriber <!-- R-PRO -->
Everything, including Accounting (chart of accounts, vouchers, ledger, statements, receipts) and **Export to Tally**.

### Administrator <!-- R-ADMIN -->
No admin-only powers in these modules; an administrator's access follows their own plan.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these pages: they always show your own policies, provident-fund entries, forex records, goals, income, cash flows and books.

### Family contributor <!-- R-FAMCONTRIB -->
As Family owner: these pages show only your own data in family view.

### Family viewer <!-- R-FAMVIEWER -->
As Family owner: these pages show only your own data in family view.

### Managing a family member's account <!-- R-MANAGER -->
While managing someone's account, every page here shows and changes that person's data; plan locks (Goals, Accounting) follow the manager's plan. The insurance Gmail search lists the managed person's Gmail accounts (normally none). PF portal refresh, passbook upload and extension pairing act on the managed person's accounts.

### Professional acting for a client <!-- R-PROF -->
These pages show the professional's own data. A client's books, accounting and receipts are reached only through the CA workspace, within the grant (D-ACCT-004).

### AI chatbot connection <!-- R-AICONN -->
No access to these pages. With the matching areas approved, a connected chatbot can read (never change) insurance policies, retirement accounts (EPF/PPF/NPS), foreign-currency data, goals, income and the tax summary through its own tools.

### Succession nominee <!-- R-NOMINEE -->
No access to these modules.

## Glossary
| Term (as in UI) | Meaning in this product |
|---|---|
<!-- BEGIN GLOSSARY -->
| Sum assured / Cover | The amount a policy pays on the insured event; shown as **Cover** on the policy card and as **Sum assured** for life policies. |
| Next premium due | The date of the earliest unpaid premium; when entered on a new policy, earlier premiums count as already paid ("untracked"). |
| Grace period | Days after a premium's due date during which it can still be paid and cover continues: by default 30 days for life and health policies paid in instalments, 15 if monthly, none otherwise. |
| Coming up | The Insurance panel of premiums due within 30 days or overdue. |
| May have lapsed / Cover has ended | A premium past its grace period (or past its due date with no grace) with no payment recorded. |
| Untracked premium | A premium due before the date you started tracking the policy; treated as paid. |
| Critical illness cover | A lump sum paid on diagnosis of a listed illness, recorded as Yes / No / Not recorded on a policy. |
| Surrender value | What the insurer would pay if you end a whole life, endowment or ULIP policy early; entered from the insurer's quote. |
| TPA | Third-party administrator that settles health claims for an insurer. |
| Ombudsman | The Insurance Ombudsman, to whom an unresolved complaint can be taken (claims up to ₹50 lakh). |
| Family insurance sheet | The printable one-page summary of active policies for your family. |
| Coverage check | The page that compares your life, health, vehicle and home cover with what your figures suggest you need. |
| Auto-fetch account | An EPF UAN or PPF bank account linked so its passbook can be fetched from the portal. |
| UAN | Universal Account Number, the 12-digit EPF member number. |
| Passbook | The EPF/PPF statement of contributions, interest and withdrawals. |
| LRS | Liberalised Remittance Scheme: up to USD 250,000 per person per financial year sent abroad. |
| TCS | Tax collected at source on remittances; 20% above ₹7 lakh a year in this app's guidance. |
| FX pair | A currency-pair position such as USDINR or EURUSD, treated as speculative business income. |
| CAGR (goal) | The yearly return needed from today for a goal's current value to reach its target by the target date. |
| Off-track | A goal whose needed yearly return is higher than the expected return you entered. |
| Total active monthly income | The sum of income entries marked **Currently active**. |
| Cash flow | A money-in (**Inflow**) or money-out (**Outflow**) entry created from approved bank alerts, rent and split settlements. |
| Scheduled cashflow | The 12-month forecast of loan EMIs, rent due, premiums and deposit maturities. |
| Voucher | A double-entry record; types JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES. "auto" marks one generated from your activity. |
| Chart of accounts | The tree of ledger accounts vouchers post to. |
| Difference in Opening Balances | The balancing line added to the balance sheet when opening balances don't net to zero. |
<!-- END GLOSSARY -->
