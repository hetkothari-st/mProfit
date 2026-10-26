---
id: F-IMPORT-005
title: "Reprocess an import"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-IMPORT-004, F-IMPORT-008, F-IMPORT-009, F-IMPORT-010]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Reprocess an import

`F-IMPORT-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Runs an existing import job again from its stored copy of the file, without re-uploading. Rows already imported are skipped, so only missing rows are added.

**Why it exists:** Inferred from behavior and code comments: a job may fail for a temporary reason or because a parser has since been fixed; reprocessing recovers it safely because every imported row carries a deterministic fingerprint.

**Where to find it:** **Tools → Import → Import history**, reprocess (circular arrows) icon on a row; labelled **Reprocess** on phones.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person's imports.

**Steps**
1. Click the reprocess icon on the row. The icon is disabled while the request runs (this can take up to 5 minutes for a large file).
2. When it returns, a toast says "Reprocessing started" and the list reloads with the new counts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Reprocess icon (tooltip "Reprocess") | Button | Re-runs the job | Disabled while any reprocess request is in flight |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The job's status, counts and issues are replaced with the new run's results. New rows are added; existing ones are counted as skipped duplicates.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Reprocessing timed out — try a smaller file" | Run exceeded 5 minutes | Split the file |
| "Source file not found on server" (download) / reprocess fails | Very old jobs stored only on local disk lost their file in a deploy | Upload the file again |
| "Reprocess failed" | Other error | Try again later |

**Limitations:** The toast appears only after the run has finished, despite saying "started". The job keeps its original target portfolio.

**How it works:** `POST /api/imports/:id/reprocess` (rate-limited, 10/min) calls the same processing function as the worker, inline, raced against a 5-minute timer. The encrypted copy is decrypted to a temporary local file for the parsers and removed again afterwards.

**Related features:** [F-IMPORT-004](F-IMPORT-004.md), [F-IMPORT-008](F-IMPORT-008.md), [F-IMPORT-009](F-IMPORT-009.md), [F-IMPORT-010](F-IMPORT-010.md).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:90`, `apps/web/src/pages/imports/ImportPage.tsx:331`, `packages/api/src/routes/imports.routes.ts:28`, `packages/api/src/controllers/imports.controller.ts:191`, `packages/api/src/services/imports/import.service.ts:191`
