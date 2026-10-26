## Will Maker

**Will Maker** helps you "Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign." It is an 8-step wizard (Overview, Your details, People & roles, Assets & liabilities, Allocate, Instructions, Review, Preview) followed by step 9, **Sign and store**. Your asset list is pulled from your EveryPaisa accounts; rules check the will before a PDF can be generated; signed copies are stored and a review reminder fires every two years. Every page carries the disclaimer: "This is not legal advice. Passing these checks does not guarantee that your will is legally valid. Get it reviewed by a qualified advocate before you sign it."

### Will Maker overview <!-- F-WILL-001 -->
**What it does:** Shows your will's status (**Not created**, **Draft**, **Generated**, **Executed**), the current draft or latest generated version with its actions, an indicative estate (Assets, Liabilities, Net worth), a "Key things to prepare" list and the disclaimer.

**Why it exists:** Page description: "Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign."

**Where to find it:** **Planning → Will Maker** (route `/will`).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. Below PLUS the page shows the lock card "Will Maker is locked" plus "Your will documents" (F-WILL-013). While managing someone's account (R-MANAGER) it shows "Will Maker works on your own account only. Switch back to your own account to make or view your will."

**Steps**
1. Open **Planning → Will Maker**.
2. With nothing yet, click **Create my will** ("About 15-20 minutes. Your progress is saved as you go."). The wizard opens at **Your details**.
3. With a draft: **Continue** or **Discard draft** (confirm "Discard this draft?" — "You can't get it back." → **Discard**; toast "Draft discarded").
4. With a generated will: **Download PDF**, **Sign and store** (or **Signed copy** once signed), **Start a new version** (not yet signed) or **My circumstances changed** (signed).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create my will** | Button | Starts a draft | Only when no draft and no generated will; disabled while starting |
| **Continue** | Button | Opens the draft at its saved step | Only with a draft |
| **Discard draft** | Button | Deletes the draft after confirmation | Only with a draft |
| **Download PDF** | Button | Downloads the latest version's PDF | Only with a generated will; disabled while any download runs |
| **Sign and store** / **Signed copy** | Link | Opens step 9 (F-WILL-012) | Only with a generated will |
| **Start a new version** | Button | New draft copied from the latest version | Only when generated, not signed, and no draft |
| **My circumstances changed** | Button | New draft copied from the signed version | Only when signed and no draft |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Drafts are created as the next version number. If a draft already exists, any create action opens it instead.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load Will Maker" | Overview request failed | Reload |
| "Couldn't start your will" / "Couldn't start a new version" | Server refused | Retry |
| "N source(s) could not be read right now." | Some asset sources failed while totalling the estate | Refresh later |

**Limitations:** The estate tiles are indicative ("From your EveryPaisa accounts today. Insurance paid to nominees (₹…) is not counted.") and are recomputed on each visit. Only one draft can exist at a time ("You already have a draft will. Continue it or discard it first.").

**How it works:** `GET /api/will` (WILL_MAKER plan, refuses managing). Collects the estate from all asset sources (bank accounts, investments, provident fund, property, rental property, vehicles, insurance, money lent, loans, credit cards; at most 400 items) and totals assets, liabilities, net and nominee-only amounts. `POST /api/will/drafts` (optionally from an earlier will) and `DELETE /api/will/drafts/:id`. Will contents are stored encrypted per user.

**Related features:** F-WILL-002, F-WILL-003, F-WILL-004, F-WILL-012, F-WILL-013.

**Sources:** `apps/web/src/pages/will/WillOverviewPage.tsx:19`, `apps/web/src/pages/will/WillOverviewPage.tsx:26`, `apps/web/src/pages/will/WillOverviewPage.tsx:141`, `apps/web/src/pages/will/WillOverviewPage.tsx:163`, `apps/web/src/pages/will/WillOverviewPage.tsx:202`, `packages/api/src/routes/will.routes.ts:51`, `packages/api/src/services/will/will.service.ts:72`, `packages/api/src/services/will/will.service.ts:83`, `packages/api/src/services/will/will.service.ts:114`, `packages/api/src/services/will/estate/registry.ts:36`, `packages/shared/src/will/wire.ts:117`

### Will history <!-- F-WILL-002 -->
**What it does:** Card **History** listing every version (newest first) with its status badge and a line such as "Started … - generated … - signed … - replaced by version N - next review …", with **PDF** and **Signed copy** buttons where they exist.

**Why it exists:** Inferred from behavior: keeps every earlier version and its signed copy reachable after a new version replaces it.

