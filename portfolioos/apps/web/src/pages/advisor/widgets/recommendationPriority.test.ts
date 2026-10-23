import { describe, it, expect } from 'vitest';
import { priorityTone } from './recommendationPriority';

// The engine's priorities start at 5 (tax harvest) and run to 55 (risk
// profile review). Against the old ≤1 / ≤3 thresholds every card read
// "When convenient".
describe('priorityTone follows the engine priority bands', () => {
  it.each([
    [5, 'Do first'],
    [10, 'Do first'],
    [15, 'Soon'],
    [20, 'Soon'],
    [30, 'Soon'],
    [35, 'When convenient'],
    [55, 'When convenient'],
  ])('priority %i → %s', (priority, label) => {
    expect(priorityTone(priority).label).toBe(label);
  });
});
