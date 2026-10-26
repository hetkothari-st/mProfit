[Index](../INDEX.md)

# Generate AI portfolio insights

`W-ANLYT-001` · Analytics

**Goal:** Get an AI-written review of your portfolio.
**Who:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** Have holdings.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Analytics**, choose portfolio and period | — |
| 2 | In **AI Portfolio Insights**, click **Generate insights** | Reuses a result under 24 h old or generates one; toast |
| 3 | Click **Regenerate** for a fresh run | New narrative and cards |

**Success:** Narrative, cards and disclaimer shown.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Monthly LLM budget reached …" | Monthly AI spend cap reached | Wait for next month |
| "AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true)." | Server setting | Contact the operator |
| "AI Insights is locked" | Free plan | Upgrade ([D-REPORT-004](../dependencies.md#d-report-004)) |
