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
