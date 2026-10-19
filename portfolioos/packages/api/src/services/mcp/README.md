# services/mcp/

The **AI Connector**: an MCP server that lets the user's own ChatGPT/Claude read their data, with consent.

- `server.ts` — the MCP server; `tools/` holds one file per area (overview, investments, banking, loans, assets, planning, retirement).
- `oauth.service.ts`, `pkce.ts` — the OAuth flow that connects an external assistant.
- `mask.ts` — the masking layer every tool result passes through before it leaves.
- `people.ts` — whose data (self or family members) and which areas a connection may read.
- `notice.service.ts` — notifies the user when a new assistant connects.

Job: `jobs/mcpCleanupJob.ts`. HTTP: `routes/mcp.routes.ts`, `routes/mcpOAuth.routes.ts`, `routes/connect.routes.ts`.
