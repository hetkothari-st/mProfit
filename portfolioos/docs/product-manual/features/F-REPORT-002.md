---
id: F-REPORT-002
title: "Report search"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-REPORT-011, F-REPORT-012, F-REPORT-013, F-REPORT-014]
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Report search

`F-REPORT-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** A search box above the filters ("Search reports… e.g. XIRR, LTCG, holdings statement") that finds any tab, statement or Tax & MIS report by words in its title or description and jumps to it.

**Why it exists:** The page holds 12 tabs, 4 statements and 42 catalog reports; a short blurb per tab makes them "findable by keyword in the search bar below, not just by their tab label" (code comment).

**Where to find it:** **Tools → Reports**, top of the page.

**Who can use it:** Everyone who can open Reports ([R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager)).

**Steps**
1. Type a word, for example "dividend". Up to 8 matches appear, each with the tab it lives on.
2. Use the arrow keys and **Enter**, or click a match. The page switches to that tab; a statement or catalog card is scrolled into view and outlined for about 1.8 seconds.
3. Press **Escape** to close the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Search field | Text | Filters the index as you type | Never |
| Clear search (×) | Button | Empties the field | Hidden while the field is empty |
| Match row | Button | Opens the tab and highlights the card | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Search | Text | No | Case-insensitive substring of title or description; max 8 results | Empty | "No reports match "<text>"" |

**Settings and toggles here:** None.

**Results:** Only navigation; nothing is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No reports match "…"" | No title or description contains the text | Try a shorter word (for example "gain") |

**Limitations:** The **Tax & MIS downloads**, **Statements** and **Inbox imports** tabs themselves are not in the index (their cards are). A catalog report found by search is still locked if your plan does not include it.

**How it works:** A static index built from the tab hints, the 4 statement cards and the 42 Tax & MIS report definitions. Matching is in the browser. The dropdown closes 150 ms after the field loses focus so a click can register.

**Related features:** [F-REPORT-011](F-REPORT-011.md), [F-REPORT-012](F-REPORT-012.md), [F-REPORT-013](F-REPORT-013.md), [F-REPORT-014](F-REPORT-014.md).

**Sources:** `apps/web/src/pages/reports/ReportsPage.tsx:60`, `apps/web/src/pages/reports/ReportsPage.tsx:107`, `apps/web/src/pages/reports/ReportsPage.tsx:437`, `apps/web/src/pages/reports/ReportsPage.tsx:494`, `apps/web/src/pages/reports/ReportsPage.tsx:512`
