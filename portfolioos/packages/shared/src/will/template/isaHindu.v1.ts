/**
 * Hindus, Sikhs, Jains and Buddhists: wills are governed by Part VI of the
 * Indian Succession Act, 1925 through section 57. LOCKED (see common.v1.ts).
 */
import type { WillPayload } from '../schema.js';
import type { WillBlock } from '../ast.js';
import { willDocumentBlocks, type WillRenderContext } from './common.v1.js';
import { isIsaHinduLaw, type IsaHinduLaw } from './regime.v1.js';

const RELIGION: Record<IsaHinduLaw, string> = {
  HINDU: 'a Hindu',
  SIKH: 'a Sikh',
  JAIN: 'a Jain',
  BUDDHIST: 'a Buddhist',
};

export const ISA_HINDU_V1 = {
  id: 'isa-hindu',
  version: 1,
  regime: 'ISA_HINDU' as const,
  render(m: WillPayload, ctx: WillRenderContext): WillBlock[] {
    const law = m.details.personalLaw;
    if (!isIsaHinduLaw(law)) throw new Error('WILL_TEMPLATE_LAW_MISMATCH');
    return willDocumentBlocks(
      m,
      ctx,
      `${RELIGION[law]} by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act`,
    );
  },
};
