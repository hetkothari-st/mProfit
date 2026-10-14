import { serializeMoney } from '@everypaisa/shared';
import { listPfAccounts } from '../../pfAccounts.service.js';
import type { ConnectorTool } from './types.js';
import { dmy } from './common.js';

const listRetirementAccounts: ConnectorTool<Record<string, never>> = {
  name: 'list_retirement_accounts', area: 'retirement', title: 'Retirement accounts',
  description: 'EPF, PPF and NPS accounts with balance and when they were last refreshed.', input: {},
  async run(ctx) {
    const rows = await listPfAccounts(ctx.userId);
    return {
      rows: rows.length,
      data: {
        asOf: dmy(ctx.now), owner: 'You', currency: 'INR',
        accounts: rows.map((r) => ({
          type: r.type, institution: r.institution, account: `XXXX${r.identifierLast4}`, status: r.status,
          balance: r.currentBalance ? serializeMoney(r.currentBalance as never) : null, lastRefreshed: dmy(r.lastRefreshedAt),
        })),
      },
    };
  },
};

export const RETIREMENT_TOOLS = [listRetirementAccounts];
