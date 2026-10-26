[Index](../INDEX.md)

# Make the Advisor use a specific fund

`W-ADV-003` · Investment Advisor

**Goal:** Override the fund the Advisor names for a bucket.
**Who:** As [W-ADV-001](W-ADV-001.md), after the risk assessment.

| # | You do | The app does |
|---|---|---|
| 1 | In **Override list** choose a **Bucket** | — |
| 2 | Search and pick a fund or stock the app tracks | "Selected: <name>" |
| 3 | Click **Add to <bucket>** | "Added to the approved list" |
| 4 | Click **Refresh recommendations** | New buy legs in that bucket name your product (badge **Adviser-approved product**) |

**Success:** Recommendations name your product.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Add** stays disabled with "…came from a live price lookup…" | Result not in the instrument master | Pick a tracked fund/stock |
| "That product is already approved for this bucket" | Duplicate | — |
