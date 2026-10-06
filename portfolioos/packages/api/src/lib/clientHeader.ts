import type { Request } from 'express';

/**
 * Extract the "acting as client" selector from a request.
 *
 * Mirrors `familyHeader.ts`: the frontend sends `X-Acting-As-Client`, with a
 * `?clientId=` fallback for the raw-`fetch` downloads that bypass the axios
 * interceptor, and for curl and tests.
 *
 * Only the SHAPE is validated here. Whether the caller actually holds an
 * active grant over that client is decided by `getCaScope`, which refuses
 * otherwise — the header is a request, never a claim to be believed.
 */
export function parseClientId(req: Request): string | undefined {
  const header = req.header('x-acting-as-client');
  const raw = header ?? (req.query.clientId as string | undefined);
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return undefined;
  return trimmed;
}
