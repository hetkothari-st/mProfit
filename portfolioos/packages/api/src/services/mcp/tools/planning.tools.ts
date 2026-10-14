import { z } from 'zod';
import { renderWillSummary, renderWillText, type WillPayload } from '@everypaisa/shared';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { openForUser } from '../../../lib/userKeys.js';
import { listGoals } from '../../goals.service.js';
import { availableTaxFys, buildTaxSummary } from '../../tax.service.js';
import { listFriends, groupBalances } from '../../split/ledger.service.js';
import { listGroups } from '../../split/groups.service.js';
import { getWillOverview } from '../../will/will.service.js';
import { getOverview as getLegacyOverview } from '../../legacy/plan.service.js';
import { listAllDocuments } from '../../document.service.js';
import { ToolUserError, type ConnectorTool } from './types.js';
import { dmy, hasClientBooks, ownPortfolios } from './common.js';

const listGoalsTool: ConnectorTool<Record<string, never>> = {
  name: 'list_goals', area: 'goals_tax', familyGate: 'GOAL', title: 'Goals',
  description: 'Financial goals with target, current value, progress and the return needed.', input: {},
  async run(ctx) {
    const rows = await listGoals(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), currency: 'INR',
        goals: rows.map((g) => ({
          name: g.name, category: g.category, priority: g.priority, status: g.status, target: g.targetAmount, targetDate: dmy(g.targetDate),
          currentValue: g.currentValue, remaining: g.remaining, progressPct: g.progressPct, requiredReturnPct: g.requiredCagr ?? null,
          userText: g.notes ?? null,
        })),
      },
    };
  },
};

const taxInput = { fy: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Indian financial year, e.g. 2025-26 (default: latest)') };
const getTaxSummary: ConnectorTool<typeof taxInput> = {
  name: 'get_tax_summary', area: 'goals_tax', familyGate: null, title: 'Tax summary',
  description: 'Capital gains by tax section, losses carried forward, other income and estimated tax for a financial year.', input: taxInput,
  async run(ctx, args) {
    const fys = await availableTaxFys(ctx.userId);
    const fy = args.fy ?? fys[0];
    if (!fy) return { rows: 0, data: { asOf: dmy(ctx.now), availableFys: [], note: 'No tax data yet.' } };
    if (!fys.includes(fy)) throw new ToolUserError(`No tax data for ${fy}. Available: ${fys.join(', ') || 'none'}.`);
    // CA client books are left out (they are the clients' tax, not the user's).
    const ids = (await hasClientBooks(ctx.userId)) ? (await ownPortfolios(ctx.userId)).map((p) => p.id) : undefined;
    const t = await buildTaxSummary(ctx.userId, fy, ids);
    return {
      rows: 1,
      data: {
        asOf: dmy(ctx.now), currency: 'INR', financialYear: t.financialYear, availableFys: fys,
        capitalGains: t.capitalGains, carryForward: t.carryForward, otherIncome: t.otherIncome,
        totalRealisedGain: t.totalRealisedGain, totalEstimatedTax: t.totalEstimatedTax, slabIsEstimate: t.slabIsEstimate,
      },
    };
  },
};

const listSplitBalances: ConnectorTool<Record<string, never>> = {
  name: 'list_split_balances', area: 'split', familyGate: null, title: 'Split expenses',
  description: 'Who owes whom: per person across groups, and settle-up transfers per group.', input: {},
  async run(ctx) {
    const friends = await listFriends(ctx.userId);
    const groups = await listGroups(ctx.userId);
    const out = [];
    for (const g of groups) {
      const bal = await groupBalances(ctx.userId, g.id);
      const nameOf = new Map(g.members.map((m) => [m.id, m.isMe ? 'You' : m.displayName]));
      out.push({
        group: g.name, currency: bal.baseCurrency,
        transfers: bal.transfers.map((t) => ({ from: nameOf.get(t.fromMemberId) ?? '?', to: nameOf.get(t.toMemberId) ?? '?', amount: t.amount })),
      });
    }
    return {
      rows: friends.length + out.length,
      data: {
        asOf: dmy(ctx.now),
        people: friends.map((f) => ({ name: f.displayName, currency: f.currency, net: f.net, theyOweYou: !f.net.startsWith('-') && f.net !== '0' && !/^0(\.0+)?$/.test(f.net) })),
        groups: out,
      },
    };
  },
};

const getWillSummary: ConnectorTool<Record<string, never>> = {
  name: 'get_will_summary', area: 'will', familyGate: null, title: 'Will',
  description: 'Will status, version, signing date, next review, and a plain-language summary of the live will.', input: {},
  async run(ctx) {
    const o = await getWillOverview(ctx.userId);
    const live = o.history.find((h) => h.status === 'EXECUTED' || h.status === 'GENERATED') ?? null;
    let summary: string | null = null;
    if (live?.versionId) {
      try {
        const v = await prisma.willVersion.findUnique({ where: { id: live.versionId } });
        if (v) {
          const payload = JSON.parse((await openForUser(ctx.userId, `willversion:${v.id}`, Buffer.from(v.snapshotSealed))).toString('utf8')) as WillPayload;
          summary = renderWillText(renderWillSummary(payload, { generatedOn: v.generatedOn.toISOString().slice(0, 10) }));
        }
      } catch (err) {
        // The status answer still helps without the summary (e.g. keys unavailable).
        logger.warn({ err: (err as Error).name }, 'mcp.will_summary.unavailable');
      }
    }
    return {
      rows: live ? 1 : 0,
      data: {
        asOf: dmy(ctx.now), status: o.status,
        version: live?.version ?? null, generatedOn: dmy(live?.generatedOn ?? null), signedOn: dmy(live?.executedOn ?? null),
        nextReviewOn: dmy(o.review?.nextReviewAt ?? null), reviewDue: o.review?.due ?? false,
        hasDraft: !!o.draft, userText: summary,
      },
    };
  },
};

const listNominees: ConnectorTool<Record<string, never>> = {
  name: 'list_nominees', area: 'will', familyGate: null, title: 'Succession nominees',
  description: 'People named in your Succession plan and what they are set to receive.', input: {},
  async run(ctx) {
    const o = await getLegacyOverview(ctx.userId, true);
    const nominees = (o.nominees ?? []).map((n) => ({
      name: n.name, relationship: n.relationship ?? null, priority: n.priority, verifier: n.isVerifier,
      categories: n.categories, acknowledged: !!n.acknowledgedAt,
    }));
    return { rows: nominees.length, data: { asOf: dmy(ctx.now), nominees } };
  },
};

const listDocuments: ConnectorTool<Record<string, never>> = {
  name: 'list_documents', area: 'documents', familyGate: null, title: 'Documents',
  description: 'The documents in your vault: name, kind, what it belongs to, size and date. File contents are never shared.', input: {},
  async run(ctx) {
    const rows = await listAllDocuments(ctx.userId, {}, { excludeWill: false });
    return {
      rows: Math.min(rows.length, 200),
      data: {
        asOf: dmy(ctx.now),
        documents: rows.slice(0, 200).map((d) => ({
          userText: d.fileName, category: d.category ?? null, belongsTo: d.ownerType, type: d.mimeType,
          sizeKb: Math.ceil(Number(d.sizeBytes) / 1024), added: dmy(d.createdAt),
        })),
        truncated: rows.length > 200,
      },
    };
  },
};

export const PLANNING_TOOLS = [listGoalsTool, getTaxSummary, listSplitBalances, getWillSummary, listNominees, listDocuments];