**Where to find it:** **Planning → Will Maker → History** card.

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Find a version and click **PDF** to download it or **Signed copy** to open its step-9 page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF** | Button | Downloads that version | Only for generated versions; disabled during any download |
| **Signed copy** | Link | Opens `/will/<id>/execute` | Only when a signed copy is stored |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Downloads only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't download the PDF" / "The PDF for this version is no longer stored" | File missing | Generate a new version |

**Limitations:** Discarded drafts are not listed.

**How it works:** History comes from the overview response; PDFs are served by `GET /api/will/versions/:vid/pdf` (no plan gate) with an integrity check.

**Related features:** F-WILL-001, F-WILL-012.

**Sources:** `apps/web/src/pages/will/WillHistoryCard.tsx:10`, `apps/web/src/pages/will/WillHistoryCard.tsx:19`, `packages/api/src/routes/will.routes.ts:48`, `packages/api/src/services/will/willGenerate.service.ts:156`

### Will review reminders <!-- F-WILL-003 -->
**What it does:** Two years after you sign (and every two years after a review), a banner "Time to review your will" appears on Will Maker and an alert "Time to review your will" is created. You can answer **Reviewed - no changes** or **My circumstances changed**.

**Why it exists:** Banner text: "Check your will every two years, and whenever your family or finances change - a marriage, a birth, a death, or buying or selling property."

**Where to find it:** **Planning → Will Maker** (banner) and **Tools → Alerts** (D-WILL-001).

**Who can use it:** Owners of a signed will on PLUS or above (the reminder alert is created on any plan).

**Steps**
1. When due, open Will Maker and read "Version N was due for a review on <date>…".
2. Click **Reviewed - no changes** — toast "Thanks. We'll remind you again on <date>." — or **My circumstances changed** to start a new version.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Reviewed - no changes** | Button | Moves the next review two years from today and closes the alert | Disabled while busy |
| **My circumstances changed** | Button | Starts a new draft from the signed will | Disabled while busy |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Next review date = today + 2 years. Generating a new version closes open review alerts.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't save your review" | Request failed | Retry |

**Limitations:** The alert is created by a daily job at 09:15 IST, so it can appear up to a day after the due date. Users who are inactive or scheduled for deletion are skipped. The job is off when `ENABLE_ALERT_CRONS=false`.

**How it works:** `POST /api/will/wills/:id/reviewed`. `willReviewJob` reads due users under a system context, then runs each user's alert sync in that user's own context; one alert per will per due date, older ones are closed.

**Related features:** F-WILL-001, F-WILL-012, D-WILL-001.

**Sources:** `apps/web/src/pages/will/WillReviewBanner.tsx:6`, `apps/web/src/pages/will/WillOverviewPage.tsx:125`, `packages/api/src/jobs/willReviewJob.ts:72`, `packages/api/src/services/will/willReview.service.ts:55`, `packages/api/src/services/will/willReview.service.ts:102`, `packages/shared/src/will/execution.ts:11`

### Will wizard: navigation and saving <!-- F-WILL-004 -->
**What it does:** The frame around steps 2–8: a stepper (full row on wide screens, "Step N of 8" bar on narrow), **Back** and **Next**, a save status ("Saving...", "All changes saved", "Not saved"), automatic saving, and protection against edits from another tab.

**Why it exists:** Overview text: "Your progress is saved as you go."

**Where to find it:** `/will/:id/<step>` (details, people, estate, allocation, instructions, review, preview).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Edit the step; changes save automatically about 0.8 s after you stop typing.
2. Click **Next** (or a step in the stepper). The page saves first and then moves.
3. If a save fails, click **Retry** next to "Could not save your changes. Check your connection and try again."
4. If another tab changed the will, click **Reload**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Stepper steps | Buttons | Save and go to that step | Wide screens only (≥ 900 px) |
| **Back** | Button | Save and go back (step 2 goes to the overview) | After two failed saves you may leave anyway |
| **Next** | Button | Save and go forward | Disabled while loading, and on **Review** while any blocker remains; hidden on **Preview** |
| **Retry** | Button | Retries the save | Shown after a failed save |
| **Reload** | Button | Reloads the latest version | Shown on a conflict |

**Fields and rules:** Not applicable here (see each step).

**Settings and toggles here:** None.

**Results:** Each section is saved separately with the revision it builds on.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This will was changed in another tab or device. Reload to see the latest version - your last change here was not saved." | Revision conflict | **Reload** |
| "This draft could not be opened." | Draft missing or discarded | **Back to Will Maker** |
| "This request is too large." | Body over 512 KB | Shorten text |

