---
id: F-WILL-002
title: "Will history"
module: "Will Maker"
status: Live
roles: "R-PLUS+"
settings: []
related: [F-WILL-001, F-WILL-012]
---

[← Will Maker](../modules/will-maker.md) · [Index](../INDEX.md)

# Will history

`F-WILL-002` · Live · Roles: [R-PLUS](../roles.md#r-plus)+

**What it does:** Card **History** listing every version (newest first) with its status badge and a line such as "Started … - generated … - signed … - replaced by version N - next review …", with **PDF** and **Signed copy** buttons where they exist.

**Why it exists:** Inferred from behavior: keeps every earlier version and its signed copy reachable after a new version replaces it.

**Where to find it:** **Planning → Will Maker → History** card.

**Who can use it:** Same as [F-WILL-001](F-WILL-001.md).

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

**Related features:** [F-WILL-001](F-WILL-001.md), [F-WILL-012](F-WILL-012.md).

**Sources:** `apps/web/src/pages/will/WillHistoryCard.tsx:10`, `apps/web/src/pages/will/WillHistoryCard.tsx:19`, `packages/api/src/routes/will.routes.ts:48`, `packages/api/src/services/will/willGenerate.service.ts:156`
