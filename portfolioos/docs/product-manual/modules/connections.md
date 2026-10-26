[Index](../INDEX.md)

# Connections

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Two pages that link EveryPaisa to outside services. **AI connectors** (Planning → AI connectors, the user menu → **AI connectors**, or the Settings card **Manage AI connectors**; route `/settings/ai-connectors`) lets your own ChatGPT or Claude read your data, read-only. **Connectors** (Tools → Connectors, route `/connectors`, page title "Broker Connectors") links brokers and the Account Aggregator.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CONN-001](../features/F-CONN-001.md) | Connect ChatGPT or Claude (AI connectors) | Live | Gives you the EveryPaisa connector address and step-by-step instructions to add it as a custom connector in ChatGPT or Claude. |
| [F-CONN-002](../features/F-CONN-002.md) | Connected chatbots: revoke and recent activity | Live | Lists every chatbot connected to your account with when it was connected and last used and what it may read; lets you revoke it and see its … |
| [F-CONN-003](../features/F-CONN-003.md) | Edit what a chatbot can read | Live | Changes which areas, and which family members' data, an already-connected chatbot may read. |
| [F-CONN-004](../features/F-CONN-004.md) | Allow family to include me in their AI connectors | Live | Your consent for relatives who can already see your data in EveryPaisa to let their own chatbot read it too. |
| [F-CONN-005](../features/F-CONN-005.md) | Approve a chatbot connection | Live | The page your chatbot sends you to when you click Connect in it. |
| [F-CONN-007](../features/F-CONN-007.md) | Broker connectors (Zerodha, Upstox, Angel One) | Live | Stores your own broker developer-app keys and logs in to the broker so trades and positions can be synced (the sync itself runs from the … |
| [F-CONN-008](../features/F-CONN-008.md) | Legacy broker connections (deprecated) | Live | Lists broker accounts linked through an older paste-token flow, lets you sync them once more or remove them. |
| [F-CONN-009](../features/F-CONN-009.md) | Account Aggregator (Finvu) consent | Live | Starts an RBI Account Aggregator consent through Finvu for mutual funds and equities, lists your consents with status and dates, and lets … |

Settings for this module: [settings/connections.md](../settings/connections.md)
