## AI Assistant

The Portfolio Assistant is a chat panel, available from a floating button on every page, that answers questions about your own finances using your EveryPaisa data. Full answers need the Plus plan or higher; on Free you can see one locked preview. It is a deployment option: it works only when the operator has configured an Anthropic API key and switched the feature on.

### AI Assistant launcher and panel <!-- F-AI-001 -->

**What it does:** A round button at the bottom-right of every page (**Open AI Assistant**, tooltip "Ask the AI Assistant") opens the assistant panel. Until you dismiss it, a bubble beside the button first says "New — Meet your Portfolio Assistant. Tap to ask anything about your portfolio." and, after 6 seconds, rotates through "Try asking" questions every 12 seconds; tapping the bubble opens the panel and sends that question. The panel docks in the corner (full screen on phones) and can be expanded into a large centred window.

**Why it exists:** Code comment: the teaser exists "To catch the user's eye … so the first interaction is a real answer, not a blank prompt."

**Where to find it:** Floating button, bottom-right of every signed-in page (above the tab bar on phones).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-ADMIN by their plan). The button is shown to everyone, including when the operator has the assistant switched off.

**Steps**
1. Click the floating button. The panel opens with your most recent chat (a first chat is created for you if you have none).
2. Optionally click the bubble's question instead — the panel opens and sends it once the chat has loaded.
3. Click the expand icon (**Open the big window**) for the large window; click it again (**Shrink to the corner (Esc)**) or click the dimmed page to go back.
4. Press Escape: in the big window it first shrinks the panel; pressed again (or **Close (Esc)**) it closes the panel.
5. Click × on the bubble (**Dismiss**) to stop the teaser for the rest of this browser session.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open AI Assistant** | Floating button | Opens the panel | Hidden while the panel is open; on phones it slides away while you scroll down and returns when you scroll up |
| Teaser bubble ("Meet your Portfolio Assistant." / "Try asking") | Button | Opens the panel and sends the shown question | Hidden after **Dismiss**, while the panel is open, or while scrolled away on phones; on phones it shows the welcome once for 6 seconds and then hides for the session |
| **Dismiss** (×) | Icon button | Hides the teaser for this browser session | — |
| **Open the big window** / **Shrink to the corner (Esc)** | Icon button | Expands/shrinks the panel | Hidden below 640px |
| **Close (Esc)** | Icon button | Closes the panel | Never |
| Escape key | Keyboard | Shrinks, then closes | — |

**Fields and rules:** None here (see F-AI-003 for the question box).

**Settings and toggles here:** S-AI-001 **Assistant big window** — remembered on this browser. S-AI-002 **Assistant teaser dismissed** — this browser session only.

**Results:** The panel shows the AI-use notice first if you have not accepted it (F-AI-002), otherwise your chat.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A red line such as "Request failed with status code 404" at the bottom of the panel | The operator has not enabled the assistant (no Anthropic key, or the switch is off — it is off by default) | Ask the operator to enable it; there is nothing to do in the app |
| "Failed to load conversation." | Loading your chats failed | Close and reopen the panel |

**Limitations:** The floating button does not check whether the assistant is enabled — see DOCUMENTATION_GAPS.md.

**How it works:** On open, the panel loads your chat list, suggested questions (`/api/assistant/suggested`, up to 4) and quota (`/api/assistant/quota`) in parallel, creating a first chat if the list is empty, then loads the newest chat's messages. If the teaser question API fails or returns nothing, four built-in questions are used ("How am I doing overall?", "What's my portfolio XIRR?", "Am I overweight in IT?", "Should I sell any holding for LTCG?"). Every `/api/assistant` endpoint answers 404 `ai_assistant_disabled` unless the server has `ANTHROPIC_API_KEY` set and `ENABLE_LLM_INSIGHTS` is `true`.

**Related features:** F-AI-002, F-AI-003, F-AI-005.

**Sources:** `apps/web/src/components/ai/AssistantButton.tsx:31`, `apps/web/src/components/ai/AssistantButton.tsx:37`, `apps/web/src/components/ai/AssistantButton.tsx:78`, `apps/web/src/components/ai/AssistantButton.tsx:98`, `apps/web/src/components/ai/AssistantButton.tsx:150`, `apps/web/src/components/ai/AIAssistant.tsx:80`, `apps/web/src/components/ai/AIAssistant.tsx:134`, `apps/web/src/hooks/useAIAssistant.ts:110`, `packages/api/src/routes/aiAssistant.routes.ts:58`, `packages/api/src/config/env.ts:118`

