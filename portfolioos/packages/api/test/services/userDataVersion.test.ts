import { describe, it, expect } from 'vitest';
import { markUserDataChanged, shouldMarkUserData, userDataVersion } from '../../src/lib/userDataVersion.js';

// Anything cached about a user's finances (the AI adviser's facts) is keyed
// to this version, so a write to their data is seen on the very next read.

describe('userDataVersion', () => {
  it("changes a user's version on their own write, and nobody else's", () => {
    const a = userDataVersion(['uv-a']);
    const b = userDataVersion(['uv-b']);
    markUserDataChanged('uv-a');
    expect(userDataVersion(['uv-a'])).not.toBe(a);
    expect(userDataVersion(['uv-b'])).toBe(b);
  });

  it('covers every member of a household view', () => {
    const household = userDataVersion(['uv-c', 'uv-d']);
    markUserDataChanged('uv-d');
    expect(userDataVersion(['uv-c', 'uv-d'])).not.toBe(household);
  });

  it('treats a write with no known user (a background job) as a change for everyone', () => {
    const v = userDataVersion(['uv-e']);
    markUserDataChanged(null);
    expect(userDataVersion(['uv-e'])).not.toBe(v);
  });
});

describe('shouldMarkUserData', () => {
  it('marks writes to financial data', () => {
    for (const [model, op] of [
      ['Transaction', 'create'],
      ['BankAccount', 'update'],
      ['Loan', 'deleteMany'],
      ['InsurancePolicy', 'upsert'],
      ['Goal', 'createMany'],
      ['HoldingProjection', 'updateMany'],
    ] as const) {
      expect(shouldMarkUserData(model, op), `${model}.${op}`).toBe(true);
    }
  });

  it('ignores reads, and the bookkeeping every chat turn writes', () => {
    expect(shouldMarkUserData('Transaction', 'findMany')).toBe(false);
    expect(shouldMarkUserData('Loan', 'count')).toBe(false);
    for (const model of ['AiConversation', 'AiUsage', 'AiChatSession', 'LlmSpend', 'AuditLog', 'HealthScoreSnapshot']) {
      expect(shouldMarkUserData(model, 'create'), model).toBe(false);
    }
  });
});
