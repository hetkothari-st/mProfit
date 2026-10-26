[Index](../INDEX.md)

# AI Assistant

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The Portfolio Assistant is a chat panel, available from a floating button on every page, that answers questions about your own finances using your EveryPaisa data. Full answers need the Plus plan or higher; on Free you can see one locked preview. It is a deployment option: it works only when the operator has configured an Anthropic API key and switched the feature on.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-AI-001](../features/F-AI-001.md) | AI Assistant launcher and panel | Live | A round button at the bottom-right of every page (Open AI Assistant, tooltip "Ask the AI Assistant") opens the assistant panel. |
| [F-AI-002](../features/F-AI-002.md) | AI-use notice acceptance | Live | Before your first question, the panel shows "How EveryPaisa uses AI in advice" with six short points (Where AI is used, What the AI does … |
| [F-AI-003](../features/F-AI-003.md) | Ask the assistant (streamed answers, cards, daily quota) | Live | You type a question (up to 2,000 characters) or tap a suggested one, and the assistant writes its answer word by word, based on your … |
| [F-AI-004](../features/F-AI-004.md) | Free plan locked preview | Live | On the Free plan the panel looks and behaves the same, and you can send one question. |
| [F-AI-005](../features/F-AI-005.md) | Chat history (sessions) | Live | Keeps several separate chats. |

Settings for this module: [settings/ai-assistant.md](../settings/ai-assistant.md)

### What this area doesn't do
- The assistant never changes your data — it only reads it.
- You cannot attach files or images to a question.
- There is no way to stop an answer while it is streaming.
- There is no export or share of a chat, and no feedback (thumbs up/down) on answers.
- Free users cannot buy single questions; full answers need Plus or higher.
