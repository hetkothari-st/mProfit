---
id: F-SHELL-010
title: "Page error screen"
module: "App layout and navigation"
status: Live
roles: "All signed-in"
settings: []
related: []
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Page error screen

`F-SHELL-010` · Live · Roles: All signed-in

**What it does:** If a page fails while drawing, EveryPaisa replaces just that page with "Something went wrong on this screen — Your data is safe. Try again, or reload the page if it keeps happening." with **Try again** and **Reload**. The sidebar and top bar stay, so you can go elsewhere. If the failure is outside the page area, the whole window shows the same message with only **Reload**.

**Why it exists:** Code comment: without it "the user is left on a blank white screen."

**Where to find it:** Appears in place of a failing page.

**Who can use it:** Everyone signed in.

**Steps**
1. Click **Try again** to draw the page again, or **Reload** to reload the browser tab.
2. Or click another sidebar link — moving to another page clears the error.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Try again** | Button | Re-draws the page | Not shown on the whole-window version |
| **Reload** | Button | Reloads the browser tab | Never |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Nothing is changed in your data.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Something went wrong on this screen" | A display error on that page | **Try again**, then **Reload**; if it persists, report the page to support |

**Limitations:** The error is written only to the browser console; no report is sent to EveryPaisa.

**How it works:** A page-level error boundary wraps every page and resets when the address changes; a second, app-level boundary wraps the whole app.

**Related features:** None.

**Sources:** `apps/web/src/components/ErrorBoundary.tsx:29`, `apps/web/src/components/ErrorBoundary.tsx:35`, `apps/web/src/components/ErrorBoundary.tsx:56`, `apps/web/src/components/layout/AppShell.tsx:107`, `apps/web/src/main.tsx:67`