**Limitations:** While a conflict is shown, the step is read-only.

**How it works:** `GET /api/will/drafts/:id`, `PUT /api/will/drafts/:id/sections/:section` with revision; a revision mismatch returns 409 "This will was changed in another tab or device. Reload to continue." Rules (`runWillRules`) run in the browser on every change.

**Related features:** F-WILL-005 to F-WILL-011.

**Sources:** `apps/web/src/pages/will/WillWizardPage.tsx:24`, `apps/web/src/pages/will/WillWizardPage.tsx:50`, `apps/web/src/pages/will/WillWizardPage.tsx:66`, `apps/web/src/pages/will/WillWizardPage.tsx:101`, `apps/web/src/pages/will/willSteps.ts:3`, `apps/web/src/pages/will/useWillDraft.ts:9`, `apps/web/src/pages/will/useWillDraft.ts:36`, `packages/api/src/routes/will.routes.ts:24`, `packages/api/src/services/will/willStore.ts:60`

### Step 2: Your details <!-- F-WILL-005 -->
**What it does:** Collects your identity and family situation: full legal name, how you are described ("Son of …"), date of birth, country whose law applies, religion / personal law, address, marital status, children and dependents.

**Why it exists:** Side panel "Why we ask": "Your religion decides which succession law applies." "Marriage and children decide who your family is in law, and whether a guardian is needed."

