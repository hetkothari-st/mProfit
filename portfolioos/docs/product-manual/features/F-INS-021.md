---
id: F-INS-021
title: "Help and rights"
module: "Insurance"
status: Live
roles: "All signed-in"
settings: []
related: [F-INS-007, F-INS-009, F-INS-012]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Help and rights

`F-INS-021` · Live · Roles: All signed-in

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

**Related features:** [F-INS-007](F-INS-007.md), [F-INS-009](F-INS-009.md), [F-INS-012](F-INS-012.md).

**Sources:** `apps/web/src/pages/insurance/HelpLibraryPage.tsx:17`, `apps/web/src/components/insurance/help/HelpSearch.tsx:12`, `packages/shared/src/insurance/helpLibrary.ts:33`, `packages/shared/src/insurance/helpLibrary.ts:242`
