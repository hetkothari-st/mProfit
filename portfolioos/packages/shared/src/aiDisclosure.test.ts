import { describe, it, expect } from 'vitest';
import { AI_USE_DISCLOSURE } from './aiDisclosure.js';

// SEBI IA Regulations 15(14) and 18(9): disclose the extent of AI use in advice,
// at the agreement stage and again whenever it changes.
describe('AI use disclosure', () => {
  const all = AI_USE_DISCLOSURE.points.map((p) => `${p.heading} ${p.body}`).join(' ');

  it('is versioned by date so a change can be shown again', () => {
    expect(AI_USE_DISCLOSURE.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('says which features use AI and that answers are not reviewed one by one', () => {
    expect(all).toMatch(/Assistant/);
    expect(all).toMatch(/Advisor page/);
    expect(all).toMatch(/does not review each answer/);
  });
  it('separates what the model writes from what the app calculates', () => {
    expect(all).toMatch(/calculators/);
    expect(all).toMatch(/approved list/);
  });
  it('names the provider and what data reaches it, without claiming zero retention', () => {
    expect(all).toMatch(/Anthropic/);
    expect(all).toMatch(/name and email/);
    expect(all).not.toMatch(/zero.retention|not stored by|never stored/i);
  });
  it('places responsibility on the registered adviser', () => {
    expect(all).toMatch(/solely responsible/);
  });
  it('gives a one-line summary for tight spaces', () => {
    expect(AI_USE_DISCLOSURE.summary.length).toBeLessThanOrEqual(140);
    expect(AI_USE_DISCLOSURE.summary).toMatch(/AI/);
  });
});
