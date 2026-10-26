---
id: F-FAM-018
title: "Shared portfolios"
module: "Family"
status: Live
roles: "Members (view); R-FAMOWNER, R-FAMCONTRIB (create/share)"
settings: []
related: [F-FAM-004, F-FAM-027]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Shared portfolios

`F-FAM-018` · Live · Roles: Members (view); [R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib) (create/share)

**What it does:** Lists the family's shared portfolios (name, currency, holdings, transactions) and lets owners and contributors create a new shared portfolio or attach one of their own personal portfolios to the family.

**Why it exists:** Schema comment: portfolios carry an optional family id "for the family-shared pot (HUF, ancestral fund, joint bank account)".

**Where to find it:** **Family → Members & sharing → Shared portfolios**.

**Who can use it:** All members see the list; **Share existing** and **New shared portfolio** appear for owners and contributors ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib)). Viewers are refused by the server ("VIEWER cannot create family portfolios.").

**Steps**
1. Click **New shared portfolio**, enter **Name**, optional **Description (optional)** and **Currency**, click **Create** — toast "Shared portfolio created".
2. Or click **Share existing**, pick one of your personal portfolios, click **Share** — toast "Portfolio shared with family".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share existing** | Button | Opens "Share an existing portfolio" | Owners/contributors only |
| **New shared portfolio** | Button | Opens "Create shared portfolio" | Owners/contributors only |
| Portfolio radio list | Radio | Picks the portfolio to share (only your own, not already shared) | — |
| **Share** / **Create** / **Cancel** | Buttons | Submit / close | Disabled until a choice/name, or while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | Yes | 1–100 characters | Empty | "Portfolio name is required." |
| **Description (optional)** | Text | No | ≤ 500 characters | Empty | — |
| **Currency** | Text | No | 3 letters, upper-cased | INR | — |

**Settings and toggles here:** None.

**Results:** The portfolio becomes visible to every active member in family view and writable by owners and contributors.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No shared portfolios yet" — "Contributors and viewers can only see own personal + family-shared data (rule A)…" | None exist | Create or share one (note: this hint is outdated — members see each other's personal data within their caps) |
| "No personal portfolios available to share…" | All your portfolios are already shared | — |
| "Portfolio is already shared with a different family. Unshare it first." | Shared elsewhere | Unshare is not available in the UI ([F-FAM-027](F-FAM-027.md)) |
| "You can only share portfolios you own." | Not yours | — |

**Limitations:** No unshare button. The empty-state hint still describes the old "rule A" (see DOCUMENTATION_GAPS.md).

**How it works:** The list filters `GET /api/portfolios` for portfolios whose family id is this family. `POST /api/families/:familyId/portfolios` creates a portfolio owned by you with this family id; `POST …/portfolios/:portfolioId/share` sets the family id on your own portfolio.

**Related features:** [F-FAM-004](F-FAM-004.md), [F-FAM-027](F-FAM-027.md), [D-FAM-004](../dependencies.md#d-fam-004).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:419`, `apps/web/src/pages/family/FamilyPage.tsx:448`, `apps/web/src/pages/family/FamilyPage.tsx:635`, `apps/web/src/pages/family/FamilyPage.tsx:1955`, `packages/api/src/services/family/family.service.ts:1584`, `packages/api/src/services/family/family.service.ts:1633`
