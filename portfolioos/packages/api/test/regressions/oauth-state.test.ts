import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { issueOAuthState, consumeOAuthState } from '../../src/lib/oauthState.js';

/**
 * SEC-06 / SEC-07 — account-linking CSRF on the Gmail and Kite OAuth flows.
 *
 * Gmail set `state: userId` on the auth URL and then never read it back: the
 * callback schema parsed `{ code }` only. Kite had no state at all. In both
 * cases an attacker could complete consent with their OWN third-party
 * account, capture the code/request token, and get a logged-in victim to
 * submit it — binding the attacker's mailbox or broker account to the
 * victim's, after which every scheduled sync feeds attacker-controlled data
 * into the victim's financial records.
 *
 * services/brokerOauth already did this correctly; these two paths did not.
 */

const SRC = join(__dirname, '..', '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('SEC-06/07: OAuth state is single-use and bound to the issuing user', () => {
  it('round-trips the issuing user', async () => {
    const state = await issueOAuthState('user-a', 'gmail');
    expect(await consumeOAuthState(state, 'gmail')).toBe('user-a');
  });

  it('is single-use — a replayed state does not validate twice', async () => {
    const state = await issueOAuthState('user-a', 'gmail');
    expect(await consumeOAuthState(state, 'gmail')).toBe('user-a');
    expect(await consumeOAuthState(state, 'gmail')).toBeNull();
  });

  it('does not validate across purposes', async () => {
    const state = await issueOAuthState('user-a', 'gmail');
    expect(await consumeOAuthState(state, 'kite')).toBeNull();
  });

  it('rejects an unknown or empty state', async () => {
    expect(await consumeOAuthState('never-issued', 'gmail')).toBeNull();
    expect(await consumeOAuthState('', 'gmail')).toBeNull();
  });

  it('issues unguessable, non-repeating values', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const s = await issueOAuthState('user-a', 'gmail');
      expect(s).toMatch(/^[0-9a-f]{64}$/);
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });
});

describe('SEC-06: the Gmail callback verifies state', () => {
  const controller = read('controllers/gmail.controller.ts');

  it('requires state in the callback payload', () => {
    expect(controller).toMatch(/state:\s*z\.string\(\)\.min\(1/);
  });

  it('consumes the state and compares it to the caller', () => {
    expect(controller).toContain("consumeOAuthState(state, 'gmail')");
    expect(controller).toContain('stateUserId !== userId');
  });

  it('no longer sends the bare userId as state', () => {
    expect(read('connectors/gmail.connector.ts')).not.toContain('state: userId');
  });
});

describe('SEC-07: the Kite callback verifies state', () => {
  const controller = read('controllers/connectors.controller.ts');

  it('requires state in the callback payload', () => {
    expect(controller).toMatch(/state:\s*z\.string\(\)\.min\(1/);
  });

  it('consumes the state and compares it to the caller', () => {
    expect(controller).toContain("consumeOAuthState(body.state, 'kite')");
    expect(controller).toContain('stateUserId !== userId');
  });

  it('puts the state on the login URL', () => {
    expect(read('connectors/zerodha.connector.ts')).toContain('state=${encodeURIComponent(state)}');
  });
});
