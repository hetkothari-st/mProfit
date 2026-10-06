import { describe, it, expect, vi } from 'vitest';

/**
 * What the adviser turn sends to Anthropic. The full name and email used to
 * ride along inside the serialized context, and anything the client pasted
 * into the chat went out verbatim.
 */

vi.mock('../lib/prisma.js', () => ({ prisma: {} }));

const { buildUserTurn, promptSafeContext } = await import('./claudeClient.js');

function context(profile: Record<string, unknown>) {
  return { userProfile: profile, scope: { readableUserIds: ['u1'] } } as never;
}

const ADVISOR = { factsText: 'Client: Asha', facts: null, financialYear: '2026-27', knowledge: [] } as never;

describe('assistant prompt privacy', () => {
  it('never serializes identity fields from the profile', () => {
    const turn = buildUserTurn(
      'How is my portfolio doing?',
      context({
        firstName: 'Asha',
        fullName: 'Asha Rao',
        email: 'asha@example.com',
        phone: '9876543210',
        pan: 'ABCDE1234F',
        totalNetWorth: 1250000,
      }),
      ADVISOR,
    );
    expect(turn).not.toContain('Asha Rao');
    expect(turn).not.toContain('asha@example.com');
    expect(turn).not.toContain('9876543210');
    expect(turn).not.toContain('ABCDE1234F');
    expect(turn).toContain('"firstName":"Asha"');
    expect(turn).toContain('1250000');
  });

  it('does not mutate the context the caller stores as the advice record', () => {
    const ctx = context({ firstName: 'Asha', email: 'asha@example.com' });
    promptSafeContext(ctx);
    expect((ctx as { userProfile: Record<string, unknown> }).userProfile.email).toBe('asha@example.com');
  });

  it('redacts a PAN, phone and account number the client typed', () => {
    const turn = buildUserTurn(
      'My PAN is ABCDE1234F, call me on 98765 43210, account no 123456789012',
      context({ firstName: 'Asha' }),
      ADVISOR,
    );
    const question = turn.slice(turn.indexOf('<question>'));
    expect(question).not.toContain('ABCDE1234F');
    expect(question).not.toContain('98765 43210');
    expect(question).not.toContain('123456789012');
    expect(question).toContain('1234F');
  });

  it('leaves the computed context numbers intact', () => {
    // A raw 10-digit amount is phone-shaped; the redactor must not see it.
    const turn = buildUserTurn('ok', context({ firstName: 'Asha', totalNetWorth: 7234567890 }), ADVISOR);
    expect(turn).toContain('7234567890');
  });
});
