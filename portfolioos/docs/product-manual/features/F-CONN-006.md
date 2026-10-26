---
id: [F-CONN-006](F-CONN-006.md)
title: "MCP server and OAuth endpoints for chatbots"
module: "Connections"
status: Backend-only
roles: "[R-AICONN](../roles.md#r-aiconn)"
in_manual: false
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# MCP server and OAuth endpoints for chatbots

`F-CONN-006` · Backend-only · Roles: [R-AICONN](../roles.md#r-aiconn)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Connections |
| Page / route | /mcp, /oauth/*, /.well-known/* |
| Actions | external calls only |
| Settings | — |
| Backend | mcp.routes, mcpOAuth.routes, mcpCleanupJob |
| Data read / changed | McpClient, McpToken, McpGrant, AuditLog |
| Sources | `packages/api/src/routes/mcp.routes.ts:43`, `packages/api/src/routes/mcpOAuth.routes.ts:35`, `packages/api/src/services/mcp/server.ts:85`, `packages/api/src/jobs/mcpCleanupJob.ts:11` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
