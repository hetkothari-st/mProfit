## Succession

**Succession** (called "Legacy Transfer" in code and URLs) makes sure the people you name — your **nominees** — learn about your finances if you stop using EveryPaisa for a long time, or on a date you choose. You pick what each nominee may see. Before anything is shared there are three weekly reminder emails to you and a 7-day notice to nominees; signing in or clicking "I'm OK" stops it. Nominees then get a read-only view behind an emailed one-time code. The page footer states: "Succession shares information only. It is not a will and does not transfer any asset. Nominees never get edit access."

### Succession status and controls <!-- F-SUCC-001 -->
**What it does:** Shows the plan's **Status** badge and a one-line next event, and offers the controls that fit the status: **Turn on**, **Pause** (with a date), **Resume**, **Revoke all access**, **Turn off**.

**Why it exists:** Page description: "Make sure your loved ones are never left in the dark about your finances."

**Where to find it:** **Planning → Succession** (route `/legacy`).

**Who can use it:** Configuring and turning on needs R-PLUS or higher (R-PLUS, R-FAMILY, R-PRO). R-FREE can open the page and see the card "Succession is part of the PLUS plan." — if a plan already runs they can still pause, resume, turn off, revoke and remove nominees. Not available while managing someone's account (R-MANAGER).

**Steps**
1. Open **Planning → Succession**.
2. With at least one nominee, click **Turn on**. Confirm it's you (F-SUCC-005). Toast "Succession is on"; status becomes **On**.
3. To pause while counting, pick a **Pause until** date and click **Pause** (toast "Paused"); click **Resume** to restart (toast "Resumed").
4. After release, click **Revoke all access** (toast "Access withdrawn"); the plan re-arms.
5. Click **Turn off** at any time after turning on (toast "Succession is off").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Turn on** | Button | Arms the plan | Shown only when Off; disabled below PLUS or with no nominees ("Add a nominee to turn it on.") |
| **Pause until** | Date | Date the pause ends | Shown only while counting (On, reminders, nominees notified) |
| **Pause** | Button | Pauses the plan | Disabled with no date |
| **Resume** | Button | Re-arms a paused plan | Shown only when Paused |
| **Revoke all access** | Button | Withdraws every nominee's access and re-arms | Shown only when Shared with nominees |
| **Turn off** | Button | Back to Off; every link and session stops | Hidden when Off |
| **See plans** | Link | Opens `/pricing` | Shown only below PLUS |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Pause until** | Date | Yes for Pause | After today, at most 180 days ahead | Empty | "Pause for up to 180 days." |

**Settings and toggles here:** S-SUCC-006 **Pause until**.

**Results:** Status labels: Off, On, Reminder sent, Second reminder sent, Final reminder sent, Nominees notified, Shared with nominees, Paused. Turning on emails each unconfirmed nominee a "Confirm" invitation. Every change emails you "Your Succession plan was changed" and is audit-logged.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add at least one nominee first." | Turning on with none | Add a nominee |
| "Pick a future release date first." | Date trigger without a future date | Set a date |
| "The plan is already on." | Already armed | — |
| "Only an active plan can be paused." / "The plan is not paused." / "Nothing has been shared yet." | Wrong status | Refresh |
| "Confirm it is you first." | No valid step-up confirmation | Enter the code (F-SUCC-005) |
| "Switch back to your own account to do this." | You are managing someone's account | **Back to my account** |

**Limitations:** Pausing during "Nominees notified" sends each nominee an "Update about <you>" email. A scheduled release date that passed during a pause is dropped (the plan falls back to inactivity). You can remove the last nominee of a running plan; it then has nobody to notify.

**How it works:** `GET /api/legacy` (no plan gate) creates the plan on first visit (status DRAFT) and returns status, settings, letter, nominees and the next-event sentence. `POST /api/legacy/activate|pause|resume|deactivate|revoke` all require a step-up grant header; activate also needs LEGACY_TRANSFER. Turning off wipes all nominee links, codes and sessions; revoking all access does the same and re-arms with a fresh clock. Plan status alone drives the countdown — a plan armed on PLUS keeps running after the subscription lapses.

