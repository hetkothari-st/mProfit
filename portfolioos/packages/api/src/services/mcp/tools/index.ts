import type { z } from 'zod';
import type { ConnectorTool } from './types.js';
import { OVERVIEW_TOOLS } from './overview.tools.js';
import { INVESTMENT_TOOLS } from './investments.tools.js';
import { RETIREMENT_TOOLS } from './retirement.tools.js';

/** Every connector tool. Part 2 appends the remaining areas here. */
export const CONNECTOR_TOOLS: ConnectorTool<z.ZodRawShape>[] = [
  ...OVERVIEW_TOOLS, ...INVESTMENT_TOOLS, ...RETIREMENT_TOOLS,
] as ConnectorTool<z.ZodRawShape>[];
