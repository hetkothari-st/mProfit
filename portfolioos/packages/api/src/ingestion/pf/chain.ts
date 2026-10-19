import { logger } from '../../lib/logger.js';
import { writeIngestionFailure } from '../../services/ingestionFailures.service.js';
import type {
  PfAdapter,
  ScrapeContext,
  RawScrapePayload,
  ParseResult,
  PfCanonicalEventInput,
} from './types.js';

const REGISTRY: PfAdapter[] = [];

export function registerPfAdapter(a: PfAdapter): void {
  if (REGISTRY.find((x) => x.id === a.id)) {
    throw new Error(`PfAdapter already registered: ${a.id}`);
  }
  REGISTRY.push(a);
}

export function findPfAdapter(opts: {
  institution: string;
  type: string;
}): PfAdapter | undefined {
  return REGISTRY.find(
    (a) => a.institution === opts.institution && a.type === opts.type,
  );
}

/** For tests / introspection. Do not mutate the returned array. */
export function listPfAdapters(): readonly PfAdapter[] {
  return REGISTRY;
}

export interface RunPfChainOutcome {
  ok: boolean;
  raw?: RawScrapePayload;
  parsed?: ParseResult<PfCanonicalEventInput>;
  error?: string;
}

/**
 * Single-adapter dispatch (Plan A only ships EPFO). Future plans (B/D) may
 * register multiple PPF adapters per institution; this signature stays.
 */
export async function runPfChain(ctx: ScrapeContext): Promise<RunPfChainOutcome> {
  const adapter = findPfAdapter({
    institution: ctx.account.institution,
    type: ctx.account.type,
  });

  if (!adapter) {
    const err = `No PfAdapter for ${ctx.account.institution} ${ctx.account.type}`;
    await writeIngestionFailure({
      userId: ctx.account.userId,
      sourceAdapter: 'pf.chain',
      adapterVersion: '1',
      sourceRef: ctx.account.id,
      error: err,
    });
    return { ok: false, error: err };
  }

  try {
    const raw = await adapter.scrape(ctx);
    const parsed = await adapter.parse(raw);
    return { ok: parsed.ok, raw, parsed };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logger.error(
      { adapterId: adapter.id, accountId: ctx.account.id, err },
      'pf.chain.failed',
    );
    await writeIngestionFailure({
      userId: ctx.account.userId,
      sourceAdapter: adapter.id,
      adapterVersion: adapter.version,
      sourceRef: ctx.account.id,
      error: err,
    });
    return { ok: false, error: err };
  }
}
