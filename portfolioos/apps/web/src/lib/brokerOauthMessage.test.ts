import { describe, expect, it } from 'vitest';
import { readBrokerOauthMessage } from './brokerOauthMessage';

const API = 'https://api.example.test';
const popup = {} as Window;
const other = {} as Window;
const good = { type: 'broker_oauth_result', payload: { ok: true, brokerId: 'zerodha' } };

describe('readBrokerOauthMessage', () => {
  it('accepts the result from our popup on the API origin', () => {
    expect(readBrokerOauthMessage({ origin: API, source: popup, data: good }, popup, API)).toEqual({
      ok: true,
      brokerId: 'zerodha',
      error: undefined,
    });
  });

  it('ignores a message from any other origin', () => {
    expect(
      readBrokerOauthMessage({ origin: 'https://evil.test', source: popup, data: good }, popup, API),
    ).toBeNull();
  });

  it('ignores a message from a window that is not our popup', () => {
    expect(readBrokerOauthMessage({ origin: API, source: other, data: good }, popup, API)).toBeNull();
    expect(readBrokerOauthMessage({ origin: API, source: popup, data: good }, null, API)).toBeNull();
  });

  it('ignores other message types and coerces a truthy non-boolean ok to false', () => {
    expect(
      readBrokerOauthMessage({ origin: API, source: popup, data: { type: 'x' } }, popup, API),
    ).toBeNull();
    expect(
      readBrokerOauthMessage(
        { origin: API, source: popup, data: { type: 'broker_oauth_result', payload: { ok: 'yes' } } },
        popup,
        API,
      )?.ok,
    ).toBe(false);
  });
});
