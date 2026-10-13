import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import type { WillRenderContext } from './common.v1.js';
import { ISA_HINDU_V1 } from './isaHindu.v1.js';
import { ISA_GENERAL_V1 } from './isaGeneral.v1.js';
import { SUMMARY_V1 } from './summary.v1.js';
import { regimeForLaw, type WillRegime } from './regime.v1.js';

export type { WillRenderContext } from './common.v1.js';
export { regimeForLaw, type WillRegime } from './regime.v1.js';

export interface WillTemplate {
  id: string;
  version: number;
  regime: WillRegime;
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[];
}

/** The current template per regime. A new version replaces its entry here. */
export const WILL_TEMPLATES: readonly WillTemplate[] = [ISA_HINDU_V1, ISA_GENERAL_V1];
export const WILL_SUMMARY_VERSION = SUMMARY_V1.version;

export function selectWillTemplate(m: WillPayload): WillTemplate {
  const regime = regimeForLaw(m.details.personalLaw);
  const t = regime ? WILL_TEMPLATES.find((x) => x.regime === regime) : undefined;
  if (!t) throw new Error('WILL_TEMPLATE_UNAVAILABLE');
  return t;
}

export function renderWillSummary(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
  return SUMMARY_V1.render(m, ctx);
}
