/** Christians, Parsis and others domiciled in India: Indian Succession Act, 1925. LOCKED (see common.v1.ts). */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willDocumentBlocks, type WillRenderContext } from './common.v1.js';
import { isIsaGeneralLaw, type IsaGeneralLaw } from './regime.v1.js';

const STANDING: Record<IsaGeneralLaw, string> = {
  CHRISTIAN: 'a Christian by religion',
  PARSI: 'a Parsi by religion',
  OTHER: 'domiciled in India',
};

export const ISA_GENERAL_V1 = {
  id: 'isa-general',
  version: 1,
  regime: 'ISA_GENERAL' as const,
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
    const law = m.details.personalLaw;
    if (!isIsaGeneralLaw(law)) throw new Error('WILL_TEMPLATE_LAW_MISMATCH');
    return willDocumentBlocks(m, ctx, `${STANDING[law]}, making this Will under the Indian Succession Act, 1925`);
  },
};
