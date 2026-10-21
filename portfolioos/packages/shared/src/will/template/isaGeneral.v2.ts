/** Christians, Parsis and others domiciled in India: Indian Succession Act, 1925. LOCKED (see common.v2.ts). */
import type { WillPayload } from '../schema.js';
import type { WillBlockV2 } from '../astV2.js';
import type { WillRenderContext } from './common.v1.js';
import { willDocumentBlocksV2 } from './common.v2.js';
import { isIsaGeneralLaw, type IsaGeneralLaw } from './regime.v1.js';

const STANDING: Record<IsaGeneralLaw, string> = {
  CHRISTIAN: 'a Christian by religion',
  PARSI: 'a Parsi by religion',
  OTHER: 'domiciled in India',
};

export const ISA_GENERAL_V2 = {
  id: 'isa-general',
  version: 2,
  regime: 'ISA_GENERAL' as const,
  render(m: WillPayload, ctx: WillRenderContext): WillBlockV2[] {
    const law = m.details.personalLaw;
    if (!isIsaGeneralLaw(law)) throw new Error('WILL_TEMPLATE_LAW_MISMATCH');
    return willDocumentBlocksV2(m, ctx, `${STANDING[law]}, making this Will under the Indian Succession Act, 1925`);
  },
};
