import type { z } from 'zod';
import type { ConnectorTool } from './types.js';
import { OVERVIEW_TOOLS } from './overview.tools.js';
import { INVESTMENT_TOOLS } from './investments.tools.js';
import { RETIREMENT_TOOLS } from './retirement.tools.js';
import { BANKING_TOOLS } from './banking.tools.js';
import { LOAN_TOOLS } from './loans.tools.js';
import { ASSET_TOOLS } from './assets.tools.js';
import { PLANNING_TOOLS } from './planning.tools.js';

/** Every connector tool. */
export const CONNECTOR_TOOLS: ConnectorTool<z.ZodRawShape>[] = [
  ...OVERVIEW_TOOLS, ...INVESTMENT_TOOLS, ...RETIREMENT_TOOLS,
  ...BANKING_TOOLS, ...LOAN_TOOLS, ...ASSET_TOOLS, ...PLANNING_TOOLS,
] as ConnectorTool<z.ZodRawShape>[];
