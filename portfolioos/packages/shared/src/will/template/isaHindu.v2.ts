/**
 * Hindus, Sikhs, Jains and Buddhists: wills are governed by Part VI of the
 * Indian Succession Act, 1925 through section 57. LOCKED (see common.v2.ts).
 * Same recital as v1; the document around it is v2.
 */
import type { WillPayload } from '../schema.js';
import type { WillBlockV2 } from '../astV2.js';
import type { WillRenderContext } from './common.v1.js';
import { willDocumentBlocksV2 } from './common.v2.js';
import { isIsaHinduLaw, type IsaHinduLaw } from './regime.v1.js';

const RELIGION: Record<IsaHinduLaw, string> = {
  HINDU: 'a Hindu',
  SIKH: 'a Sikh',
  JAIN: 'a Jain',
  BUDDHIST: 'a Buddhist',
};

export const ISA_HINDU_V2 = {
  id: 'isa-hindu',
  version: 2,
  regime: 'ISA_HINDU' as const,
  render(m: WillPayload, ctx: WillRenderContext): WillBlockV2[] {
    const law = m.details.personalLaw;
    if (!isIsaHinduLaw(law)) throw new Error('WILL_TEMPLATE_LAW_MISMATCH');
    return willDocumentBlocksV2(
      m,
      ctx,
      `${RELIGION[law]} by religion, to whom Part VI of the Indian Succession Act, 1925 applies in terms of section 57 of that Act`,
    );
  },
};