**Related features:** F-SUCC-002, F-SUCC-004, F-SUCC-005, F-SUCC-006.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:24`, `apps/web/src/pages/legacy/LegacyPage.tsx:91`, `apps/web/src/pages/legacy/LegacyPage.tsx:103`, `apps/web/src/pages/legacy/LegacyPage.tsx:203`, `packages/api/src/routes/legacy.routes.ts:19`, `packages/api/src/services/legacy/plan.service.ts:67`, `packages/api/src/services/legacy/plan.service.ts:217`, `packages/api/src/services/legacy/plan.service.ts:231`, `packages/api/src/services/legacy/plan.service.ts:264`, `packages/api/src/services/legacy/plan.service.ts:278`, `packages/api/src/services/legacy/runner.service.ts:12`

### When to share <!-- F-SUCC-002 -->
**What it does:** Sets what starts the countdown — **If I'm inactive**, **On a date**, or **Whichever comes first** — the inactivity period, the release date and an optional personal letter for nominees.

**Why it exists:** Inferred from behavior: owners choose between an inactivity "dead man's switch" and a fixed release date.

**Where to find it:** **Planning → Succession → When to share** card.

**Who can use it:** R-PLUS and above; editable only while the plan is Off, On or Paused.

**Steps**
1. Choose **Trigger**.
2. For inactivity, set **Inactive for (days, at least 30)**. For a date, set **Release date**.
3. Optionally write a **Personal letter (optional)** (placeholder "e.g. FD papers are in the SBI locker #42").
4. Click **Save** and confirm it's you. Toast "Saved".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Trigger** | Select | Inactivity / date / whichever first | Disabled when not editable or below PLUS |
| **Inactive for (days, at least 30)** | Number | Inactivity period | Hidden for **On a date** and in test mode |
| **Release date** | Date | Scheduled release | Hidden for **If I'm inactive** |
| **Personal letter (optional)** | Text area | Letter shown to nominees who may see it | Disabled when not editable |
| **Save** | Button | Saves settings | Disabled when not editable or invalid |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Trigger | Select | Yes | INACTIVITY / SCHEDULED / BOTH | If I'm inactive | — |
| Inactive for | Integer days | Yes | 30–3,650 | 90 | "Inactivity period must be at least 30 days" |
| Release date | Date | For date triggers | YYYY-MM-DD, after today (IST) | Empty | "Pick a release date." / "The release date must be in the future." / "Use YYYY-MM-DD" |
| Personal letter | Text | No | ≤ 20,000 characters; stored encrypted | Empty | — |

**Settings and toggles here:** S-SUCC-001 **Trigger**, S-SUCC-002 **Inactive for**, S-SUCC-003 **Release date**, S-SUCC-004 **Personal letter**, S-SUCC-005 **Test mode** (admins).

**Results:** On an armed plan, changing the inactivity days restarts the inactivity clock from now.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Settings are locked while reminders are going out or after release. Pause or revoke first." | Status is a reminder stage, Nominees notified or Shared | Pause or revoke |
| "The plan is counting down or released. Pause or revoke it first." | Same, from the server | Same |

**Limitations:** Inactivity counts IST calendar days; app activity is recorded at most once an hour.

**How it works:** `PUT /api/legacy/settings` (LEGACY_TRANSFER + step-up grant). The letter is encrypted at rest. See F-SUCC-006 for how the trigger drives the countdown.

**Related features:** F-SUCC-001, F-SUCC-003, F-SUCC-006.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:122`, `apps/web/src/pages/legacy/LegacyPage.tsx:147`, `apps/web/src/pages/legacy/LegacyPage.tsx:167`, `packages/api/src/schemas/legacy.schemas.ts:6`, `packages/api/src/services/legacy/plan.service.ts:89`, `packages/shared/src/legacy.ts:11`

