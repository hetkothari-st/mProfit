# AI Connector (bring your own ChatGPT / Claude) - design

Date: 14/10/2026. Status: approved in conversation, awaiting written-spec review.

## 1. Goal

A user connects their own ChatGPT or Claude (or any MCP-capable chatbot) to EveryPaisa once. From then on, in their own chat window, the chatbot can look up the data the user has entered in EveryPaisa, live and read-only, limited to the areas and family members the user chose to share.

Success: a PLUS user pastes our connector URL into ChatGPT or Claude, approves on an EveryPaisa page, and asks "what is my net worth and which EMIs are due this month?" and gets an answer built from their real EveryPaisa data, with identifiers masked. Revoking in EveryPaisa stops access on the next request.

## 2. Decisions (user, 14/10/2026)

| # | Decision |
|---|---|
| D1 | Integration = remote MCP connector added inside the user's ChatGPT/Claude app (not BYO API key, not a copy/paste export). |
| D2 | Read-only. No tool creates, edits or deletes anything. |
| D3 | User picks shared areas per connection; identifiers always masked to last 4. |
| D4 | Plan gate: PLUS and above (`AI_CONNECTOR: 'PLUS'`). |
| D5 | Family: own data plus family members, chosen per member on the approval screen. |
| D6 | Approach: built into the existing API under `/mcp` with our own OAuth 2.1 authorization server. No new Railway service. |
| D7 | Redirect URIs allowlisted to ChatGPT/Claude hosts (env-extendable). |
| D8 | Members who have their own login are shareable only after they opt in ("Allow family to include me in their AI connectors", default off). Managed profiles (no login, `User.managedById` = the connecting user) need no opt-in. |
| D9 | Delivered in 2 parts (section 10). |

## 3. Out of scope (v1)

Write tools; document file contents; raw MF analytics/ranking internals; accounting module; CA/professional client workspace data; BYO API key in the in-app assistant; non-allowlisted MCP clients.

## 4. Protocol

MCP Streamable HTTP transport, stateless (no `Mcp-Session-Id` persistence), via `@modelcontextprotocol/sdk` server. Authorization per the MCP authorization spec: EveryPaisa is both the OAuth 2.1 authorization server and the protected resource.

Endpoints (API, public origin `API_PUBLIC_URL`):

