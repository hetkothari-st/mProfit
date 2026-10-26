[Index](../INDEX.md)

# Act on a recommendation

`W-ADV-002` · Investment Advisor

**Goal:** Record what you decided about a suggestion.
**Who:** As [W-ADV-001](W-ADV-001.md).
**Before you start:** At least one Open recommendation.

| # | You do | The app does |
|---|---|---|
| 1 | Place the trade yourself with your broker/platform (optional) | Nothing — the app never trades |
| 2 | On the card click **Accept**, **Done**, **Snooze 7 days** or **Dismiss** | Toast "Marked …"; the card moves to that tab |
| 3 | Later, click **Refresh recommendations** | Closed advice is not re-issued unless it changes materially (rule version, instrument shape or amount by more than 10%) |

**Success:** The card shows under its new tab.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This recommendation has been superseded by a newer one — act on that instead" | A later run replaced it | Act on the new card in **Open** |
| A snoozed card never comes back to **Open** | Snoozes are not reopened automatically (known gap) | Open the **Snoozed** tab and act on it |
