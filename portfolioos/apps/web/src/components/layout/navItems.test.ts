import { describe, it, expect } from 'vitest';
import { NAV_SECTIONS, OVERVIEW_ITEMS, PLANNING_ITEMS } from './navItems';

describe('nav items', () => {
  it('Planning holds Goals, Will Maker, Tax Planning and AI connectors, in that order', () => {
    expect(PLANNING_ITEMS.map((i) => [i.label, i.to])).toEqual([
      ['Goals', '/goals'],
      ['Will Maker', '/will'],
      ['Tax Planning', '/tax'],
      ['AI connectors', '/settings/ai-connectors'],
    ]);
  });

  it('each Planning page is linked once in the whole sidebar', () => {
    const elsewhere = [...OVERVIEW_ITEMS, ...NAV_SECTIONS.flatMap((s) => s.items)].map((i) => i.to);
    for (const item of PLANNING_ITEMS) expect(elsewhere).not.toContain(item.to);
  });
});
