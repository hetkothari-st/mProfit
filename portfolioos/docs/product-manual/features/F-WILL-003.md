---
id: F-WILL-003
title: "Will review reminders"
module: "Will Maker"
status: Live
roles: "Signed-will owners"
settings: []
related: [F-WILL-001, F-WILL-012]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Will review reminders

`F-WILL-003` · Live · Roles: Signed-will owners

**What it does:** Two years after you sign (and every two years after a review), a banner "Time to review your will" appears on Will Maker and an alert "Time to review your will" is created. You can answer **Reviewed - no changes** or **My circumstances changed**.

**Why it exists:** Banner text: "Check your will every two years, and whenever your family or finances change - a marriage, a birth, a death, or buying or selling property."

**Where to find it:** **Planning → Will Maker** (banner) and **Tools → Alerts** ([D-WILL-001](../dependencies.md#d-will-001)).

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

**Related features:** [F-WILL-001](F-WILL-001.md), [F-WILL-012](F-WILL-012.md), [D-WILL-001](../dependencies.md#d-will-001).

**Sources:** `apps/web/src/pages/will/WillReviewBanner.tsx:6`, `apps/web/src/pages/will/WillOverviewPage.tsx:125`, `packages/api/src/jobs/willReviewJob.ts:72`, `packages/api/src/services/will/willReview.service.ts:55`, `packages/api/src/services/will/willReview.service.ts:102`, `packages/shared/src/will/execution.ts:11`
