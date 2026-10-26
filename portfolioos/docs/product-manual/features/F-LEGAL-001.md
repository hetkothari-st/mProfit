---
id: F-LEGAL-001
title: "How EveryPaisa uses AI in advice (notice page)"
module: "Legal pages"
status: Live
roles: "R-VISITOR, R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Legal pages](../modules/legal-pages.md) · [Index](../INDEX.md)

# How EveryPaisa uses AI in advice (notice page)

`F-LEGAL-001` · Live · Roles: [R-VISITOR](../roles.md#r-visitor), [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows the full AI-use notice: title "How EveryPaisa uses AI in advice", a version date, a summary and sections "Where AI is used", "What the AI does not decide", "What the AI sees", "Who is responsible", "Its limits", "Records and changes".

**Why it exists:** The code comment: the notice is required under SEBI Investment Adviser Regulations 15(14) and 18(9), and is "public so it can be read before signing up".

**Where to find it:** Route `/legal/ai-use`; linked from the AI Assistant, the AI disclosure card and advisor recommendation cards ("how we use AI", "full notice").

**Who can use it:** [R-VISITOR](../roles.md#r-visitor) and every signed-in role.

**Steps**
1. Read the page. **← EveryPaisa** returns to the app (or Sign in when signed out).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **← EveryPaisa** | Link | Goes to `/` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The text is the version dated 2026-10-21 in code.

**How it works:** Renders a shared constant, so the same text is used wherever the disclosure appears.

**Related features:** [D-CONN-003](../dependencies.md#d-conn-003).

**Sources:** `apps/web/src/pages/legal/AiUsePage.tsx:5`, `packages/shared/src/aiDisclosure.ts:16`, `apps/web/src/components/ai/AIAssistant.tsx:740`, `apps/web/src/App.tsx:115`

**What this area doesn't do**
- There are no Terms of Service or general app privacy policy pages in the app; the `/privacy` page covers only the browser extension and has no in-app link (see DOCUMENTATION_GAPS).
