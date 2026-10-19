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
import { XA_05 } from './xa-05-indian-financial-markets.js';
import { XA_06 } from './xa-06-securities-market-segments.js';
import { XA_07 } from './xa-07-introduction-to-investment.js';
import { XA_08 } from './xa-08-investing-in-stocks.js';
import { XA_09 } from './xa-09-fixed-income.js';
import { XA_10 } from './xa-10-derivatives.js';
import { XA_11 } from './xa-11-mutual-funds.js';
import { XA_12 } from './xa-12-portfolio-manager.js';
import { XA_13 } from './xa-13-aif.js';
import { XA_14 } from './xa-14-modern-portfolio-theory.js';
import { XA_15 } from './xa-15-portfolio-construction.js';
import { XA_16 } from './xa-16-performance-evaluation.js';
import { XA_17 } from './xa-17-operations.js';
import { XA_18 } from './xa-18-key-regulations.js';
import { XA_19 } from './xa-19-ethics.js';
import { XA_20 } from './xa-20-grievance-redress.js';
import { XB_01 } from './xb-01-insurance-basics.js';
import { XB_02 } from './xb-02-life-insurance.js';
import { XB_03 } from './xb-03-non-life-insurance.js';
import { XB_04 } from './xb-04-retirement-basics.js';
import { XB_05 } from './xb-05-retirement-products.js';
import { XB_06 } from './xb-06-retirement-misc.js';
import { XB_16 } from './xb-16-behavioural-finance-basics.js';
import { XB_17 } from './xb-17-behavioural-finance-practice.js';

export const NISM_LIBRARY: readonly KnowledgeEntry[] = [
  ...XA_01,
  ...XA_02,
  ...XA_03,
  ...XA_04,
  ...XA_05,
  ...XA_06,
  ...XA_07,
  ...XA_08,
  ...XA_09,
  ...XA_10,
  ...XA_11,
  ...XA_12,
  ...XA_13,
  ...XA_14,
  ...XA_15,
  ...XA_16,
  ...XA_17,
  ...XA_18,
  ...XA_19,
  ...XA_20,
  ...XB_01,
  ...XB_02,
  ...XB_03,
  ...XB_04,
  ...XB_05,
  ...XB_06,
  ...XB_16,
  ...XB_17,
];