### AI-use notice acceptance <!-- F-AI-002 -->

**What it does:** Before your first question, the panel shows "How EveryPaisa uses AI in advice" with six short points (Where AI is used, What the AI does not decide, What the AI sees, Who is responsible, Its limits, Records and changes), a **Read the full notice** link and **I understand**. The assistant will not answer until you accept the current version; a new version of the notice asks again.

**Why it exists:** Code comment: SEBI Investment Adviser Regulations 15(14) and 18(9) — clients must be told how AI is used in advice.

**Where to find it:** Inside the assistant panel, before the chat, until accepted.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Open the assistant. The notice appears.
2. Optionally click **Read the full notice** (opens `/legal/ai-use`).
3. Click **I understand**. The chat appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Read the full notice** | Link | Opens the AI-use page | — |
| **I understand** | Button | Records your acceptance | Shows a spinner while saving |

**Fields and rules:** None.

**Settings and toggles here:** S-AI-003 **AI-use notice accepted** — stored on your account per notice version (currently 2026-10-21).

**Results:** An audit record "ai_disclosure_acknowledged" is written for the version; the chat opens.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "We couldn’t save that. Please try again." | Saving the acceptance failed | Click **I understand** again |
| "Please read and accept how we use AI in advice before asking a question." | A question was sent without an accepted notice (e.g. the notice check failed to load) | Close and reopen the panel and accept the notice |

**Limitations:** If the notice status cannot be loaded, the panel shows the chat; the server still refuses questions until acceptance.

**How it works:** Status is read from the audit log (action `ai_disclosure_acknowledged`, resource `AiDisclosure:<version>`). Accepting posts the version shown; the server rejects a version that is not the current one.

**Related features:** F-AI-003, D-AI-001 (AI-use legal page).

**Sources:** `apps/web/src/components/ai/AiDisclosureCard.tsx:10`, `apps/web/src/components/ai/AiDisclosureCard.tsx:54`, `apps/web/src/hooks/useAiDisclosure.ts:23`, `packages/api/src/ai/aiDisclosure.ts:14`, `packages/api/src/routes/aiAssistant.routes.ts:214`, `packages/shared/src/aiDisclosure.ts:16`

### Ask the assistant (streamed answers, cards, daily quota) <!-- F-AI-003 -->

