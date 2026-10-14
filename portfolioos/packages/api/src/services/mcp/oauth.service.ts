import crypto from 'node:crypto';
import type { Request } from 'express';
import {
  clientDisplayName, isAiConnectorArea, formatDateOnly,
  type AiConnectorArea, type AiConnectorAuthRequestWire, type AiConnectionWire, type AiConnectionActivityWire,
} from '@everypaisa/shared';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { runAsSystem, runAsUser } from '../../lib/requestContext.js';
import { inviteTokenHash } from '../../lib/inviteToken.js';
import { writeAuditLog } from '../../lib/audit.js';
import { env } from '../../config/env.js';
import { verifyPkceS256 } from './pkce.js';
import { listShareablePeople } from './people.js';

/**
 * OAuth 2.1 authorization server for the AI Connector (MCP authorization
 * spec). Bearer secrets (codes, access and refresh tokens) are stored as
 * SHA-256 only. Lookups by hash run privileged because the caller has no
 * identity yet; the hash is the credential. Everything after the lookup runs
 * as the grant's owner.
 */

const MIN = 60_000;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 24 * 60 * MIN;
const CODE_TTL_MS = 60_000;
const REQUEST_TTL_MS = 10 * MIN;

export class OAuthError extends Error {
  /** Set when the error should go back to the client's redirect_uri. */
  redirectTo?: string;
  constructor(public status: number, public error: string, public description: string) {
    super(description);
  }
}

export function mcpConfig(): { enabled: boolean; issuer: string; resource: string; allowUris: string[] } {
  const issuer = (env.API_PUBLIC_URL ?? '').replace(/\/+$/, '');
  return {
    enabled: env.MCP_ENABLED === 'true' && issuer !== '',
    issuer,
    resource: `${issuer}/mcp`,
    allowUris: env.MCP_REDIRECT_URI_ALLOWLIST.split(',').map((u) => u.trim()).filter(Boolean),
  };
}

