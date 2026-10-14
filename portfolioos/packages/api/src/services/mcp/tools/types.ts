import type { z } from 'zod';
import type { AiConnectorArea } from '@everypaisa/shared';
import type { Person } from '../people.js';

export interface ToolContext {
  userId: string;
  grantId: string;
  areas: AiConnectorArea[];
  /** Family members on the grant (re-checked per call by resolvePeople). */
  memberUserIds?: string[];
  planOk: boolean;
  now: Date;
  /** The person this run reads (set by runConnectorTool; absent = the user). */
  person?: Person;
  /** Everyone still eligible on this grant, self first (set by runConnectorTool). */
  people?: Person[];
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
  /**
   * Family gate for a member's data, overriding the area's: a category token
   * (e.g. 'CREDIT_CARD'), or null = only the user and managed profiles.
   */
  familyGate?: string | null;
  /** Rows can be filtered by a member's asset-class caps (holdings, transactions). */
  partialCaps?: boolean;
  /** The tool does not take a `member` argument (list_people). */
  noMember?: boolean;
  run(ctx: ToolContext, args: z.objectOutputType<S, z.ZodTypeAny>): Promise<ToolResult>;
}

/** A message the chatbot may show the user as-is. */
export class ToolUserError extends Error {}

/** Max rows any tool returns in one call. */
export const MAX_ROWS = 200;