**What it does:** You type a question (up to 2,000 characters) or tap a suggested one, and the assistant writes its answer word by word, based on your holdings, XIRR, tax position, goals, loans and other data in the current view (your own, or the family's in family view). An answer can end with a small card: a holding (current value, XIRR), a goal (target, projected, gap), a statistic, or a suggested action. After each answer, up to four "Try next" questions appear. The header shows how many questions you have left today.

**Why it exists:** Code comment: the assistant is "designed as a financial planner agent, not a chatbot" — answers from your live data instead of generic advice.

**Where to find it:** Assistant panel → question box at the bottom ("Ask about your XIRR, tax, holdings, goals…").

**Who can use it:** R-PLUS (100 questions a day), R-FAMILY (200), R-PRO (500). R-FREE gets one locked preview only (F-AI-004). While managing a family member's account (R-MANAGER) the assistant does not work — see Limitations.

**Steps**
1. Type a question and press Enter or click send (**Send (Enter)**). Your message appears; three pulsing dots show "Thinking through your numbers…" in the header.
2. The answer streams in. Any card appears under it when the answer finishes.
3. Tap a "Try next" question to ask it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Question box | Text input | Your question | Disabled while an answer is streaming, after the daily limit ("Daily limit reached — resets tomorrow"), or after the free preview ("Upgrade to keep chatting") |
| **Send (Enter)** | Button | Sends | Disabled when the box is empty or disabled |
| Suggested question tiles ("Try one of these") | Buttons | Send that question | Disabled while streaming, after the daily limit or after the free preview; empty chats only |
| "Try next" questions | Buttons | Send that question | Hidden while streaming or after the free preview |
| **How we use AI** | Link | Opens `/legal/ai-use` | Hidden on Free |
| **Prefer your own ChatGPT or Claude? Connect it** | Link | Opens `/settings/ai-connectors` | — |
| Quota "<used>/<limit>" and "<n> questions left today" | Text | Today's usage | Hidden on Free |
| Links inside answers | Links | Open in-app pages or https sites | Other link types are shown as plain text |
| Action card button | Button | Shows the action's label | Does nothing when clicked — see Limitations |

**Fields and rules:** Question: required, 1–2,000 characters (the box stops at 2,000).

**Settings and toggles here:** None.

**Results:** Your question and the answer are saved in the chat, with a record of the data and tools the answer used. The chat's title becomes the first 60 characters of your first question (if it was still "New chat"). One question is taken from today's allowance.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You've hit the daily limit of <n> questions. Resets tomorrow." | Daily quota used | Wait until the reset (00:00 UTC, which is 05:30 IST) or upgrade |
| "Please read and accept how we use AI in advice before asking a question." | Notice not accepted | Accept the notice (F-AI-002) |
| "Chat session not found" | The chat was deleted elsewhere, or you are managing a family member's account | Start a **New chat**; switch back to your own account |
| "Part of the response was lost (<n> unreadable event(s))." | Some streamed pieces could not be read | Ask again |
| "HTTP <status>" or another message in the red line | The server rejected or failed the request | Try again later |

**Limitations:** Answers are AI-written and their content cannot be verified from code. The daily allowance resets at 00:00 UTC (05:30 IST), not at Indian midnight. If an answer fails before any text arrives, the question is given back to your allowance. The question is sent without the "acting as" header, so while managing a family member's account the chat fails — see DOCUMENTATION_GAPS.md. A session that expires mid-chat is not refreshed by the chat request itself. The action card's button has no action.

**How it works:** `POST /api/assistant/chat` streams server-sent events (`token`, `card`, `locked`, `done`, `error`). Before calling the model the server checks the notice, checks the quota against your effective plan, reserves one question atomically (so parallel requests cannot exceed the cap), classifies the question, builds context for your scope (family view header honoured), loads the last 10 messages of the chat, your adviser profile and matching knowledge passages, and saves your question. The model (setting `llm.assistant_model`, else `LLM_ASSISTANT_MODEL`) may call read-only tools up to 3 rounds and writes at most 2,048 tokens. The final answer and its context snapshot are saved; a card in the answer is sent as a separate event and never shown as raw text.

**Related features:** F-AI-002, F-AI-004, F-AI-005, D-AI-002 (AI connectors).

**Sources:** `apps/web/src/hooks/useAIAssistant.ts:254`, `apps/web/src/api/aiAssistant.api.ts:112`, `apps/web/src/api/aiAssistant.api.ts:118`, `apps/web/src/components/ai/AIAssistant.tsx:664`, `apps/web/src/components/ai/MessageBubble.tsx:37`, `apps/web/src/components/ai/PortfolioDataCard.tsx:10`, `apps/web/src/components/ai/PortfolioDataCard.tsx:149`, `packages/api/src/routes/aiAssistant.routes.ts:82`, `packages/api/src/routes/aiAssistant.routes.ts:278`, `packages/api/src/routes/aiAssistant.routes.ts:292`, `packages/api/src/routes/aiAssistant.routes.ts:309`, `packages/api/src/ai/rateLimit.ts:34`, `packages/api/src/ai/rateLimit.ts:48`, `packages/api/src/ai/claudeClient.ts:38`, `packages/api/src/ai/claudeClient.ts:42`

### Free plan locked preview <!-- F-AI-004 -->

**What it does:** On the Free plan the panel looks and behaves the same, and you can send one question. Its answer is shown as blurred grey bars with an **Upgrade to unlock** button instead of text. After that one preview — on any chat, device or browser — the question box, suggested questions and **New chat** are disabled, with "You've used your free preview — upgrade to ask unlimited questions →".

**Why it exists:** Code comment: lets Free users see "the full interactive experience … before revealing it's locked" without paying for an answer.

**Where to find it:** Assistant panel, Free plan.

**Who can use it:** R-FREE.

**Steps**
1. Ask a question. The thinking dots appear, then the blurred answer with **Upgrade to unlock**.
2. Click **Upgrade to unlock** or the footer link to open Pricing.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Upgrade to unlock** | Link | Opens `/pricing` | — |
| "You've used your free preview — upgrade to ask unlimited questions →" | Link | Opens `/pricing` | Shown after the preview |

**Fields and rules:** Same as F-AI-003.

**Settings and toggles here:** None.

**Results:** Your question and an empty "locked" answer are saved; no AI model is called and no allowance is used. The header reads "Free plan — upgrade to unlock full answers".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "The AI Assistant requires a paid plan. Upgrade to unlock." | A second question was sent after the preview | Upgrade |

**Limitations:** One preview per account, ever.

**How it works:** The quota check returns `tier_locked` for Free (daily limit 0). The server checks whether any of your saved messages is marked locked; if none, it saves the question plus a locked empty answer and streams `locked` then `done`.

**Related features:** F-AI-003, F-SHELL-009.

**Sources:** `packages/api/src/routes/aiAssistant.routes.ts:225`, `packages/api/src/routes/aiAssistant.routes.ts:235`, `packages/api/src/routes/aiAssistant.routes.ts:257`, `packages/api/src/routes/aiAssistant.routes.ts:95`, `apps/web/src/components/ai/MessageBubble.tsx:419`, `apps/web/src/components/ai/AIAssistant.tsx:174`, `apps/web/src/components/ai/AIAssistant.tsx:728`

### Chat history (sessions) <!-- F-AI-005 -->

**What it does:** Keeps several separate chats. **Chat history** lists your chats, most recently used first; you can open one, start a **New chat**, rename a chat (pencil) or delete it (bin).

**Why it exists:** Code comment: "the multi-session mechanics every other AI chat product has".

**Where to find it:** Assistant panel header → clock icon (**Chat history**) and pen icon (**New chat**).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (Free: **New chat** is disabled after the free preview).

**Steps**
1. Click **Chat history**. "Your chats" lists your chats, most recently used first.
2. Click a chat to open it; the panel returns to the chat view.
3. Hover a chat and click the pencil (**Rename chat**), type a name, press Enter or click the tick (**Save**); Escape cancels.
4. Hover a chat and click the bin (**Delete chat**). It is deleted at once, without confirmation; if it was open, the next chat opens (or a new one is created).
5. Click **New chat** (header icon or the button at the top of the list) for an empty chat.
6. Click the back arrow (**Back to chat**) to leave the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Chat history** | Icon button | Shows the list | Chat view only |
| **New chat** | Icon button / button | Creates an empty chat | Disabled after the Free preview ("Upgrade to start a new chat") |
| Chat row | Button | Opens the chat | — |
| **Rename chat** | Icon | Edits the title | Appears on hover |
| **Save** | Icon button | Saves the title | Rename only |
| **Delete chat** | Icon | Deletes the chat and its messages | Appears on hover |
| **Back to chat** | Icon button | Returns to the chat | List view only |

**Fields and rules:** Chat title: 1–200 characters; an empty or unchanged title is ignored.

**Settings and toggles here:** None.

**Results:** Chats and messages are stored on the server, so they follow you between devices. New chats are titled "New chat" until the first question.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start a new chat." / "Failed to delete chat." / "Failed to rename chat." | Request failed | Try again |
| "No chats yet." | No chats exist | Ask a question or click **New chat** |

**Limitations:** Delete has no undo. Chats you create while in family view are tagged with that family but listed with all your chats.

**How it works:** `/api/assistant/sessions` list/create/rename/delete, each checked against your user id; history `GET /sessions/:id/history`. Titles longer than 60 characters are cut with "…".

**Related features:** F-AI-003.

**Sources:** `apps/web/src/components/ai/AIAssistant.tsx:433`, `apps/web/src/components/ai/AIAssistant.tsx:493`, `apps/web/src/hooks/useAIAssistant.ts:193`, `apps/web/src/hooks/useAIAssistant.ts:211`, `apps/web/src/hooks/useAIAssistant.ts:237`, `packages/api/src/routes/aiAssistant.routes.ts:91`, `packages/api/src/routes/aiAssistant.routes.ts:129`, `packages/api/src/ai/chatSessions.ts:10`, `packages/api/src/ai/chatSessions.ts:11`, `packages/api/src/ai/chatSessions.ts:49`

### What this area doesn't do
- The assistant never changes your data — it only reads it.
- You cannot attach files or images to a question.
- There is no way to stop an answer while it is streaming.
- There is no export or share of a chat, and no feedback (thumbs up/down) on answers.
- Free users cannot buy single questions; full answers need Plus or higher.