### Succession test mode (admins) <!-- F-SUCC-003 -->
**What it does:** For administrators only, a checkbox **Test mode: 1 minute (admins only)** makes inactivity and every reminder stage last 1 minute, so nominees get access in about 5 minutes. The status shows a red badge "Test mode · 1 minute".

**Why it exists:** Code comment: "Test mode can release someone's finances in ~5 minutes: admins only, server-enforced."

**Where to find it:** **Planning → Succession → When to share** (visible only to admins).

**Who can use it:** R-ADMIN (who also has PLUS or higher).

**Steps**
1. Tick **Test mode: 1 minute (admins only)**. The trigger switches to **If I'm inactive**.
2. Click **Save**, then **Turn on**. Use test nominee emails.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Test mode: 1 minute (admins only)** | Checkbox | Switches to 1-minute units | Hidden for non-admins; disabled when not editable |

**Fields and rules:** Test mode requires the inactivity trigger ("Test mode works with the inactivity trigger only."); non-admins get "Test mode is for admins only."

**Settings and toggles here:** S-SUCC-005 **Test mode**.

**Results:** A per-minute job advances the plan; the help text warns "Browsing the app only counts as activity once an hour, so use the "I'm OK" email link to test a reset."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Test mode is for admins only." | Non-admin request | — |

**Limitations:** Real emails are sent to the nominees entered.

**How it works:** `testMode` on the plan; the state machine counts minutes instead of IST days; a cron runs every minute for test-mode plans only.

