import { describe, it, expect } from 'vitest';
import { actionForCategory } from './insightActions.js';

describe('actionForCategory', () => {
  it('maps tax_optimisation to the tax-harvest worksheet', () => {
    const a = actionForCategory('tax_optimisation');
    expect(a).not.toBeNull();
    expect(a!.href).toBe('/tax');
    expect(a!.kind).toBe('NAVIGATE');
    expect(a!.label.length).toBeGreaterThan(0);
  });

  it('gives every insight category a navigation CTA', () => {
    const cats = [
      'diversification', 'tax_optimisation', 'underperformers',
      'cash_drag', 'sector_tilt', 'risk_concentration',
    ] as const;
    for (const c of cats) {
      const a = actionForCategory(c);
      expect(a, `missing action for ${c}`).not.toBeNull();
      expect(a!.href.startsWith('/'), `bad href for ${c}`).toBe(true);
    }
  });

  it('CTAs are neutral navigation — no prescriptive verbs', () => {
    const banned = /\b(buy|sell|trim|reduce|rebalance|exit|book|redeploy|switch)\b/i;
    const cats = [
      'diversification', 'tax_optimisation', 'underperformers',
      'cash_drag', 'sector_tilt', 'risk_concentration',
    ] as const;
    for (const c of cats) {
      expect(banned.test(actionForCategory(c)!.label), `prescriptive label for ${c}`).toBe(false);
    }
  });
});
