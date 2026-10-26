[Index](../INDEX.md)

# Settings — AI Assistant

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-ai-001"></a>
### Assistant big window
| Attribute | Value |
|---|---|
| Control type | Icon toggle (**Open the big window** / **Shrink to the corner (Esc)**) |
| Location | Assistant panel header (screens 640px and wider) |
| Purpose | Docked corner panel or large centred window |
| Default | Docked (source: `apps/web/src/components/ai/AIAssistant.tsx:84`) |
| Values | Expanded · Docked |
| Depends on | — |
| Persists | This device only (not remembered if storage is blocked) |
| Stored in | localStorage `assistant_expanded` ("1" when expanded) |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/ai/AIAssistant.tsx:80`, `apps/web/src/components/ai/AIAssistant.tsx:190` |

<a id="s-ai-002"></a>
### Assistant teaser dismissed
| Attribute | Value |
|---|---|
| Control type | × on the teaser bubble (**Dismiss**) |
| Location | Next to the floating assistant button |
| Purpose | Stop the welcome/"Try asking" bubble and the pulsing ring |
| Default | Not dismissed (source: `apps/web/src/components/ai/AssistantButton.tsx:50`) |
| Values | Dismissed · Shown; on phones it dismisses itself after 6 seconds |
| Depends on | — |
| Persists | This browser tab session only |
| Stored in | sessionStorage `everypaisa.ai-teaser-seen.v2` |
| Backend effect | None |
| Who can change | Everyone signed in |
| Sources | `apps/web/src/components/ai/AssistantButton.tsx:31`, `apps/web/src/components/ai/AssistantButton.tsx:118` |

<a id="s-ai-003"></a>
### AI-use notice accepted
| Attribute | Value |
|---|---|
| Control type | Button (**I understand**) |
| Location | Assistant panel, first use |
| Purpose | Record that you read how AI is used in advice |
| Default | Not accepted (source: `packages/api/src/ai/aiDisclosure.ts:32`) |
| Values | Accepted for the current version (2026-10-21) · Not accepted (assistant refuses questions) |
| Depends on | A new notice version requires acceptance again |
| Persists | Yes — on your account |
| Stored in | AuditLog row, action `ai_disclosure_acknowledged`, resource `AiDisclosure:<version>` |
| Backend effect | Unlocks `POST /api/assistant/chat` |
| Who can change | Everyone signed in; cannot be withdrawn in the app |
| Sources | `packages/api/src/ai/aiDisclosure.ts:39`, `packages/api/src/routes/aiAssistant.routes.ts:214`, `packages/shared/src/aiDisclosure.ts:16` |
