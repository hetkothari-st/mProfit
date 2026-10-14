import type { z } from 'zod';
import type { AiConnectorArea } from '@everypaisa/shared';

export interface ToolContext {
  userId: string;
  grantId: string;
  areas: AiConnectorArea[];
  planOk: boolean;
  now: Date;
}

export interface ToolResult {
  /** Rows returned, for the audit log. */
  rows?: number;
  data: Record<string, unknown>;
}

export interface ConnectorTool<S extends z.ZodRawShape> {
  name: string;
  area: AiConnectorArea | 'always';
  title: string;
  description: string;
  input: S;
  run(ctx: ToolContext, args: z.objectOutputType<S, z.ZodTypeAny>): Promise<ToolResult>;
}

/** A message the chatbot may show the user as-is. */
export class ToolUserError extends Error {}

/** Max rows any tool returns in one call. */
export const MAX_ROWS = 200;
