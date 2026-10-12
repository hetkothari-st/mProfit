/**
 * Which v1 will template governs a testator, by personal law. LOCKED (see common.v1.ts):
 * this mapping decides the statute a will is made under.
 */
import type { PersonalLaw } from '../schema.js';

export type WillRegime = 'ISA_HINDU' | 'ISA_GENERAL';

/** Wills governed by Part VI of the Indian Succession Act, 1925 through section 57. */
export const ISA_HINDU_LAWS = ['HINDU', 'SIKH', 'JAIN', 'BUDDHIST'] as const;
export type IsaHinduLaw = (typeof ISA_HINDU_LAWS)[number];

/** Wills made directly under the Indian Succession Act, 1925. */
export const ISA_GENERAL_LAWS = ['CHRISTIAN', 'PARSI', 'OTHER'] as const;
export type IsaGeneralLaw = (typeof ISA_GENERAL_LAWS)[number];

export function isIsaHinduLaw(law: PersonalLaw | null): law is IsaHinduLaw {
  return (ISA_HINDU_LAWS as readonly string[]).includes(law ?? '');
}

export function isIsaGeneralLaw(law: PersonalLaw | null): law is IsaGeneralLaw {
  return (ISA_GENERAL_LAWS as readonly string[]).includes(law ?? '');
}

/** Muslim personal law and an unset law have no template (null). */
export function regimeForLaw(law: PersonalLaw | null): WillRegime | null {
  if (isIsaHinduLaw(law)) return 'ISA_HINDU';
  if (isIsaGeneralLaw(law)) return 'ISA_GENERAL';
  return null;
}