const sha = inviteTokenHash;
function secret(prefix: string): { raw: string; hash: string } {
  const raw = `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
  return { raw, hash: sha(raw) };
}
/** Drop trailing slashes without a regex (CodeQL: polynomial regex on user input). */
function trimSlashes(v: string): string {
  let end = v.length;
  while (end > 0 && v.charCodeAt(end - 1) === 47) end--;
  return v.slice(0, end);
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function checkRedirect(uri: string, allowUris: string[]): URL {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    throw new OAuthError(400, 'invalid_redirect_uri', 'redirect_uri is not a valid URL');
  }
  // Exact callback match: origin + path, no query or fragment.
  if (u.protocol !== 'https:' || u.search || u.hash || !allowUris.includes(`${u.origin}${u.pathname}`)) {
    throw new OAuthError(400, 'invalid_redirect_uri', 'This app is not allowed to connect to EveryPaisa.');
  }
  return u;
}

export async function registerClient(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (uris.length === 0 || uris.length > 5) throw new OAuthError(400, 'invalid_redirect_uri', 'redirect_uris must list 1-5 URLs');
  const { allowUris } = mcpConfig();
  const hosts = uris.map((u) => checkRedirect(u, allowUris).hostname.toLowerCase());
  const method = str(b.token_endpoint_auth_method) ?? 'none';
  if (method !== 'none') throw new OAuthError(400, 'invalid_client_metadata', 'Only public clients (token_endpoint_auth_method=none) are supported');
  const displayName = clientDisplayName(hosts[0]!);
  const clientId = `mcp_${crypto.randomBytes(16).toString('base64url')}`;
  const row = await runAsSystem(() => prisma.mcpClient.create({ data: { clientId, redirectUris: uris, displayName } }));
  return {
    client_id: row.clientId,
    client_id_issued_at: Math.floor(row.registeredAt.getTime() / 1000),
    redirect_uris: uris,
    client_name: displayName,
    token_endpoint_auth_method: 'none' as const,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

function redirectWith(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

export async function startAuthorization(q: Record<string, unknown>): Promise<{ reqId: string }> {
  const { issuer, resource } = mcpConfig();
  const clientId = str(q.client_id);
  const redirectUri = str(q.redirect_uri);
  const client = clientId ? await runAsSystem(() => prisma.mcpClient.findUnique({ where: { clientId } })) : null;
  // Never redirect to an unverified redirect_uri: these two fail on our page.
  if (!client) throw new OAuthError(400, 'invalid_request', 'Unknown client. Remove the connector in your chatbot and add it again.');
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    throw new OAuthError(400, 'invalid_request', 'redirect_uri does not match the registered one.');
  }
  const state = str(q.state);
  const fail = (error: string, description: string): never => {
    const e = new OAuthError(400, error, description);
    e.redirectTo = redirectWith(redirectUri, { error, error_description: description, state, iss: issuer });
    throw e;
  };
  if (q.response_type !== 'code') fail('unsupported_response_type', 'response_type must be code');
  const challenge = str(q.code_challenge);
  if (!challenge || q.code_challenge_method !== 'S256') fail('invalid_request', 'PKCE with S256 is required');
  const res = str(q.resource);
  if (res !== undefined && trimSlashes(res) !== resource) fail('invalid_target', 'Unknown resource');
  const reqId = crypto.randomBytes(32).toString('base64url');
  await runAsSystem(() => prisma.mcpAuthRequest.create({
    data: {
      id: reqId, clientId: client.id, redirectUri, state: state ?? null, codeChallenge: challenge!,
      resource: res ?? null, expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
    },
  }));
  return { reqId };
}

async function liveRequest(reqId: string) {
  const r = await runAsSystem(() => prisma.mcpAuthRequest.findUnique({ where: { id: reqId } }));
  if (!r || r.consumedAt || r.expiresAt <= new Date()) {
    throw new OAuthError(404, 'not_found', 'This connection request has expired. Start again from your chatbot.');
  }
  const client = await runAsSystem(() => prisma.mcpClient.findUniqueOrThrow({ where: { id: r.clientId } }));
  return { r, client };
}

export async function getAuthRequest(reqId: string, userId: string): Promise<AiConnectorAuthRequestWire> {
  const { r, client } = await liveRequest(reqId);
  const existing = await runAsUser(userId, () => prisma.mcpGrant.findFirst({ where: { userId, clientId: client.id, revokedAt: null } }));
  return {
    reqId,
    clientName: client.displayName,
    redirectHost: new URL(r.redirectUri).hostname,
    expiresAt: r.expiresAt.toISOString(),
    currentAreas: existing ? existing.areas.filter(isAiConnectorArea) : null,
    currentMemberIds: existing ? existing.memberUserIds : null,
    members: await listShareablePeople(userId),
  };
}

/** Members on a decision must be people the user may share right now (managed, or opted-in). */
async function validMemberIds(userId: string, raw: unknown, previously: readonly string[] = []): Promise<string[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) throw new OAuthError(400, 'invalid_request', 'memberIds must be a list of ids');
  const ids = [...new Set(raw as string[])];
  if (ids.length === 0) return [];
  const ok = new Set((await listShareablePeople(userId)).filter((p) => p.shareable).map((p) => p.userId));
  // Someone already on the connection who has since opted out or left is
  // dropped quietly: the owner cannot untick them, and refusing would block
  // narrowing (a privacy action). Adding someone new who cannot be shared is refused.
  if (ids.some((id) => !ok.has(id) && !previously.includes(id))) throw new OAuthError(400, 'invalid_request', 'One of these people cannot be shared');
  return ids.filter((id) => ok.has(id));
}

export async function decide(
  reqId: string, userId: string, input: { approve: boolean; areas: unknown; memberIds?: unknown }, req?: Request,
): Promise<{ redirectTo: string; isNewConnection: boolean; grantId: string | null; clientName: string }> {
  const { issuer } = mcpConfig();
  const { r, client } = await liveRequest(reqId);
  // Validate before claiming, so a bad payload does not burn the request.
  let areas: AiConnectorArea[] = [];
  let memberUserIds: string[] = [];
  if (input.approve) {
    const raw = Array.isArray(input.areas) ? input.areas : null;
    if (!raw || !raw.every(isAiConnectorArea)) throw new OAuthError(400, 'invalid_request', 'Unknown sharing area');
    areas = [...new Set(raw)] as AiConnectorArea[];
    const prior = await runAsUser(userId, () => prisma.mcpGrant.findFirst({ where: { userId, clientId: client.id, revokedAt: null }, select: { memberUserIds: true } }));
    memberUserIds = await validMemberIds(userId, input.memberIds, prior?.memberUserIds ?? []);
  }
  // Claim the request: a double-click or a replayed decision gets 404.
  const claimed = await runAsSystem(() => prisma.mcpAuthRequest.updateMany({ where: { id: reqId, consumedAt: null }, data: { consumedAt: new Date() } }));
  if (claimed.count !== 1) throw new OAuthError(404, 'not_found', 'This connection request was already answered.');
  if (!input.approve) {
    return {
      redirectTo: redirectWith(r.redirectUri, { error: 'access_denied', state: r.state ?? undefined, iss: issuer }),
      isNewConnection: false, grantId: null, clientName: client.displayName,
    };
  }
  const code = secret('epc_');
  const { grantId, isNew } = await runAsUser(userId, () => runInTransaction(async (tx) => {
    const existing = await tx.mcpGrant.findFirst({ where: { userId, clientId: client.id, revokedAt: null } });
    const grant = existing
      ? await tx.mcpGrant.update({ where: { id: existing.id }, data: { areas, memberUserIds } })
      : await tx.mcpGrant.create({ data: { userId, clientId: client.id, areas, memberUserIds } });
    await tx.mcpAuthCode.create({
      data: {
        userId, grantId: grant.id, codeHash: code.hash, codeChallenge: r.codeChallenge, redirectUri: r.redirectUri,
        resource: r.resource, expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    return { grantId: grant.id, isNew: !existing };
  }));
  await writeAuditLog({
    userId, action: isNew ? 'mcp_connected' : 'mcp_sharing_changed', resource: `McpGrant:${grantId}`,
    metadata: { client: client.displayName, areas, memberCount: memberUserIds.length }, req,
  });
  return {
    redirectTo: redirectWith(r.redirectUri, { code: code.raw, state: r.state ?? undefined, iss: issuer }),
    isNewConnection: isNew, grantId, clientName: client.displayName,
  };
}

async function issueTokens(userId: string, grantId: string, generation: number, areas: string[]) {
  const access = secret('epa_');
  const refresh = secret('epr_');
  const now = Date.now();
  await runAsUser(userId, () => prisma.mcpToken.createMany({
    data: [
      { userId, grantId, tokenHash: access.hash, kind: 'ACCESS', generation, expiresAt: new Date(now + ACCESS_TTL_S * 1000) },
      { userId, grantId, tokenHash: refresh.hash, kind: 'REFRESH', generation, expiresAt: new Date(now + REFRESH_TTL_MS) },
    ],
  }));
  return {
    access_token: access.raw, token_type: 'Bearer' as const, expires_in: ACCESS_TTL_S as 3600,
    refresh_token: refresh.raw, scope: areas.map((a) => `area:${a}`).join(' '),
  };
}

async function revokeGrant(userId: string, grantId: string, reason: string): Promise<void> {
  await runAsUser(userId, () => prisma.mcpGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } }));
}

type McpClientRow = NonNullable<Awaited<ReturnType<typeof prisma.mcpClient.findUnique>>>;

async function exchangeCode(body: Record<string, unknown>, client: McpClientRow) {
  const raw = str(body.code) ?? '';
  const code = await runAsSystem(() => prisma.mcpAuthCode.findUnique({ where: { codeHash: sha(raw) }, include: { grant: true } }));
  if (!code || code.grant.clientId !== client.id) throw new OAuthError(400, 'invalid_grant', 'Invalid code');
  if (code.expiresAt <= new Date() || code.grant.revokedAt) throw new OAuthError(400, 'invalid_grant', 'Code expired');
  if (str(body.redirect_uri) !== code.redirectUri) throw new OAuthError(400, 'invalid_grant', 'redirect_uri mismatch');
  const res = str(body.resource);
  if (res !== undefined && trimSlashes(res) !== mcpConfig().resource) throw new OAuthError(400, 'invalid_target', 'Unknown resource');
  if (!verifyPkceS256(str(body.code_verifier) ?? '', code.codeChallenge)) throw new OAuthError(400, 'invalid_grant', 'PKCE verification failed');
  // Single use is decided by this atomic update alone (race-safe). A code
  // that was already used is a replay (RFC 6749 4.1.2): revoke everything
  // issued from it.
  const marked = await runAsSystem(() => prisma.mcpAuthCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } }));
  if (marked.count !== 1) {
    await revokeGrant(code.userId, code.grantId, 'code_replay');
    await writeAuditLog({ userId: code.userId, action: 'mcp_refresh_reuse', resource: `McpGrant:${code.grantId}`, metadata: { kind: 'code_replay' } });
    throw new OAuthError(400, 'invalid_grant', 'Code already used');
  }
  // A fresh consent retires every token issued before it: a refresh token
  // stolen earlier stops working, and since it is deleted (not merely
  // superseded) presenting it is not mistaken for reuse of the new one.
  const next = code.grant.refreshGeneration + 1;
  await runAsUser(code.userId, () => runInTransaction(async (tx) => {
    await tx.mcpToken.deleteMany({ where: { grantId: code.grantId } });
    await tx.mcpGrant.update({ where: { id: code.grantId }, data: { refreshGeneration: next } });
  }));
  return issueTokens(code.userId, code.grantId, next, code.grant.areas);

}

async function exchangeRefresh(body: Record<string, unknown>, client: McpClientRow) {
  const raw = str(body.refresh_token) ?? '';
  const tok = await runAsSystem(() => prisma.mcpToken.findUnique({ where: { tokenHash: sha(raw) }, include: { grant: true } }));
  if (!tok || tok.kind !== 'REFRESH' || tok.grant.clientId !== client.id) throw new OAuthError(400, 'invalid_grant', 'Invalid refresh token');
  if (tok.grant.revokedAt || tok.expiresAt <= new Date()) throw new OAuthError(400, 'invalid_grant', 'Refresh token expired or revoked');
  if (tok.generation !== tok.grant.refreshGeneration) {
    await revokeGrant(tok.userId, tok.grantId, 'refresh_reuse');
    await writeAuditLog({ userId: tok.userId, action: 'mcp_refresh_reuse', resource: `McpGrant:${tok.grantId}`, metadata: { kind: 'refresh_reuse' } });
    throw new OAuthError(400, 'invalid_grant', 'Refresh token already used');
  }
  const next = tok.grant.refreshGeneration + 1;
  const bumped = await runAsUser(tok.userId, () => prisma.mcpGrant.updateMany({
    where: { id: tok.grantId, refreshGeneration: tok.generation, revokedAt: null }, data: { refreshGeneration: next },
  }));
  if (bumped.count !== 1) throw new OAuthError(400, 'invalid_grant', 'Refresh token already used');
  await writeAuditLog({ userId: tok.userId, action: 'mcp_token_refreshed', resource: `McpGrant:${tok.grantId}` });
  return issueTokens(tok.userId, tok.grantId, next, tok.grant.areas);

}

/** The two grant types this server issues tokens for; anything else is refused. */
const GRANT_HANDLERS = new Map<string, (body: Record<string, unknown>, client: McpClientRow) => ReturnType<typeof issueTokens>>([
  ['authorization_code', exchangeCode],
  ['refresh_token', exchangeRefresh],
]);

export async function exchangeToken(body: Record<string, unknown>) {
  const clientId = str(body.client_id);
  const client = clientId ? await runAsSystem(() => prisma.mcpClient.findUnique({ where: { clientId } })) : null;
  if (!client) throw new OAuthError(401, 'invalid_client', 'Unknown client');
  const handler = GRANT_HANDLERS.get(String(body.grant_type));
  if (!handler) throw new OAuthError(400, 'unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  return handler(body, client);
}

export async function revokeToken(raw: string): Promise<void> {
  const tok = await runAsSystem(() => prisma.mcpToken.findUnique({ where: { tokenHash: sha(raw) } }));
  if (!tok) return; // RFC 7009: unknown tokens are not an error.
  await revokeGrant(tok.userId, tok.grantId, 'client_revoked');
  await writeAuditLog({ userId: tok.userId, action: 'mcp_revoked', resource: `McpGrant:${tok.grantId}`, metadata: { by: 'client' } });
}

export async function resolveAccessToken(raw: string): Promise<{ grantId: string; userId: string; areas: AiConnectorArea[]; memberUserIds: string[]; clientName: string } | null> {
  if (!raw.startsWith('epa_')) return null;
  const tok = await runAsSystem(() => prisma.mcpToken.findUnique({ where: { tokenHash: sha(raw) }, include: { grant: { include: { client: true } } } }));
  if (!tok || tok.kind !== 'ACCESS' || tok.expiresAt <= new Date() || tok.grant.revokedAt) return null;
  return { grantId: tok.grantId, userId: tok.userId, areas: tok.grant.areas.filter(isAiConnectorArea), memberUserIds: tok.grant.memberUserIds, clientName: tok.grant.client.displayName };
}

export async function listConnections(userId: string): Promise<AiConnectionWire[]> {
  const rows = await runAsUser(userId, () => prisma.mcpGrant.findMany({
    where: { userId, revokedAt: null }, include: { client: true }, orderBy: { createdAt: 'desc' },
  }));
  return rows.map((g) => ({
    id: g.id,
    clientName: g.client.displayName,
    connectedOn: formatDateOnly(g.createdAt.toISOString()),
    lastUsedAt: g.lastUsedAt ? g.lastUsedAt.toISOString() : null,
    areas: g.areas.filter(isAiConnectorArea),
    memberUserIds: g.memberUserIds,
  }));
}

export async function revokeConnection(userId: string, grantId: string, req?: Request): Promise<void> {
  const done = await runAsUser(userId, () => prisma.mcpGrant.updateMany({
    where: { id: grantId, userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'user_revoked' },
  }));
  if (done.count !== 1) throw new OAuthError(404, 'not_found', 'Connection not found');
  await writeAuditLog({ userId, action: 'mcp_revoked', resource: `McpGrant:${grantId}`, metadata: { by: 'user' }, req });
}

/**
 * Daily sweep (system context): expired or answered auth requests, used or
 * expired codes, expired tokens, and clients nobody connected for 7 days.
 */
export async function purgeExpiredMcpRows(now: Date = new Date()): Promise<{ requests: number; codes: number; tokens: number; clients: number }> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * MIN);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * MIN);
  return runAsSystem(async () => {
    const requests = await prisma.mcpAuthRequest.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { consumedAt: { lt: dayAgo } }] } });
    const codes = await prisma.mcpAuthCode.deleteMany({ where: { OR: [{ expiresAt: { lt: dayAgo } }, { usedAt: { lt: dayAgo } }] } });
    const tokens = await prisma.mcpToken.deleteMany({ where: { expiresAt: { lt: now } } });
    const clients = await prisma.mcpClient.deleteMany({ where: { registeredAt: { lt: weekAgo }, grants: { none: {} } } });
    return { requests: requests.count, codes: codes.count, tokens: tokens.count, clients: clients.count };
  });
}

/** Settings: may family members include this user in their own connectors? */
export async function getFamilyOptIn(userId: string): Promise<boolean> {
  const u = await runAsUser(userId, () => prisma.user.findUnique({ where: { id: userId }, select: { aiConnectorFamilyOptIn: true } }));
  return u?.aiConnectorFamilyOptIn ?? false;
}

export async function setFamilyOptIn(userId: string, optIn: boolean, req?: Request): Promise<boolean> {
  await runAsUser(userId, () => prisma.user.update({ where: { id: userId }, data: { aiConnectorFamilyOptIn: optIn } }));
  await writeAuditLog({ userId, action: 'mcp_sharing_changed', resource: `User:${userId}`, metadata: { familyOptIn: optIn }, req });
  return optIn;
}

/** Edit sharing: same validation as approving. Takes effect on the chatbot's next call. */
export async function updateConnection(
  userId: string, grantId: string, input: { areas: unknown; memberUserIds: unknown }, req?: Request,
): Promise<AiConnectionWire> {
  const raw = Array.isArray(input.areas) ? input.areas : null;
  if (!raw || !raw.every(isAiConnectorArea)) throw new OAuthError(400, 'invalid_request', 'Unknown sharing area');
  const areas = [...new Set(raw)] as AiConnectorArea[];
  const prior = await runAsUser(userId, () => prisma.mcpGrant.findFirst({ where: { id: grantId, userId, revokedAt: null }, select: { memberUserIds: true } }));
  if (!prior) throw new OAuthError(404, 'not_found', 'Connection not found');
  const memberUserIds = await validMemberIds(userId, input.memberUserIds, prior.memberUserIds);
  const done = await runAsUser(userId, () => prisma.mcpGrant.updateMany({
    where: { id: grantId, userId, revokedAt: null }, data: { areas, memberUserIds },
  }));
  if (done.count !== 1) throw new OAuthError(404, 'not_found', 'Connection not found');
  await writeAuditLog({ userId, action: 'mcp_sharing_changed', resource: `McpGrant:${grantId}`, metadata: { areas, memberCount: memberUserIds.length }, req });
  const conn = (await listConnections(userId)).find((c) => c.id === grantId);
  if (!conn) throw new OAuthError(404, 'not_found', 'Connection not found');
  return conn;
}

/** The chatbot's last 20 lookups on this connection (from the audit log; no data in it). */
export async function connectionActivity(userId: string, grantId: string): Promise<AiConnectionActivityWire[]> {
  const grant = await runAsUser(userId, () => prisma.mcpGrant.findFirst({ where: { id: grantId, userId }, select: { id: true } }));
  if (!grant) throw new OAuthError(404, 'not_found', 'Connection not found');
  const rows = await runAsSystem(() => prisma.auditLog.findMany({
    where: { userId, action: 'mcp_tool_called', resource: `McpGrant:${grantId}` }, orderBy: { createdAt: 'desc' }, take: 20,
  }));
  return rows.map((r) => {
    const m = (r.metadata ?? {}) as { tool?: string; area?: string; memberCount?: number; rowCount?: number; ok?: boolean };
    return { tool: m.tool ?? '', area: m.area ?? '', people: m.memberCount ?? 1, rows: m.rowCount ?? 0, ok: m.ok === true, at: r.createdAt.toISOString() };
  });
}
