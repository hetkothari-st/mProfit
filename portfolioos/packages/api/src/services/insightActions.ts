import type { InsightCategory } from './analytics.insights.js';

/**
 * A neutral, code-derived next step for an insight card. SEBI constraint:
 * this is NAVIGATION to the user's own data / a neutral worksheet — never a
 * recommendation to buy/sell/rebalance. The mapping is deterministic (not
 * LLM-generated) so it can't drift into prescriptive advice and works on
 * cached cards too.
 */
export interface InsightAction {
  kind: 'NAVIGATE';
  label: string;
  href: string;
}

const ACTIONS: Record<InsightCategory, InsightAction> = {
  tax_optimisation: { kind: 'NAVIGATE', label: 'View tax-harvest worksheet', href: '/tax' },
  risk_concentration: { kind: 'NAVIGATE', label: 'Review concentration', href: '/analytics#concentration' },
  diversification: { kind: 'NAVIGATE', label: 'View allocation', href: '/analytics#allocation' },
  underperformers: { kind: 'NAVIGATE', label: 'Review holdings', href: '/stocks' },
  sector_tilt: { kind: 'NAVIGATE', label: 'View sector breakdown', href: '/analytics#sector' },
  cash_drag: { kind: 'NAVIGATE', label: 'Review cash flow', href: '/cashflows' },
};

export function actionForCategory(category: InsightCategory): InsightAction | null {
  return ACTIONS[category] ?? null;
}
