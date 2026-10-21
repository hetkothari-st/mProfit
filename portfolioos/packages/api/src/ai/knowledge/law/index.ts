/**
 * Current law, in our own words: the Income-tax Act 2025 as amended by the
 * Finance Act 2026, and SEBI's rules for advisers and the products they
 * recommend. Where a rule changed after the NISM workbooks, the NISM entry
 * points here through `supersededBy`.
 */
import type { KnowledgeEntry } from '../library.js';
import { FA2026_CHANGES } from './fa2026-changes.js';
import { ITA25_BASICS } from './ita25-basics.js';
import { ITA25_CAPITAL_GAINS } from './ita25-capital-gains.js';
import { ITA25_INCOME } from './ita25-income.js';
import { ITA25_TRADING } from './ita25-trading.js';
import { ITA25_NRI } from './ita25-nri.js';
import { SEBI_IA } from './sebi-ia.js';
import { SEBI_MF } from './sebi-mf.js';
import { SEBI_PMS_AIF_RA } from './sebi-pms-aif-ra.js';

export const LAW_LIBRARY: readonly KnowledgeEntry[] = [...FA2026_CHANGES, ...ITA25_BASICS, ...ITA25_CAPITAL_GAINS, ...ITA25_INCOME, ...ITA25_TRADING, ...ITA25_NRI, ...SEBI_IA, ...SEBI_MF, ...SEBI_PMS_AIF_RA];
