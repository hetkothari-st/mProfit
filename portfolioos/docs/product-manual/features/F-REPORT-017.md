---
id: F-REPORT-017
title: "Nightly stored-data integrity check"
module: "Reports"
status: Live
roles: "System; R-ADMIN gets alert"
settings: []
related: [F-REPORT-003]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Nightly stored-data integrity check

`F-REPORT-017` · Live · Roles: System; [R-ADMIN](../roles.md#r-admin) gets alert

**What it does:** Every night at 02:15 IST the app first retries failed imports and emails, then, for every portfolio of every active user, recomputes holdings and capital gains from the transactions alone, compares them with what is stored, and rebuilds anything that drifted. If anything drifted or a portfolio could not be checked, the oldest active administrator gets one in-app alert "Data integrity: stored figures drifted".

**Why it exists:** "The stored rows are a cache of a pure function of the transactions, so when they disagree the cache is wrong by definition and rebuilding it loses nothing." The alert exists because "a drift means some write path skipped its recompute" (code comment).

**Where to find it:** No page. The effect is visible in the Reports data checks banner ([F-REPORT-003](F-REPORT-003.md)) — "They are rebuilt automatically every night, or use Fix now" — and, for administrators, in Alerts.

**Who can use it:** Runs automatically for every user's data. [R-ADMIN](../roles.md#r-admin) receives the alert.

**Steps:** Not applicable — automatic.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| None | — | — | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None for users. Operator switch `ENABLE_DATA_INTEGRITY_CRON` (`false` disables the schedule).

**Results:** Stored holdings and capital-gain rows match your transactions by the morning; a run record is kept (counts, up to 200 per-portfolio detail entries).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Banner still says "out of sync" in the morning | The check failed for that portfolio | Click **Fix now** ([F-REPORT-003](F-REPORT-003.md)) |

**Limitations:** Only portfolios of active users are checked. If no active ADMIN exists, the drift is only logged.

**How it works:** Cron `15 2 * * *` in Asia/Kolkata. Ingestion recovery runs first. Portfolios are listed in system context, each check runs in that user's context (row-level security), with repair on. A second run is skipped while one is in progress. Alert metadata source `data.integrity`.

**Related features:** [F-REPORT-003](F-REPORT-003.md).

**Sources:** `packages/api/src/jobs/dataIntegrityJob.ts:49`, `packages/api/src/jobs/dataIntegrityJob.ts:60`, `packages/api/src/jobs/dataIntegrityJob.ts:66`, `packages/api/src/jobs/dataIntegrityJob.ts:82`, `packages/api/src/jobs/dataIntegrityJob.ts:140`, `packages/api/src/jobs/dataIntegrityJob.ts:158`, `packages/api/src/jobs/dataIntegrityJob.ts:170`, `packages/api/src/jobs/dataIntegrityJob.ts:175`, `packages/api/src/index.ts:240`

**What this area doesn't do**
- You can't schedule reports or have them emailed; every report is downloaded on demand.
- You can't pick a portfolio for the Tax & MIS catalog — it always covers all your portfolios.
- You can't see another member's figures on screen in Reports; only downloads follow **Report for**.
- There is no XIRR or Historical download on this page (use **XIRR / TWR Performance** in the catalog).
- Reports never fill in missing purchases or prices for you.