| Endpoint | Purpose |
|---|---|
| `POST /mcp` (and `GET`/`DELETE` answering 405 where the SDK expects) | MCP JSON-RPC. Requires `Authorization: Bearer <access token>`; without one answers 401 with `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`. |
| `GET /.well-known/oauth-protected-resource` (+ `/mcp` suffixed variant) | RFC 9728 metadata: `resource` = `<origin>/mcp`, `authorization_servers` = [origin], `scopes_supported` = area scopes. |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata: issuer, authorize/token/register/revoke endpoints, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported: ["none"]`, `response_types_supported: ["code"]`. |
| `POST /oauth/register` | RFC 7591 dynamic client registration. Public clients only. Every `redirect_uri` must be `https` and its host in `MCP_REDIRECT_HOST_ALLOWLIST` (default `chatgpt.com,chat.openai.com,claude.ai,claude.com`); otherwise 400 `invalid_redirect_uri`. The display name shown to users is derived from the redirect host ("ChatGPT" / "Claude"), never from the self-asserted `client_name`. |
| `GET /oauth/authorize` | Validates `client_id`, exact `redirect_uri` match, `response_type=code`, `code_challenge` + `code_challenge_method=S256`, `resource` (must equal `<origin>/mcp` when present), `state`. Valid: 302 to web `/connect/authorize?req=<signed request id>`. Invalid client/redirect: error page, never a redirect. |
| `POST /api/connect/authorize/:req/decision` | Called by the web approval page (normal authenticated session, mfa per existing rules, X-Act-As rejected). Body: `{approve, areas[], memberIds[]}`. Approve: create/update grant, issue code, return redirect URL `redirect_uri?code=..&state=..&iss=..`. Deny: return `redirect_uri?error=access_denied&state=..`. |
| `POST /oauth/token` | `authorization_code` (code single-use, 60 s TTL, PKCE verify, same client + redirect_uri, `resource` audience) and `refresh_token` (rotation). |
| `POST /oauth/revoke` | RFC 7009; revokes the grant behind the token. |

Tokens: 32-byte random, base64url, prefixed (`epa_` access, `epr_` refresh). Stored as SHA-256 hashes only; lookup by hash; constant-time compare not needed beyond hash equality on a unique index. Access TTL 1 h, refresh TTL 30 d. Refresh rotation: each use issues a new pair and bumps `McpGrant.refreshGeneration`; presenting a superseded refresh token revokes the grant (reuse detection). Tokens are audience-bound to `<origin>/mcp` and rejected anywhere else; normal API auth never accepts them, and `/mcp` never accepts session JWTs or cookies.

## 5. Data model (new migration, `Mcp*` tables + one User column)

- `McpClient { id, clientId @unique, redirectUris String[], displayName, registeredAt, lastSeenAt? }` - not user-scoped (global, like `TemplateSeed`); written only by registration.
- `McpGrant { id, userId -> User cascade, clientId -> McpClient, areas String[], memberUserIds String[], refreshGeneration Int @default(0), createdAt, lastUsedAt?, revokedAt?, revokedReason? }` `@@index([userId, revokedAt])`. One active grant per (user, client); re-approval updates it.
- `McpAuthCode { id, codeHash @unique, grantId, codeChallenge, redirectUri, resource, expiresAt, usedAt? }`.
- `McpToken { id, tokenHash @unique, grantId -> McpGrant cascade, kind ACCESS|REFRESH, generation Int, expiresAt, createdAt }` `@@index([grantId])`.
- `McpAuthRequest { id, clientId, redirectUri, state, codeChallenge, resource?, scopeHint?, expiresAt (10 min), consumedAt? }` - backs the `req` id on the approval page; not user-scoped (created before login), holds no personal data.
- `User.aiConnectorFamilyOptIn Boolean @default(false)` (D8).

RLS ENABLE + FORCE with owner policy on `McpGrant`, `McpAuthCode`, `McpToken` (via grant owner join); guarded explicit GRANT to `portfolioos_app`; register in `USER_SCOPED_MODELS`; account-deletion purge (tokens -> codes -> grants). Token/code lookups by hash happen before the user is known, so they run in `runAsSystem` reading only the hash row, then everything after switches to `runAsUser(grant.userId)`.

## 6. Areas and tools

Area ids (also the OAuth scopes, `area:<id>`): `investments`, `retirement`, `banking`, `loans`, `insurance`, `property`, `vehicles`, `goals_tax`, `split`, `will`, `documents`. Approval defaults: all on except `will` and `documents`.

| Area | Tools |
|---|---|
| always | `get_overview` (net worth, totals per shared area only, upcoming dues next 30 days), `list_people` (me + shared members, ids, relation, managed/own-login) |
| investments | `list_portfolios`, `list_holdings`, `list_transactions` (from, to, portfolio?, cursor; max 200), `get_performance` (XIRR, allocation, realised/unrealised), `get_capital_gains` (fy), `list_forex` |
| retirement | `list_retirement_accounts` (EPF, PPF, NPS) |
| banking | `list_bank_accounts` (+ balance history), `list_credit_cards` (latest statement, due), `list_income` |
| loans | `list_loans` (outstanding, EMI, rate, payments), `list_loans_given` |
| insurance | `list_insurance` (cover, premium, next due, nominee note, claims) |
| property | `list_properties` (owned + rental, tenancies, rent received/overdue, expenses) |
| vehicles | `list_vehicles` (value, insurance/PUC/fitness expiry, challans) |
| goals_tax | `list_goals` (progress), `get_tax_summary` (fy) |
| split | `list_split_balances` |
| will | `get_will_summary` (status, version, signing date, plain-language summary), `list_nominees` |
| documents | `list_documents` (name, type, date, linked entity; no contents) |

Rules for every tool:
- `tools/list` returns only tools for the grant's areas (+ always). All carry `annotations: { readOnlyHint: true, openWorldHint: false }`.
- Optional `member`: a user id from `list_people`, or `"all"`; default = the connecting user. A member outside `grant.memberUserIds`, or no longer passing the family checks, gets a tool error. Every row carries `owner` (display name + relation).
- Family visibility caps apply: for a non-OWNER viewer, results are intersected with `FamilyMember.visibleAssetClasses` / `visibleCategories` exactly as `familyScope.service.ts` does in the app.
- Implemented by calling existing services (dashboard, holdings projection, analytics, loans, insurance, etc.), never ad-hoc queries, so numbers match the app.
- Output: `structuredContent` + a JSON text block. Money as decimal strings with `currency: "INR"`; dates `dd/mm/yyyy`; every result has `asOf`.
- One masking layer (`mcp/mask.ts`) applied to every tool result before serialisation: account, card, policy, folio, PAN, Aadhaar, PRAN, UAN, vehicle registration -> last 4 (`XXXX4821`, `XXXXX123F`). Free text the user typed (notes, instructions, names) is returned inside fields labelled `userText` and passed through the PII redactor (`ingestion/pii.ts redactForLlm`).
- Errors are plain: area not shared ("Investments isn't shared with this chatbot. Change it in EveryPaisa > Settings > AI connectors."), member not shared, plan locked, rate limited.

## 7. Security

1. Each `/mcp` request: hash lookup -> token not expired, kind ACCESS, grant not revoked -> user plan >= PLUS (`hasFeature('AI_CONNECTOR')`) -> `MCP_ENABLED` -> `runAsUser(grant.userId)` for all data access. No caching of grant state.
2. Family member access re-checked per call: managed (`managedById = grant.userId`) or active family member visible to the user AND `aiConnectorFamilyOptIn = true`.
3. Rate limits: 60 tool calls/min and 2,000/day per grant; `/oauth/register` and `/oauth/token` IP-limited like auth endpoints; 200 rows per call; 10 s per call.
4. Audit actions (closed union): `mcp_connected`, `mcp_sharing_changed`, `mcp_revoked`, `mcp_token_refreshed`, `mcp_refresh_reuse`, `mcp_tool_called` (metadata: tool, area, memberCount, rowCount, ok). Never data.
5. New connection: email + in-app Alert "ChatGPT connected to your EveryPaisa. Not you? Revoke."
6. Approval page states that shared data goes to OpenAI/Anthropic under the user's own account and their retention rules apply.
7. Kill switch `MCP_ENABLED` (default `false`): when false every `/mcp`, `/oauth/*` and `/.well-known/oauth-*` route answers 404 and the settings page shows "not available yet".
8. CORS: `/mcp`, `/oauth/token`, `/oauth/register`, `/.well-known/*` allow cross-origin without credentials (bearer only). Approval decision endpoint stays on the normal same-origin CORS + CSRF rules.
9. Logging: no request bodies or tokens logged on these routes.

## 8. Web

- `/settings/ai-connectors` (link also in user menu and Planning sidebar group): explainer; Connect ChatGPT / Connect Claude buttons (copy `<origin>/mcp`, open the app's connector settings in a new tab, show 3 steps); paid-plan note; connections list (name, connected, last used, area + member chips, Edit sharing, Recent activity = last 20 `mcp_tool_called`, Revoke with confirm); family opt-in switch for users who are members of someone else's family; FREE -> existing locked card.
- `/connect/authorize?req=..`: standalone page. Logo; "<App> wants read-only access to your EveryPaisa data" with verified host; area toggles with one-line descriptions; member toggles (managed off by default; non-opted-in greyed with reason); privacy note; Approve / Cancel. Not signed in -> login (incl. 2FA) -> back. Expired/invalid `req` -> plain error + Settings link. FREE -> upgrade message, no approve.
- In-app assistant panel: link "Prefer your own ChatGPT or Claude? Connect it".
- Theme tokens + dark mode, 375 px no sideways scroll, dd/mm/yyyy, no jest-dom in tests.

## 9. Testing

- OAuth: register allowlist; S256 only; code single-use + 60 s; redirect exact match; resource audience; refresh rotation; reuse revokes grant; token rejected outside `/mcp`; session JWT rejected on `/mcp`; revoke effective next request; FREE blocks; kill switch 404s.
- Tools: area gate; masking property test (fixture data with full identifiers through every tool -> no unmasked identifier survives); parity with the app services for a fixture user; RLS cross-user (A's token never yields B's rows).
- Family: managed allowed; own-login without opt-in refused; visibility caps honoured; `member: "all"` totals.
- Audit rows hold no personal data.
- Web: approval + settings pages at 375 px and 1280 px, light + dark.
- Local end to end: MCP Inspector against the local API (full OAuth + tool calls).
- Real ChatGPT/Claude: after deploy with `MCP_ENABLED=true` for the owner's test, or earlier through a tunnel only with owner approval.

## 10. Delivery

- Part 1: OAuth server + metadata + `/mcp` transport, data model + migration, approval page, settings page (connect, list, revoke), masking layer, `get_overview`, `list_people` (self only), investments + retirement tools, audit, new-connection notice, plan gate, kill switch.
- Part 2: remaining area tools, family members + opt-in, Edit sharing, recent activity, assistant-panel and user-menu entry points.

## 11. Rollout

Prod migration needs owner approval (DIRECT_URL overridden). Deploy with `MCP_ENABLED=false`; owner flips it after testing with their own ChatGPT/Claude. `API_PUBLIC_URL` must be the public https API origin.

## 12. Follow-up (separate)

Verify whether the in-app assistant still sends the user's name/email to Anthropic (an exploration found `buildUserProfile` including them; a `claudeClient.privacy.test.ts` exists, so it may already be stripped at send time). Fix separately if confirmed.
