/**
 * The NISM Investment Adviser syllabus — Series X-A (Level 1, June 2025
 * edition) and X-B (Level 2, December 2025 edition) — in our own words, one
 * file per chapter. Nothing is copied from the workbooks (© NISM): each entry
 * restates one idea and credits its chapter. Entries that state a rate, limit
 * or regulation carry `asOf` = the edition; where the app's own services
 * compute a rule, the service wins.
 */
import type { KnowledgeEntry } from '../library.js';
import { XA_01 } from './xa-01-financial-planning.js';
import { XA_02 } from './xa-02-time-value-of-money.js';
import { XA_03 } from './xa-03-financial-position.js';
import { XA_04 } from './xa-04-debt-management.js';
import { XB_16 } from './xb-16-behavioural-finance-basics.js';
import { XB_17 } from './xb-17-behavioural-finance-practice.js';

export const NISM_LIBRARY: readonly KnowledgeEntry[] = [
  ...XA_01,
  ...XA_02,
  ...XA_03,
  ...XA_04,
  ...XB_16,
  ...XB_17,
];