**Where to find it:** Wizard step **Your details** (`/will/:id/details`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Fill in each field (required ones are marked *).
2. Read any notice (foreign law, Muslim law) and finding below the form.
3. Click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Full legal name** * | Text | "As on your PAN or passport." | — |
| **Described as** | Select | Leave out / Son of / Daughter of / Wife of / Husband of / Child of / Spouse of | — |
| **Father's, mother's or spouse's full name** | Text | Printed after your name | Disabled until **Described as** is chosen |
| **Date of birth** * | Date | — | — |
| **Country whose law applies** * | Select | India / Another country | — |
| **Religion / personal law** * | Select | Hindu, Sikh, Jain, Buddhist, Christian, Parsi, Muslim, Other / none | — |
| **Address** * | Text area | — | — |
| **Marital status** * | Select | Single, Married, Widowed, Divorced, Separated | — |
| **Do you have children?** * | Select | Yes / No | — |
| **Anyone else depends on you?** | Select | Yes / No | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Full legal name | Text | Yes | ≤ 120 | Empty | "Fill in your … ." |
| Date of birth | Date | Yes | 1900-01-01 to today; you must be 18+ | Empty | "Your date of birth is not a real date, or is in the future." / "You must be 18 or older to make a will." |
| Address | Text | Yes | ≤ 400 | Empty | — |
| Country | Select | Yes | India only is supported | India | Blocker (foreign-law notice) |
| Personal law | Select | Yes | Muslim personal law not supported | — | Blocker (Muslim-law notice) |

**Settings and toggles here:** S-WILL-001 **Country whose law applies**; S-WILL-002 **Religion / personal law**.

**Results:** Saved to the draft; blockers stop generation.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Foreign-law or Muslim-law notice | Unsupported law | Will Maker cannot produce this will; consult an advocate |

**Limitations:** Only wills under Indian law and non-Muslim personal law can be generated.

**How it works:** Saved via the `details` section; checked by rules JURISDICTION_INDIA_ONLY, MUSLIM_LAW_UNSUPPORTED, REQUIRED_FIELDS, TESTATOR_ADULT and INVALID_DATE (all blockers on step 2).

**Related features:** F-WILL-004, F-WILL-010.

**Sources:** `apps/web/src/pages/will/steps/DetailsStep.tsx:19`, `apps/web/src/pages/will/steps/DetailsStep.tsx:63`, `apps/web/src/pages/will/steps/DetailsStep.tsx:70`, `apps/web/src/pages/will/parts.tsx:16`, `packages/shared/src/will/validation/rules.ts:54`, `packages/shared/src/will/validation/rules.ts:76`

### Step 3: People & roles <!-- F-WILL-006 -->
**What it does:** Builds the list of people and organisations in your will and assigns the executor, back-up executor, guardian and back-up guardian. Tabs: **Beneficiaries**, **Executor**, **Guardian**, **Others** (charities and organisations). Family members on EveryPaisa are offered as one-click additions.

**Why it exists:** Tab text: "The executor collects your assets, pays your debts and shares out the rest as your will says."

**Where to find it:** Wizard step **People & roles** (`/will/:id/people`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. On **Beneficiaries**, click a name under "From your family on EveryPaisa" or **Add a person**; fill the person form and click **Save person**.
2. On **Executor**, choose **Executor** and **Back-up executor** (adults only).
3. On **Guardian**, choose a **Guardian** and **Back-up guardian** if you have children under 18 (otherwise "You have no children under 18 in your list, so a guardian is not needed.").
4. On **Others**, **Add an organisation**.
5. **Edit** or **Remove** people; removing asks "Remove <name>?" — "Their shares and gifts will be removed from your will, and any role they hold will be cleared." → **Remove person**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Family quick-pick buttons ("Add <name>") | Buttons | Add a family member as a person | Hidden when none left to add |
| **Add a person** / **Add an organisation** | Buttons | Open the person form | — |
| **Edit** / **Remove** | Buttons | Edit / remove a person | — |
| **Executor**, **Back-up executor**, **Guardian**, **Back-up guardian** | Selects | Assign roles ("Not chosen" default); an ineligible current choice shows "(not eligible)" | Guardian selects only with minors |
| Person form: **Name** *, **Relationship**, **Date of birth** ("Tells us whether they are under 18."), **Phone or email (optional)**, **If they die before you, their gifts go to** | Fields | Person details | Date of birth hidden for organisations |
| **Save person** / **Save organisation** / **Cancel** | Buttons | Save / close the form | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name | Text | Yes | ≤ 120 | Empty | "Enter a name." |
| Relationship | Select | No | Spouse, Son, Daughter, Father, Mother, Brother, Sister, Grandson, Granddaughter, Son-in-law, Daughter-in-law, Nephew, Niece, Other relative, Friend, Other (organisations: Charity, Other) | Son / Charity | — |
| Back-up beneficiary | Select | No | Another person | "Shared among the others (default)" | "A person cannot be their own back-up beneficiary." |
| Executor | Select | Yes (blocker) | Adult individual | Not chosen | "Choose an executor - the person who will carry out your will." / "The back-up executor must be a different person." |
| Guardian | Select | If minors | Adult individual | Not chosen | "You have a child under 18 - choose a guardian." |

**Settings and toggles here:** S-WILL-006 **If they die before you, their gifts go to** (back-up beneficiary).

**Results:** People and roles are saved; removing a person also removes their shares and gifts.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "An executor or guardian must be an adult individual, not an organisation or a child." | Ineligible choice | Choose an adult individual |
| "Add a date of birth for N people so we can tell whether anyone is under 18." | Warning | Add dates of birth |

**Limitations:** The family quick-pick reads your family memberships under row-level security; for contributors and viewers it probably lists nobody (see DOCUMENTATION_GAPS.md).

**How it works:** Saved as the `people` section (people + roles). `GET /api/will/people/suggestions` returns active members of your families (not you), with the relation mapped to a will relationship only when the relation was recorded against you.

**Related features:** F-WILL-004, F-WILL-008, F-WILL-010.

**Sources:** `apps/web/src/pages/will/steps/PeopleStep.tsx:29`, `apps/web/src/pages/will/steps/PeopleStep.tsx:82`, `apps/web/src/pages/will/steps/PeopleStep.tsx:110`, `apps/web/src/pages/will/steps/PersonForm.tsx:10`, `apps/web/src/pages/will/parts.tsx:7`, `packages/api/src/services/will/will.service.ts:210`, `packages/shared/src/will/validation/rules.ts:89`

### Step 4: Assets & liabilities <!-- F-WILL-007 -->
**What it does:** Lists the assets and liabilities fetched from your EveryPaisa accounts with value, ownership (**Sole**, **Joint**, **Nominee only**, **HUF**) and your share, and a review status per item (**Confirmed**, **Needs review**, **Excluded**, **Not found on refresh**). You can refresh from your accounts and add items by hand.

**Why it exists:** Inferred from behavior: the will's estate schedule is built from the data already in EveryPaisa, with the owner confirming each item.

**Where to find it:** Wizard step **Assets & liabilities** (`/will/:id/estate`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. On first open the list is fetched ("Fetching your assets...").
2. For each item set **Ownership** (Joint/HUF ask for your share %), then **Confirm**, **Exclude** or **Include**.
3. Click **Add an asset or liability**, enter **What is it**, **Type**, **Value**, click **Add**. Manual items can be **Edit value**d or **Remove**d.
4. Click **Refresh from my accounts** to re-read your accounts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh from my accounts** | Button | Re-reads your accounts | Disabled while refreshing |
| **Retry** | Button | Retries a failed first fetch | Only after a failed first fetch |
| Ownership select | Select | Sole / Joint (50% default) / Nominee only / HUF | — |
| Share % | Decimal field | Your share | Joint and HUF only |
| **Confirm** | Button | Marks reviewed | Needs review / Not found on refresh |
| **Exclude** / **Include** | Button | Leaves the item out / back in | — |
| **Edit value** / **Done** / **Remove** | Buttons | Edit or remove a manual item | Manual items only |
| **Add an asset or liability** → **Add** / **Cancel** | Buttons | Add a manual item | **Add** disabled until name and valid value |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Share % | Decimal | For Joint/HUF | > 0 and ≤ 100, up to 2 decimals | 50 (Joint), 100 | "Enter a percentage above 0, like 25 or 33.33" |
| Value (manual) | Decimal | Yes | > 0, up to 13 digits and 2 decimals; ₹ and commas ignored | Empty | "Enter an amount above 0, like 50000 or 50000.50" |
| **What is it** | Text | Yes | ≤ 160 | Empty | — |

**Settings and toggles here:** S-WILL-004 **Ownership**; S-WILL-005 **Include / Exclude**.

**Results:** Totals Assets / Liabilities / Net update; "Paid to nominees and not counted: ₹…" for nominee-only items.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We could not read your <sources> just now. Try refreshing, or add them by hand." | A source failed | Refresh or add by hand |
| "Some items were left out because the list is very long." | More than 400 items | Add missing items by hand |
| "This item has gifts in step 5 - they will be flagged." | Excluded or nominee-only item has gifts | Remove the gifts |
| "Your asset list is more than 30 days old - refresh it." | Warning | Refresh |

**Limitations:** Values are estimates as of the fetch date. Nominee-only items pass to the nominee and cannot be gifted.

**How it works:** `POST /api/will/drafts/:id/estate/refresh` collects from each source adapter and reconciles with saved items (your edits are kept; items no longer found are marked **Not found on refresh** unless the list was truncated). Rules on step 4 are warnings: ITEMS_NEED_REVIEW, ESTATE_STALE (> 30 days), ESTATE_SOURCE_FAILED, JOINT_OWNERSHIP_ONLY_SHARE, HUF_COPARCENARY_SHARE, plus an info note on nominations.

**Related features:** F-WILL-004, F-WILL-008.

**Sources:** `apps/web/src/pages/will/steps/EstateStep.tsx:17`, `apps/web/src/pages/will/steps/EstateStep.tsx:59`, `apps/web/src/pages/will/steps/EstateStep.tsx:89`, `apps/web/src/pages/will/steps/EstateStep.tsx:176`, `apps/web/src/pages/will/steps/EstateStep.tsx:224`, `apps/web/src/pages/will/DecimalField.tsx:8`, `apps/web/src/pages/will/allocationMath.ts:3`, `packages/api/src/services/will/estate/registry.ts:36`, `packages/shared/src/will/validation/rules.ts:150`

### Step 5: Allocate <!-- F-WILL-008 -->
**What it does:** Decides who gets what: **By percentage** (the residuary estate shared in percentages that must total 100%, shown in a donut chart), **Specific gifts** (a share of a particular asset to a person), **Fixed amounts** (a rupee amount to a person), and how long someone must outlive you to inherit.

**Why it exists:** Tab text: "Everything not given away as a specific gift or a fixed amount is shared in these percentages."

**Where to find it:** Wizard step **Allocate** (`/will/:id/allocation`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. **By percentage**: use **Add someone to the split** (new rows take the remaining %), adjust each share, or click **Split equally**. The total line reads "Total 100.00%" in green when correct.
2. **Specific gifts**: choose **Asset** ("… - N% left") and **To**, click **Add gift**, then adjust the share.
3. **Fixed amounts**: choose **Person**, enter **Amount**, click **Add amount**.
4. Choose **How long must someone outlive you to inherit?**

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **By percentage** / **Specific gifts** / **Fixed amounts** | Tabs | Switch section | — |
| **Add someone to the split** | Select | Adds a person with the remaining % | Disabled at 100% ("Lower someone's share first."); hidden when everyone is in |
| **Split equally** | Button | Equal shares to 2 decimals, remainder to the first | Shown with ≥ 2 people |
| Share fields | Decimal fields | Edit percentages | — |
| **Add gift** | Button | Adds a specific gift | Disabled until asset and person chosen, for a duplicate pair, or when the asset has 0% left |
| **Add amount** | Button | Adds a fixed gift | Disabled until person and valid amount |
| **Remove** | Buttons | Remove a row | — |
| **How long must someone outlive you to inherit?** | Select | No waiting period, 7, 15, 30, 60 or 90 days | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Percentage | Decimal | Yes | > 0, ≤ 100, 2 decimals | Remaining % | "Enter a percentage above 0, like 25 or 33.33" |
| Residuary total | — | Blocker | Exactly 100% | — | "The percentage split adds up to X% - it must be exactly 100%." / "Share the rest of your estate - the percentages must add up to 100%." |
| Specific gift | — | Blocker | ≤ 100% per asset; real, included asset | — | "An asset is given away more than 100%." / "A gift names an asset that is excluded, is a liability, or is no longer in your list." |
| Amount | Decimal | Yes | > 0 | Empty | "Enter an amount above 0, like 50000 or 50000.50" |

**Settings and toggles here:** S-WILL-003 **How long must someone outlive you to inherit?** — default 30 days; "If they die within this period, their gifts go to their back-up, or else into the rest of your estate. 30 days is common."

**Results:** Saved as the `allocation` section.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<name> already has a share of this asset. Change that share above instead." | Same asset/person pair | Edit the existing share |
| "Your money gifts add up to more than your estimated net estate." | Warning | Lower amounts |
| "A beneficiary is under 18 - their share will be managed by their guardian until they turn 18." | Warning | — |

**Limitations:** Nominee-only and excluded assets can't be gifted.

**How it works:** Shares use decimal arithmetic. Step-5 blockers: RESIDUARY_SUMS_100, SPECIFIC_ITEM_OVERALLOCATED, GIFT_ON_EXCLUDED_OR_LIABILITY, DANGLING_REFERENCE; warnings: MINOR_BENEFICIARY, FIXED_GIFTS_EXCEED_NET_ESTATE, UNALLOCATED_ASSETS.

**Related features:** F-WILL-006, F-WILL-007, F-WILL-010.

**Sources:** `apps/web/src/pages/will/steps/AllocationStep.tsx:27`, `apps/web/src/pages/will/steps/AllocationStep.tsx:91`, `apps/web/src/pages/will/steps/AllocationStep.tsx:180`, `apps/web/src/pages/will/steps/AllocationStep.tsx:242`, `apps/web/src/pages/will/allocationMath.ts:20`, `packages/shared/src/will/schema.ts:42`, `packages/shared/src/will/validation/rules.ts:211`

### Step 6: Instructions <!-- F-WILL-009 -->
**What it does:** One optional text box, **Additional instructions (optional)**, for wishes such as funeral arrangements or organ donation, "printed word for word in your will".

**Why it exists:** Field hint: "Wishes such as funeral arrangements or organ donation."

**Where to find it:** Wizard step **Instructions** (`/will/:id/instructions`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Type your instructions; a counter shows "N / 1000".
2. Click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Additional instructions (optional)** | Text area | Free-text wishes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Additional instructions | Text | No | ≤ 1,000 characters | Empty | — |

**Settings and toggles here:** None.

**Results:** Saved as the `instructions` section and printed verbatim.

**Errors and troubleshooting:** None specific to this step (see F-WILL-004 for save errors).

**Limitations:** Text is printed exactly as typed; it is not checked.

**How it works:** Saved via `PUT /api/will/drafts/:id/sections/instructions`.

**Related features:** F-WILL-004.

**Sources:** `apps/web/src/pages/will/steps/InstructionsStep.tsx:6`

### Step 7: Review <!-- F-WILL-010 -->
**What it does:** A checklist of every rule with a tick, warning or cross and the message for each problem, a **Fix** button that jumps to the right step (and tab), "Your will at a glance" totals, and a "Legal review recommended" note. **Next** stays disabled while any blocker remains.

**Why it exists:** Heading text: "N things to fix before you can preview" / "Ready to preview".

**Where to find it:** Wizard step **Review** (`/will/:id/review`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Read each check. Click **Fix** next to a problem to jump there.
2. When the heading says "Ready to preview", click **Next**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Fix** | Button | Goes to the step/tab that fixes the check | Only on failing checks |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing saved here.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Something needs another look" | A finding from a rule not in the list | **Fix** |

**Limitations:** Passing every check does not mean the will is legally valid (disclaimer).

**How it works:** Lists `WILL_RULES` except the legal-review info rule; "At a glance" shows Assets, Liabilities, Net estate, People named, Specific gifts and Money gifts.

**Related features:** F-WILL-005 to F-WILL-009, F-WILL-011.

**Sources:** `apps/web/src/pages/will/steps/ReviewStep.tsx:9`, `apps/web/src/pages/will/steps/ReviewStep.tsx:15`, `apps/web/src/pages/will/WillWizardPage.tsx:107`, `packages/shared/src/will/validation/rules.ts:303`

### Step 8: Preview and generate the PDF <!-- F-WILL-011 -->
**What it does:** Shows a summary and the full text of the will as it will print, asks you to tick the acknowledgement, and generates the PDF as a new numbered version.

**Why it exists:** Code comment: "A preview is what the user consents to, so it is never served from cache".

**Where to find it:** Wizard step **Preview** (`/will/:id/preview`).

**Who can use it:** Same as F-WILL-001.

**Steps**
1. Wait for "Preparing your preview...". Read the summary and document.
2. Tick: "I understand that EveryPaisa is not a law firm, that this will is produced from a fixed template, and that I should have it reviewed by a qualified advocate before I sign it."
3. Click **Generate PDF**. "Version N is ready" appears with next steps.
4. Click **Download PDF**, **Next: sign and store** or **Back to Will Maker**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Acknowledgement checkbox | Checkbox | Consent | Resets whenever the preview reloads |
| **Generate PDF** | Button | Generates the version | Disabled until ticked, with blockers, or while generating |
| **Download PDF** / **Next: sign and store** / **Back to Will Maker** | Buttons | After generation | — |
| **Go to Review** / **Reload preview** / **Retry** | Buttons | Recovery actions | Shown only in those states |

**Fields and rules:** Acknowledgement required ("Please confirm you have read the note about legal review").

**Settings and toggles here:** None.

**Results:** The draft becomes **Generated**; any earlier generated or signed version becomes superseded ("replaced by version N"); open review reminders close; the PDF is stored in your documents.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix the items on the Review step first." | Blockers | **Go to Review** |
| "Your preview is from an earlier day - reload it to see the will with today's date before you generate." | The date changed | **Reload preview** |
| "Your will changed since this preview. Reload the preview to see the latest version before you generate." | Revision changed | **Reload preview** |
| "Couldn't prepare the preview" / "Couldn't create your will" | Server error | **Retry** |

**Limitations:** Generation is limited to 5 per minute. The PDF footer reads "Prepared with EveryPaisa Will Maker from a fixed template. Not legal advice - have it reviewed by a qualified advocate."

**How it works:** `GET /api/will/drafts/:id/preview` (audit "will_viewed") and `POST /api/will/drafts/:id/generate` with revision, acknowledgement and the preview date. The server re-checks rules, renders the PDF with the running head "Last Will and Testament of <name>", stores it as a document named "will-v<N>.pdf", seals a snapshot, and writes the audit row "will_generated".

**Related features:** F-WILL-010, F-WILL-012, D-WILL-002.

**Sources:** `apps/web/src/pages/will/steps/PreviewStep.tsx:18`, `apps/web/src/pages/will/steps/PreviewStep.tsx:48`, `apps/web/src/pages/will/steps/PreviewStep.tsx:129`, `packages/api/src/routes/will.routes.ts:60`, `packages/api/src/services/will/willGenerate.service.ts:72`, `packages/api/src/services/will/willGenerate.service.ts:116`, `packages/shared/src/will/wire.ts:120`

### Sign and store (step 9) <!-- F-WILL-012 -->
**What it does:** Explains how to sign the will correctly, links to free legal help, and records the signing date and two witnesses with a scan or photo of the signed will. Once stored, the will shows as **Executed** and the next review is set two years ahead.

**Why it exists:** Page description: "Step 9: sign your will the right way, then keep a copy of the signed will here."

**Where to find it:** **Will Maker → Sign and store** (route `/will/:id/execute`).

**Who can use it:** Same as F-WILL-001 for storing; downloading a stored signed copy works on any plan.

**Steps**
1. Follow the guide: Print the will; Read it once more; Choose two witnesses; Sign in front of both witnesses; Register it with the Sub-Registrar (optional); Store it safely.
2. Enter **Date you signed**, **Witness 1 - full name**, **Witness 2 - full name** and choose the **Signed copy (PDF or photo, up to 20 MB)**.
3. Click **Store signed copy**. The toast "Your signed will is stored" appears; the card shows "Signed on <date>", the witnesses and "Next review <date>".
4. Later use **Download signed copy** or **Replace the copy or fix details** (leave the file empty to keep the stored copy).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | Downloads the generated will | — |
| **Store signed copy** | Button | Saves the record | Disabled while saving |
| **Download signed copy** | Button | Downloads the stored copy | Only when stored |
| **Replace the copy or fix details** | Button | Reopens the form | Only for the current will |
| **Cancel** | Button | Closes the edit form | Only when editing |
| Tele-Law / NALSA links | Links | Free legal help (NALSA helpline 15100) | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date you signed** | Date | Yes | Not in the future; not before the generation date | Empty | "Enter the date you signed." / "The signing date cannot be in the future." / "The signing date cannot be before the will was generated (<date>)." |
| **Witness 1/2 - full name** | Text | Yes | ≥ 2 characters each, ≤ 120, two different people, not you | Empty | "Enter the full name of both witnesses." / "Your two witnesses must be two different people." / "You cannot be a witness to your own will. Choose someone else." |
| **Signed copy** | File | First time only | PDF, JPEG, PNG or WebP (checked by content), ≤ 20 MB | — | "Attach the signed copy." / "Upload the signed will as a PDF or a photo (JPEG, PNG or WebP)." / "The file is larger than 20 MB." |

**Settings and toggles here:** None.

**Results:** Status **Executed**; witness names stored encrypted ("Witness names are stored encrypted and shown only to you."); the signed copy stored as "will-v<N>-signed.<ext>"; next review = signing date + 2 years (correcting witnesses with the same date keeps the review date).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This will can't be signed and stored here: it is still a draft or was discarded." | Not generated | Generate first |
| "This will can't be signed and stored any more" | It was replaced meanwhile | Open the current version |
| "This will changed while you were saving. Reload and try again." | Concurrent change | Reload |
| Amber warning "One of your witnesses has the same name as a beneficiary…" | Witness name matches a beneficiary | Speak to a lawyer; consider re-signing |

**Limitations:** A superseded version's record is read-only ("This version was replaced by a newer version. Its record is kept here as history."). Uploads are limited to 10 per minute.

**How it works:** `GET /api/will/wills/:id/execution`; `POST /api/will/wills/:id/execution` (multipart, one file, multer limit 20 MB, type sniffed from bytes); `GET /api/will/wills/:id/signed-copy` (no plan gate).

**Related features:** F-WILL-003, F-WILL-011, F-WILL-013.

**Sources:** `apps/web/src/pages/will/execute/WillExecutePage.tsx:19`, `apps/web/src/pages/will/execute/WillExecutePage.tsx:84`, `apps/web/src/pages/will/execute/SignedCopyForm.tsx:33`, `apps/web/src/pages/will/execute/executeCopy.ts:5`, `apps/web/src/pages/will/execute/executeCopy.ts:52`, `packages/shared/src/will/execution.ts:13`, `packages/api/src/services/will/willExecute.service.ts:43`, `packages/api/src/services/will/willExecute.service.ts:113`, `packages/api/src/middleware/willUpload.ts:16`

### Will documents after a plan lapse <!-- F-WILL-013 -->
**What it does:** Below PLUS, Will Maker is locked but the card "Your will documents" still offers **Download PDF** and **Download signed copy** for your current version: "Version N stays yours to download on any plan."

**Why it exists:** Code comment: "A user always keeps their own will, whatever their plan".

**Where to find it:** **Planning → Will Maker** when your plan is below PLUS.

**Who can use it:** R-FREE (and any plan) with a generated will.

**Steps**
1. Open **Planning → Will Maker**. Under the lock card, click **Download PDF** or **Download signed copy**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download PDF** | Button | Downloads the current version | Card hidden with no generated will |
| **Download signed copy** | Button | Downloads the signed copy | Only when stored |

**Fields and rules:** Not applicable — downloads only.

**Settings and toggles here:** None.

**Results:** Files download; nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't download the file" | Download failed | Retry |

**Limitations:** Editing, new versions and storing a signed copy need PLUS.

**How it works:** `GET /api/will/documents`, `/versions/:vid/pdf`, `/wills/:id/signed-copy` are mounted before the WILL_MAKER gate (still refused while managing).

**Related features:** F-WILL-001, F-WILL-012.

**Sources:** `apps/web/src/pages/will/WillGuards.tsx:25`, `apps/web/src/pages/will/WillGuards.tsx:61`, `packages/api/src/routes/will.routes.ts:47`

### What this area doesn't do
- It does not support wills under foreign law or Muslim personal law.
- It does not give legal advice or register the will; registration is your step at the Sub-Registrar.
- You can't make or view a will for a managed family member, even as their keeper.
- You can't edit a generated version; changes need a new version.
- Only one draft can exist at a time.
