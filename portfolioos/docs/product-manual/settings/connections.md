[Index](../INDEX.md)

# Settings — Connections

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-conn-001"></a>
### Choose what <chatbot> can read
| Attribute | Value |
|---|---|
| Control type | 11 checkboxes |
| Location | **/connect/authorize** approval page, and **AI connectors → Edit sharing** |
| Purpose | Which areas of your data a connected chatbot may read |
| Default | On: Investments, Retirement, Banking and cards, Loans, Insurance, Property, Vehicles, Goals and tax, Split expenses. Off: Will and succession, Documents. A reconnecting chatbot starts with what it had. (`packages/shared/src/aiConnector.ts:13`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:34`) |
| Values | Ticked: the chatbot gets that area's tools. Unticked: those tools are not offered. With nothing ticked the connection shows "Overview only". |
| Depends on | PLUS plan or higher to approve or edit |
| Persists | Yes — server |
| Stored in | `McpGrant.areas` |
| Backend effect | The MCP server registers only the tools of shared areas plus the always-available overview and people tools (`packages/api/src/services/mcp/server.ts:97`). Takes effect on the chatbot's next call. |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/pages/connect/SharingToggles.tsx:15`, `packages/api/src/services/mcp/oauth.service.ts:374` |

<a id="s-conn-002"></a>
### Whose data
| Attribute | Value |
|---|---|
| Control type | Checkbox per family member |
| Location | Same places as [S-CONN-001](../settings/connections.md#s-conn-001), shown only when you have shareable people |
| Purpose | Let the chatbot also read relatives' data |
| Default | Nobody ticked; a reconnect keeps whoever was shared before and is still shareable (`apps/web/src/pages/connect/ConnectAuthorizePage.tsx:37`) |
| Values | Ticked: the chatbot may read that person's data within the family visibility you already have. Disabled rows read "Has not allowed family AI connectors". |
| Depends on | Managed profiles are always shareable; members with their own login only after they turn on [S-CONN-003](../settings/connections.md#s-conn-003) |
| Persists | Yes — server |
| Stored in | `McpGrant.memberUserIds` |
| Backend effect | Eligibility is re-checked on every tool call (`packages/api/src/services/mcp/people.ts:10`) |
| Who can change | [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) |
| Sources | `apps/web/src/pages/connect/SharingToggles.tsx:28`, `packages/api/src/services/mcp/people.ts:61` |

<a id="s-conn-003"></a>
### Allow family to include me in their AI connectors
| Attribute | Value |
|---|---|
| Control type | Checkbox (saves on click) |
| Location | **AI connectors** page, bottom card |
| Purpose | Consent for relatives who can already see your data to let their own chatbot read it |
| Default | Off (`packages/api/prisma/schema.prisma:58`) |
| Values | On: you appear as shareable on your relatives' approval pages. Off: you appear greyed out; anyone already sharing you stops seeing your data on the next call. |
| Depends on | Membership in a family (B03) |
| Persists | Yes — server |
| Stored in | `User.aiConnectorFamilyOptIn` |
| Backend effect | Audit row `mcp_sharing_changed` |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (not plan-gated) |
| Sources | `apps/web/src/pages/settings/AiConnectorsPage.tsx:126`, `packages/api/src/routes/connect.routes.ts:64` |

<a id="s-conn-004"></a>
### Broker setup fields
| Attribute | Value |
|---|---|
| Control type | Text/password fields after **Configure** / **Reconfigure** |
| Location | **Tools → Connectors → (broker card)** |
| Purpose | Your own broker developer-app credentials |
| Default | Not configured |
| Values | Zerodha (Kite Connect): API key, API secret. Upstox: API key (client id), API secret, Redirect URI. Angel One (SmartAPI): API key, Client code, Login PIN/password, TOTP seed (Base32). |
| Depends on | A developer app registered with the broker |
| Persists | Yes — server, encrypted |
| Stored in | `BrokerCredential` (API key, secret/password and TOTP seed encrypted under SECRETS_KEY) |
| Backend effect | Angel One logs in immediately on save; Zerodha and Upstox need **Connect** (browser login popup) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); under [R-MANAGER](../roles.md#r-manager) the credential is saved for the managed profile |
| Sources | `apps/web/src/pages/connectors/ConnectorsPage.tsx:41`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:30` |
