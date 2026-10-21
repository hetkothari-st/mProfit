import type { WillPayload } from '../schema.js';
import type { WillBlockV2 } from '../astV2.js';
import type { WillRenderContext } from './common.v1.js';
import { ISA_HINDU_V2 } from './isaHindu.v2.js';
import { ISA_GENERAL_V2 } from './isaGeneral.v2.js';
import { SUMMARY_V2 } from './summary.v2.js';
import { regimeForLaw, type WillRegime } from './regime.v1.js';

export type { WillRenderContext } from './common.v1.js';
export { regimeForLaw, type WillRegime } from './regime.v1.js';

export interface WillTemplate {
  id: string;
  version: number;
  regime: WillRegime;
  render(m: WillPayload, ctx: WillRenderContext): WillBlockV2[];
}

/**
 * The current template per regime. A new version replaces its entry here; the
 * older files stay (locked) because wills already generated from them were
 * printed from those words. v1 lives in isaHindu.v1.ts / isaGeneral.v1.ts.
 */
export const WILL_TEMPLATES: readonly WillTemplate[] = [ISA_HINDU_V2, ISA_GENERAL_V2];
export const WILL_SUMMARY_VERSION = SUMMARY_V2.version;

export function selectWillTemplate(m: WillPayload): WillTemplate {
  const regime = regimeForLaw(m.details.personalLaw);
  const t = regime ? WILL_TEMPLATES.find((x) => x.regime === regime) : undefined;
  if (!t) throw new Error('WILL_TEMPLATE_UNAVAILABLE');
  return t;
}

export function renderWillSummary(m: WillPayload, ctx: WillRenderContext): WillBlockV2[] {
  return SUMMARY_V2.render(m, ctx);
}
export { oneLine as oneLineWillText } from './common.v1.js';
