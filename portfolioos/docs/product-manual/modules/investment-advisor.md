[Index](../INDEX.md)

# Investment Advisor

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Advisor** page (sidebar **Overview → Advisor**) turns your risk profile, a target allocation and what you hold today into a ranked list of suggested moves, each with the reasoning and the figures behind it. It is advisory only: nothing on the page places an order, moves money or contacts a broker. The page needs the Plus plan or higher; on Free it shows a locked card.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ADV-001](../features/F-ADV-001.md) | Advisor page, plan lock and disclaimer | Live | Opens the Investment Advisor page (eyebrow "Intelligence"). |
| [F-ADV-002](../features/F-ADV-002.md) | Risk questionnaire (take or retake) | Live | Seven questions that set your risk category and therefore the target allocation every recommendation is measured against. |
| [F-ADV-003](../features/F-ADV-003.md) | Risk profile summary | Live | A card showing your current category (Conservative, Balanced, Growth or Aggressive) with its one-line description, a Score badge, three … |
| [F-ADV-004](../features/F-ADV-004.md) | Allocation vs target (drift) | Live | The card Where you sit vs. |
| [F-ADV-005](../features/F-ADV-005.md) | Refresh recommendations (advice engine run) | Live | Refresh recommendations runs six rules over your current data and updates your recommendation list. |
| [F-ADV-006](../features/F-ADV-006.md) | Recommendation feed and status tabs | Live | The section Recommendations — What to do next lists your recommendations as cards (F-ADV-007), filtered by the tabs Open, Accepted, … |
| [F-ADV-007](../features/F-ADV-007.md) | Recommendation card and actions | Live | Each card shows the category (for example "Tax Harvest", "Rebalance"), an urgency badge, the status if not Open, "Suggested <date>", where … |
| [F-ADV-008](../features/F-ADV-008.md) | Why this — inputs and fund evidence | Live | Why this expands Inputs this was computed from: every figure the rule used, with readable labels (rupee values formatted as money, … |
| [F-ADV-009](../features/F-ADV-009.md) | Explain in plain English (AI narration) | Live | Explain in plain English asks an AI model to rewrite the card's reasoning in 2–4 plain sentences, shown under In plain English with the … |
| [F-ADV-010](../features/F-ADV-010.md) | Override list (approved products) | Live | The Override list card (marked "Optional") lets you name the exact funds or stocks the engine must use for a bucket. |
| [F-ADV-014](../features/F-ADV-014.md) | Nightly fund scoring (house methodology) | Live | Each night the server scores mutual funds under the firm's ranking methodology. |

Settings for this module: [settings/investment-advisor.md](../settings/investment-advisor.md)