**Related features:** F-SUCC-006.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:132`, `packages/api/src/services/legacy/plan.service.ts:91`, `packages/api/src/services/legacy/stateMachine.ts:51`, `packages/api/src/jobs/legacyTransferJob.ts:31`

### Nominees <!-- F-SUCC-004 -->
**What it does:** Lists up to 10 nominees (name, relationship, **Verifier** badge, email with confirmation state, what they can see, whether amounts are shown) and lets you add, edit, remove or (after release) revoke one nominee's access.

**Why it exists:** Inferred from behavior: each nominee can be given exactly the categories, documents and level of detail the owner chooses.

**Where to find it:** **Planning → Succession → Nominees** card.

**Who can use it:** Adding and editing need R-PLUS or above; removing and revoking work on any plan.

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

**Settings and toggles here:** S-SUCC-007 **What they can see**, S-SUCC-008 **Show amounts**, S-SUCC-009 **Verifier**, S-SUCC-010 **Priority**, S-SUCC-011 **Documents to share**.

**Results:** On a running plan a new nominee (or one whose email changed) gets a "<you> named you as a trusted contact" email with **Confirm**; on a released plan they also get access at once. Until they confirm, the list shows "⚠ email not confirmed yet". Making someone the verifier removes the badge from anyone else.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nominee not found" | Already removed | Refresh |
| "No documents in your vault yet." | Documents ticked but vault empty | Upload in **Documents** (D-SUCC-001) |

**Limitations:** A replaced will document is offered in the picker only where it is already shared, so it can be unticked. Changing a nominee's email cancels their old links and unsent emails.

**How it works:** `POST/PUT /api/legacy/nominees[/:id]` (LEGACY_TRANSFER + grant), `DELETE /api/legacy/nominees/:id` (grant only), `POST /api/legacy/revoke` with `nomineeId`. Names and emails are stored encrypted; document ids that are not yours are dropped.

**Related features:** F-SUCC-001, F-SUCC-005, F-SUCC-008, D-SUCC-001.

**Sources:** `apps/web/src/pages/legacy/LegacyPage.tsx:170`, `apps/web/src/pages/legacy/NomineeDialog.tsx:11`, `apps/web/src/pages/legacy/NomineeDialog.tsx:38`, `packages/api/src/schemas/legacy.schemas.ts:18`, `packages/api/src/services/legacy/plan.service.ts:28`, `packages/api/src/services/legacy/plan.service.ts:133`, `packages/api/src/services/legacy/plan.service.ts:159`, `packages/api/src/services/legacy/plan.service.ts:210`, `packages/shared/src/legacy.ts:22`

### Confirm it's you (step-up) <!-- F-SUCC-005 -->
**What it does:** Before any change to Succession, asks for a fresh code: your authenticator code (or a backup code) if two-factor sign-in is on, otherwise a 6-digit code emailed to you. A confirmation lasts about 15 minutes in that tab.

**Why it exists:** Code comment: "Every owner mutation needs a fresh step-up grant."

**Where to find it:** Opens automatically from any Succession change (dialog "Confirm it's you").

**Who can use it:** The plan owner.

**Steps**
1. Make a change. The dialog reads "Enter the code from your authenticator app (or a backup code)." or "We emailed you a 6-digit code."
2. Enter **Code** and click **Confirm** (or press Enter). The change then runs.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Code** | Text | The code | — |
| **Confirm** | Button | Verifies | Disabled under 6 characters or while busy |
| **Cancel** | Button | Abandons the change | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Code** | Text | Yes | 6–20 characters; emailed codes expire in 10 minutes; 5 wrong tries lock for 30 minutes | Empty | "That code didn't match." / "That code has expired. Request a new one." / "Too many attempts. Try again in 30 minutes." |

**Settings and toggles here:** None (two-factor sign-in is set in Settings, D-SUCC-002).

**Results:** A 15-minute grant is held in memory; a page reload asks again.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn't send the code. Try again shortly." | Email send failed | Retry |
| Rate limit error | More than 5 step-up requests a minute | Wait a minute |

**Limitations:** The grant is not shared across tabs.

**How it works:** `POST /api/legacy/step-up` then `/step-up/verify` (both limited to 5 per minute) return a grant sent as the `X-Legacy-Grant` header on changes.

**Related features:** F-SUCC-001, F-SUCC-002, F-SUCC-004, D-SUCC-002.

**Sources:** `apps/web/src/pages/legacy/StepUpDialog.tsx:11`, `apps/web/src/api/legacy/legacy.api.ts:26`, `packages/api/src/controllers/legacy.controller.ts:23`, `packages/api/src/services/legacy/tokens.service.ts:18`, `packages/api/src/services/legacy/tokens.service.ts:143`

### Countdown, reminders and release <!-- F-SUCC-006 -->
**What it does:** Runs the plan automatically. Inactivity: after the chosen days without activity you get "Are you OK? (first Succession reminder)", then a second and a final reminder a week apart, then nominees are told access opens in 7 days ("Nominees notified"), then access is released. Date: reminders 30, 7 and 1 day before, then release on the date. Signing in or clicking "I'm OK" resets the countdown.

**Why it exists:** UI text: "Then 3 email reminders a week apart, and a 7-day notice to nominees, before anything is shared."

**Where to find it:** Automatic; the status card on `/legacy` shows the current stage and next event (e.g. "First warning on <date> if you stay inactive.").

**Who can use it:** Runs for every armed plan regardless of the owner's current plan.

**Steps**
1. Not applicable — automatic. To stop a countdown, sign in or click **I'm OK** in a reminder email (F-SUCC-007).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None on screen | — | — | — |

**Fields and rules:** Not applicable — automatic.

**Settings and toggles here:** S-SUCC-001, S-SUCC-002, S-SUCC-003, S-SUCC-005.

**Results:** Emails, in order: owner reminders (with **I'm OK — reset the countdown**), owner "Your nominees will get access in 7 days" and nominee "About <you>'s Succession plan", a verifier "Please confirm: is <you> OK?", then nominee "<you> has shared their financial information with you" with **View information**, and owner "Your Succession plan was released". A reset from the notice stage emails nominees "Update about <you>".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Reminders keep arriving | You haven't signed in since the stage started | Sign in or click **I'm OK** |

**Limitations:** The daily run is at 10:00 IST, so stages move once a day. App activity counts at most once an hour. Scheduled release has no 7-day notice stage. Unsent emails retry with backoff (10 min doubling, capped at 6 h) and never drop.

**How it works:** `legacyTransferJob`: daily tick 10:00 IST, outbox retry hourly at :20, test-mode tick every minute (disable with `ENABLE_LEGACY_CRON=false`). A pure state machine decides the step from status, trigger, inactivity days, stage start, last activity and IST days; activity after a stage began always wins (reset). Stage length 7 days; reminders at 30/7/1 days for a date trigger. Each step and its emails commit together (outbox, sent once per plan/kind/cycle/recipient). Activity is any authenticated request by the owner (not when managing someone), throttled to once per hour.

**Related features:** F-SUCC-001, F-SUCC-007, F-SUCC-008.

**Sources:** `packages/api/src/jobs/legacyTransferJob.ts:45`, `packages/api/src/services/legacy/stateMachine.ts:66`, `packages/api/src/services/legacy/stateMachine.ts:101`, `packages/api/src/services/legacy/runner.service.ts:58`, `packages/api/src/services/legacy/runner.service.ts:141`, `packages/api/src/services/legacy/outbox.service.ts:25`, `packages/api/src/services/legacy/emails.ts:40`, `packages/api/src/services/legacy/activity.service.ts:13`, `packages/api/src/middleware/authenticate.ts:40`

### Email link actions: I'm OK, Confirm, Verifier answer <!-- F-SUCC-007 -->
**What it does:** Three no-login pages behind emailed links. **I'm OK** resets the owner's countdown. **Confirm** lets a new nominee confirm their email works. The verifier page asks "Has something happened to them?" with **Yes, share their information now** (releases immediately) or **No, they're fine** (resets the countdown).

**Why it exists:** Code comment: "Nothing happens on load: the action is a button click, so email link scanners that open URLs can't trigger it."

**Where to find it:** Email links `/legacy/ok/:token`, `/legacy/ack/:token`, `/legacy/verify/:token`.

**Who can use it:** Whoever holds the link (R-VISITOR): the owner for I'm OK, a nominee for Confirm, the verifier nominee for the verifier page.

**Steps**
1. Open the link. The card "EveryPaisa Succession" appears.
2. Click the button. Messages: "Thanks. Your countdown has been reset." / "Confirmed. Thank you." / "Thank you. Their nominees now have access." / "Thank you. The countdown has been reset."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **I'm OK** | Button | Resets the countdown | Disabled while busy |
| **Confirm** | Button | Confirms the nominee email | Disabled while busy |
| **Yes, share their information now** | Button | Releases now | Verifier page only |
| **No, they're fine** | Button | Resets | Verifier page only |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** As above; verifier answers are audit-logged and the owner gets "Your verifier said you are OK" after a **No, they're fine**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link is no longer valid." | Expired, used, from an older cycle, or the plan moved on | Nothing to do; the owner can sign in |

**Limitations:** Link lifetimes: Confirm 365 days, I'm OK 30 days, verifier 14 days. A verifier answer counts only during the 7-day notice stage and only if the owner has shown no activity since it began. An old cycle's I'm OK link still records activity but doesn't reset a newer stage. Limited to 10 requests a minute.

**How it works:** `POST /api/legacy-public/ok|ack/:token`, `GET/POST /api/legacy-public/verify/:token` (body CONFIRM or FINE).

**Related features:** F-SUCC-006, F-SUCC-008.

**Sources:** `apps/web/src/pages/legacy/LegacyLinkPage.tsx:16`, `packages/api/src/routes/legacy.routes.ts:39`, `packages/api/src/services/legacy/publicLinks.service.ts:25`, `packages/api/src/services/legacy/publicLinks.service.ts:74`, `packages/api/src/services/legacy/tokens.service.ts:18`

### Nominee view of shared information <!-- F-SUCC-008 -->
**What it does:** After release, a nominee opens their link, receives a one-time code by email, and sees "<owner>'s financial information": the owner's letter, one section per allowed category (items with last 4 digits, nominee names, notes and — if allowed — amounts), "How to claim" checklists, shared documents to download, and **Download PDF**.

**Why it exists:** Release email text: "<owner> set up EveryPaisa Succession so that you would not be left in the dark about their finances."

**Where to find it:** Email link `/legacy/access/:token`.

**Who can use it:** R-NOMINEE (holds the access link and the emailed code). Read-only.

**Steps**
1. Open the link; "Shared financial information" appears. Click **Send code**.
2. Enter the 6-digit code ("We sent a code to <masked email>. It expires in 10 minutes.") and click **Open** (or **Resend**).
3. Read the sections; open **How to claim**; click **Download PDF** or a document's **Download**.
4. If the link has expired, click **Email me a fresh link**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Send code** / **Resend** | Buttons | Emails a code | Disabled while busy |
| **Open** | Button | Opens the view | Disabled until 6 digits |
| **Email me a fresh link** | Button | Mails a new link to the nominee's address | Shown after an error |
| **Download PDF** | Button | Downloads "legacy-information.pdf" | — |
| **Download** (per document) | Button | Downloads the document | — |
| **How to claim** | Expander | Shows the claim checklist | Hidden for categories without one |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Code | Digits | Yes | Exactly 6 digits; 10-minute expiry; 5 wrong tries lock 30 minutes | Empty | "Enter the 6-digit code" / "That code didn't match." / "That code has expired. Request a new one." / "Too many attempts. Try again in 30 minutes." |

**Settings and toggles here:** S-SUCC-007, S-SUCC-008, S-SUCC-011 (decided by the owner).

**Results:** A 30-minute session kept in this tab only. Every view, PDF and document download is audit-logged to the owner's account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This link is no longer valid." | Access ended or link expired (90 days) | **Email me a fresh link** — "If this link was sent to you, a fresh one is on its way to the same email address." |
| "Session expired. Open your link again." | 30-minute session ended | Open the link again |
| "We couldn't send the code. Try again shortly." | Email failed | Retry |

**Limitations:** "Total of listed assets" sums Investments, Bank accounts, Property, Vehicles and Provident fund & NPS only, and only when amounts are allowed. Investments list every holding in portfolios the owner created (including family-shared ones they created). Access link and code requests are limited to 15 per 15 minutes.

**How it works:** `POST /api/legacy-public/access/:token/otp|session|reissue`, then `GET /api/legacy-view`, `/pdf`, `/documents/:id` with the `X-Legacy-Session` header — a nominee session can reach nothing else. Data is read in the owner's security context, only for allowed categories; with amounts off, no figure is sent.

**Related features:** F-SUCC-004, F-SUCC-006, D-SUCC-001.

**Sources:** `apps/web/src/pages/legacy/LegacyAccessPage.tsx:28`, `apps/web/src/pages/legacy/LegacyAccessPage.tsx:60`, `apps/web/src/pages/legacy/LegacyAccessPage.tsx:101`, `packages/api/src/controllers/legacy.controller.ts:105`, `packages/api/src/middleware/legacySession.ts:10`, `packages/api/src/services/legacy/view.service.ts:25`, `packages/api/src/services/legacy/view.service.ts:111`, `packages/api/src/services/legacy/tokens.service.ts:22`, `packages/shared/src/legacy.ts:35`

### What this area doesn't do
- It does not transfer any asset or act as a will; it shares information only.
- Nominees never get edit access or a login.
- You can't set different release rules per nominee; one trigger applies to the whole plan.
- A manager can't set up or view Succession for a managed family member.
- There is no SMS reminder; all notices are email.
