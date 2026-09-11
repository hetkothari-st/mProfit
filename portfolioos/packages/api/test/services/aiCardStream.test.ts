import { describe, it, expect } from 'vitest';
import { CardStreamFilter } from '../../src/ai/cardStream.js';

// The adviser may end an answer with a ```json card block. The app renders
// the card from its own event, so the raw JSON must never stream into the
// chat bubble — but an ordinary code block must still come through.

function run(chunks: string[]): string {
  const f = new CardStreamFilter();
  let out = '';
  for (const c of chunks) out += f.push(c);
  return out + f.flush();
}

describe('CardStreamFilter', () => {
  it('passes plain text straight through', () => {
    const f = new CardStreamFilter();
    expect(f.push('Keep your ')).toBe('Keep your ');
    expect(f.push('SIPs running.')).toBe('SIPs running.');
    expect(f.flush()).toBe('');
  });

  it('holds back a trailing card, even when the fence is split across chunks', () => {
    expect(run(['Answer.\n\n``', '`json {"cardType":"stat",', '"data":{"label":"x"}} ```'])).toBe('Answer.\n\n');
  });

  it('releases a json block that turns out not to be a card', () => {
    const text = 'See:\n```json\n{"x":1}\n```\nMore text';
    expect(run([text.slice(0, 9), text.slice(9)])).toBe(text);
  });

  it('does not swallow text that merely ends in backticks', () => {
    expect(run(['Use the `', 'SIP` button'])).toBe('Use the `SIP` button');
  });
});
